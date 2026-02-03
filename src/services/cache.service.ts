import NodeCache from 'node-cache';
import { CachedResult } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// IMMUTABLE CACHE — Results cached forever (stdTTL: 0)
// ═══════════════════════════════════════════════════════════════════════════
// Once a wallet has "Jeeted" a token, that fact never changes.
// Caching saves Helius API credits on repeat queries.

const cache = new NodeCache({
  stdTTL: 0,           // No expiration — immutable
  checkperiod: 0,      // Disable periodic cleanup
  useClones: false,    // Store references (faster, safe since immutable)
  maxKeys: 100000,     // Cap at 100k entries (~50MB RAM estimate)
});

/**
 * Generate cache key from wallet + token.
 */
function makeKey(wallet: string, token: string): string {
  return `${wallet.toLowerCase()}:${token.toLowerCase()}`;
}

/**
 * Check if result exists in cache.
 */
export function hasCache(wallet: string, token: string): boolean {
  return cache.has(makeKey(wallet, token));
}

/**
 * Retrieve cached result.
 */
export function getCache(wallet: string, token: string): CachedResult | undefined {
  return cache.get<CachedResult>(makeKey(wallet, token));
}

/**
 * Store result in cache (permanent).
 */
export function setCache(wallet: string, token: string, data: CachedResult): void {
  cache.set(makeKey(wallet, token), data);
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): { keys: number; hits: number; misses: number } {
  const stats = cache.getStats();
  return {
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
  };
}

/**
 * Manual cache clear (for admin/testing only).
 */
export function clearCache(): void {
  cache.flushAll();
}
