/* services/api.ts - Cached API with 5min TTL */
import { apiUrl } from 'apiurl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCache, setCache } from '../cache';

const IN_FLIGHT = new Map<string, Promise<any>>();

/**
 * Build cache key: endpoint + params + auth flag.
 * Handles query params in endpoint (e.g., ?dealerid=123).
 */
function buildKey(endpoint: string, token?: string): string {
  if (!token) return `${endpoint}_public`;
  let identity = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    identity = Math.imul(identity ^ token.charCodeAt(index), 16777619);
  }
  return `${endpoint}_auth_${(identity >>> 0).toString(36)}`;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly details: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parseResponseBody(res: Response, endpoint: string) {
  const text = await res.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) {
        throw new ApiRequestError('Server returned invalid JSON', {
          endpoint,
          method: 'GET',
          status: res.status,
          cause: 'invalid_json',
        });
      }
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : typeof data === 'string' && data
          ? data
          : `Request failed with status ${res.status}`;

    throw new ApiRequestError(`HTTP ${res.status}: ${message.slice(0, 300)}`, {
      endpoint,
      method: 'GET',
      status: res.status,
      cause: 'http',
      requestId: res.headers.get('X-Request-ID'),
    });
  }

  return data ?? [];
}

async function request(endpoint: string, token?: string) {
  const url = `${apiUrl}${endpoint}`;
  const started = Date.now();
  const controller = new AbortController();
  let status: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race the entire response body too: a server can send headers then stall.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiRequestError('Request timed out after 30 seconds', {
          endpoint: url,
          method: 'GET',
          status,
          cause: 'timeout',
          elapsedMs: Date.now() - started,
        })
      );
      controller.abort();
    }, 30000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        status = res.status;
        return await parseResponseBody(res, url);
      })(),
    ]);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      error.details.elapsedMs = Date.now() - started;
      throw error;
    }
    throw new ApiRequestError(error instanceof Error ? error.message : String(error), {
      endpoint: url,
      method: 'GET',
      status,
      cause: 'network_or_body_read',
      nativeCause: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      elapsedMs: Date.now() - started,
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Protected OMS endpoints must never silently become anonymous requests after
 * an app restart. Screens can still pass a token explicitly, while the shared
 * client resolves the persisted session for calls that are made during boot.
 */
async function resolveToken(token?: string): Promise<string | undefined> {
  if (token) return token;
  return (await AsyncStorage.getItem('token')) || undefined;
}

/**
 * Cached wrapper for apiGet. Checks cache first, fetches if miss/expired.
 */
export async function cachedGet(endpoint: string, token?: string): Promise<any> {
  const startedAt = Date.now();
  const authenticatedToken = await resolveToken(token);
  const key = buildKey(endpoint, authenticatedToken);
  let data = getCache(key);

  if (data !== null) {
    if (__DEV__ && /^\/(retailers|products|orders)(\/|\?|$)/.test(endpoint)) {
      console.info(`[Performance][API] ${endpoint.split('?')[0]} cache=hit elapsedMs=${Date.now() - startedAt}`);
    }
    return data;
  }

  if (data === null) {
    const existing = IN_FLIGHT.get(key);
    if (existing) {
      const joined = await existing;
      if (__DEV__ && /^\/(retailers|products|orders)(\/|\?|$)/.test(endpoint)) {
        console.info(`[Performance][API] ${endpoint.split('?')[0]} cache=deduped elapsedMs=${Date.now() - startedAt}`);
      }
      return joined;
    }

    const pending = request(endpoint, authenticatedToken)
      .then((freshData) => {
        setCache(key, freshData); // Cache for 5min
        if (__DEV__ && /^\/(retailers|products|orders)(\/|\?|$)/.test(endpoint)) {
          console.info(`[Performance][API] ${endpoint.split('?')[0]} cache=miss elapsedMs=${Date.now() - startedAt}`);
        }
        return freshData;
      })
      .finally(() => {
        IN_FLIGHT.delete(key);
      });

    IN_FLIGHT.set(key, pending);
    data = await pending;
  }

  return data;
}

// Original apiGet (uncached, for mutations/writes)
export async function apiGet(endpoint: string, token?: string) {
  return request(endpoint, await resolveToken(token));
}

// Utils: clear on logout/cart-clear etc.
export { clearCache } from '../cache';
