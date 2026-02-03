import { getCache, setCache, getCacheStats, clearCache } from './services/cache.service';
import { CachedResult } from './types';

function test() {
  clearCache();

  const wallet = 'TestWallet123';
  const token = 'TestToken456';

  console.assert(!getCache(wallet, token), 'Should not have cache initially');
  console.log('getCache returns undefined for empty');

  const mockResult: CachedResult = {
    result: {
      wallet,
      token,
      token_symbol: '$TEST',
      exit_type: 'Curve Jeet',
      exit_venue: 'Pump.fun Bonding Curve',
      description: 'Test',
      confidence: 'HIGH',
      sell_signature: 'sig123',
      sell_timestamp: 1700000000,
      badge_color: 'red',
      badge_title: 'PRE-MIGRATION EXIT',
    },
    badge_base64: 'data:image/jpeg;base64,test',
    cached_at: Date.now(),
  };
  setCache(wallet, token, mockResult);
  console.log('setCache completed');

  const cached = getCache(wallet, token);
  console.assert(cached?.result.exit_type === 'Curve Jeet', 'Should retrieve correct data');
  console.log('getCache retrieves correct data');

  // Solana addresses are case-sensitive — different case = different key
  console.assert(!getCache(wallet.toLowerCase(), token), 'Case-sensitive: lowercase is a miss');
  console.log('Cache key is case-sensitive');

  const stats = getCacheStats();
  console.assert(stats.keys === 1, 'Should have 1 key');
  console.log(`Stats: ${stats.keys} keys, ${stats.hits} hits, ${stats.misses} misses`);

  clearCache();
  console.log('Phase 3 passed');
}

test();
