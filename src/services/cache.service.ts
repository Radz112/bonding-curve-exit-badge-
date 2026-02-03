import NodeCache from 'node-cache';
import { CachedResult } from '../types';

// Immutable cache — once a wallet jeeted, that fact never changes
const cache = new NodeCache({
  stdTTL: 0,
  checkperiod: 0,
  useClones: false,
  maxKeys: 100000,
});

function makeKey(wallet: string, token: string): string {
  return `${wallet}:${token}`;
}

export function getCache(wallet: string, token: string): CachedResult | undefined {
  return cache.get<CachedResult>(makeKey(wallet, token));
}

export function setCache(wallet: string, token: string, data: CachedResult): void {
  cache.set(makeKey(wallet, token), data);
}

export function getCacheStats(): { keys: number; hits: number; misses: number } {
  const stats = cache.getStats();
  return { keys: cache.keys().length, hits: stats.hits, misses: stats.misses };
}

export function clearCache(): void {
  cache.flushAll();
}
