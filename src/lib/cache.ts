/**
 * cache.ts — OPTIMIZED
 *
 * Fixes:
 * 1. Max cache size (50 entries) — evicts oldest on overflow, prevents memory leak
 * 2. invalidateCaches uses Set iteration directly — no Array.from() allocation
 * 3. Insertion order tracked for LRU-style eviction
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 min
const MAX_CACHE_SIZE = 50;           // ✅ memory guard

export function getCache(key: string): any | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    CACHE.delete(key);
    return null;
  }
  // Refresh insertion order so capacity eviction drops the least recently used
  // entry rather than the oldest value that happened to be loaded.
  CACHE.delete(key);
  CACHE.set(key, entry);
  return entry.data;
}

export function setCache(key: string, data: any, ttl: number = DEFAULT_TTL): void {
  // ✅ Evict oldest entry when at capacity
  if (CACHE.size >= MAX_CACHE_SIZE && !CACHE.has(key)) {
    const firstKey = CACHE.keys().next().value;
    if (firstKey) CACHE.delete(firstKey);
  }
  CACHE.set(key, { data, timestamp: Date.now(), ttl });
}

export function hasCache(key: string): boolean {
  return getCache(key) !== null;
}

export function clearCache(key?: string): void {
  if (key) CACHE.delete(key);
  else CACHE.clear();
}

// ✅ Direct Map iteration — no Array.from() allocation
export function invalidateCaches(pattern?: string): void {
  if (!pattern) { CACHE.clear(); return; }
  for (const key of CACHE.keys()) {
    if (key.startsWith(pattern)) CACHE.delete(key);
  }
}

export { CACHE, DEFAULT_TTL };
