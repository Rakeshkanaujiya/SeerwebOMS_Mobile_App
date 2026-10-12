import { useCallback, useEffect, useState } from 'react';
import { cachedGet } from './services/api';
import { invalidateCaches } from './cache';
import { logScreenError } from './logging';

export function useDebouncedValue(value: string, delay = 300) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return result;
}

export function useServerPage<T>(endpoint: string | null, collection: 'products' | 'retailers') {
  const [position, setPosition] = useState({ endpoint, page: 1 });
  const page = position.endpoint === endpoint ? position.page : 1;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; rows: T[]; total: number; hasMore: boolean; loading: boolean; error: string; filters: { brands: string[]; categories: string[] } }>({
    key: '', rows: [], total: 0, hasMore: false, loading: false, error: '', filters: { brands: [], categories: [] },
  });
  const key = `${endpoint}|${page}|${revision}`;
  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    setState(s => ({ ...s, key, rows: [], loading: true, error: '' }));
    const requestStartedAt = Date.now();
    void cachedGet(`${endpoint}&page=${page}&per_page=30`).then(data => {
      if (!data?.pagination || !Array.isArray(data[collection])) throw new Error('Server pagination is unavailable. Deploy the updated backend.');
      if (__DEV__) console.info(`[Performance][${collection}] page=${page} rows=${data[collection].length} elapsedMs=${Date.now() - requestStartedAt}`);
      if (active) setState({ key, rows: data[collection], total: Number(data.pagination.total), hasMore: Boolean(data.pagination.has_more), loading: false, error: '', filters: data.filters ?? { brands: [], categories: [] } });
    }).catch(error => {
      if (active) {
        logScreenError(`ServerPage.${collection}`, error);
        setState(s => ({ ...s, key, loading: false, error: error instanceof Error ? error.message : 'Unable to load data' }));
      }
    });
    return () => { active = false; };
  }, [endpoint, collection, page, revision, key]);
  const current = state.key === key;
  const go = useCallback((next: number) => setPosition({ endpoint, page: Math.max(1, next) }), [endpoint]);
  const refresh = useCallback(() => {
    invalidateCaches(collection === 'products' ? '/products' : '/retailers');
    setPosition({ endpoint, page: 1 });
    setRevision(v => v + 1);
  }, [collection, endpoint]);
  return { ...state, rows: current ? state.rows : [], loading: Boolean(endpoint) && (!current || state.loading), error: current ? state.error : '', page,
    go,
    refresh,
  };
}
