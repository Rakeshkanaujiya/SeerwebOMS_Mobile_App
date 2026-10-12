import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from 'apiurl';

export type PartyProductHistory = Record<string, { quantity: number; order_count: number }>;

const TTL_MS = 5 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 30 * 1000;
const cache = new Map<string, { value: PartyProductHistory; expiresAt: number }>();
const pending = new Map<string, Promise<PartyProductHistory>>();
const revisions = new Map<string, number>();
const recentFailures = new Map<string, { error: PartyProductHistoryError; retryAt: number }>();

export class PartyProductHistoryError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
    readonly responseBody?: string
  ) {
    super(message);
    this.name = 'PartyProductHistoryError';
  }
}

function cacheKey(token: string, dealerId: string | number, partyId: string | number) {
  return `${token}\u0000${dealerId}\u0000${partyId}`;
}

export async function cachedPartyProductHistory(
  dealerId: string | number,
  partyId: string | number
): Promise<PartyProductHistory | undefined> {
  const token = (await AsyncStorage.getItem('token')) || '';
  if (!token) return undefined;
  const entry = cache.get(cacheKey(token, dealerId, partyId));
  return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
}

export async function invalidatePartyProductHistory(
  dealerId: string | number,
  partyId: string | number
) {
  const token = (await AsyncStorage.getItem('token')) || '';
  if (!token) return;
  const key = cacheKey(token, dealerId, partyId);
  cache.delete(key);
  revisions.set(key, (revisions.get(key) || 0) + 1);
  recentFailures.delete(key);
  pending.delete(key);
}

export async function fetchPartyProductHistory(
  dealerId: string | number,
  partyId: string | number
): Promise<PartyProductHistory> {
  const token = (await AsyncStorage.getItem('token')) || '';
  if (!token) throw new PartyProductHistoryError('Authentication required', '');

  const key = cacheKey(token, dealerId, partyId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const running = pending.get(key);
  if (running) return running;

  const recentFailure = recentFailures.get(key);
  if (recentFailure && recentFailure.retryAt > Date.now()) throw recentFailure.error;
  recentFailures.delete(key);

  const endpoint = `${apiUrl}/products/sales-history?dealerid=${encodeURIComponent(
    String(dealerId)
  )}&retailer_id=${encodeURIComponent(String(partyId))}`;

  const revision = revisions.get(key) || 0;
  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch (cause) {
      const error = Object.assign(
        new PartyProductHistoryError(
          'Customer sales history request could not reach the API',
          endpoint
        ),
        { cause }
      );
      recentFailures.set(key, { error, retryAt: Date.now() + FAILURE_COOLDOWN_MS });
      throw error;
    }

    const rawBody = await response.text();
    if (!response.ok) {
      const error = new PartyProductHistoryError(
        `Customer sales history request failed with HTTP ${response.status}`,
        endpoint,
        response.status,
        rawBody
      );
      recentFailures.set(key, { error, retryAt: Date.now() + FAILURE_COOLDOWN_MS });
      throw error;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch (cause) {
      const error = Object.assign(
        new PartyProductHistoryError(
          'Customer sales history returned invalid JSON',
          endpoint,
          response.status,
          rawBody
        ),
        { cause }
      );
      recentFailures.set(key, { error, retryAt: Date.now() + FAILURE_COOLDOWN_MS });
      throw error;
    }

    const validPayload =
      payload !== null &&
      typeof payload === 'object' &&
      (Array.isArray(payload)
        ? payload.length === 0
        : Object.entries(payload).every(
            ([id, entry]) =>
              /^\d+$/.test(id) &&
              entry !== null &&
              typeof entry === 'object' &&
              typeof entry.quantity === 'number' &&
              Number.isFinite(entry.quantity) &&
              Number.isInteger(entry.order_count) &&
              entry.order_count >= 0
          ));
    if (!validPayload) {
      const error = new PartyProductHistoryError(
        'Customer sales history returned an invalid result',
        endpoint,
        response.status,
        rawBody
      );
      recentFailures.set(key, { error, retryAt: Date.now() + FAILURE_COOLDOWN_MS });
      throw error;
    }
    const value: PartyProductHistory = Array.isArray(payload)
      ? {}
      : payload && typeof payload === 'object'
        ? (payload as PartyProductHistory)
        : {};
    // An order submission can invalidate history while this request is in flight.
    if (revision === (revisions.get(key) || 0) && token === (await AsyncStorage.getItem('token'))) {
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    }
    recentFailures.delete(key);
    return value;
  })();

  pending.set(key, request);
  try {
    return await request;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}
