import { hasCache, getCache, setCache, getCacheStats, clearCache } from './services/cache.service';
import { CachedResult, CurveExitResult } from './types';

function test() {
  clearCache();

  const wallet = 'TestWallet123';
  const token = 'TestToken456';

  // Test 1: Empty cache
  console.assert(!hasCache(wallet, token), 'Should not have cache initially');
  console.log('✅ hasCache returns false for empty');

  // Test 2: Set cache
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
    },
    badge_base64: 'data:image/jpeg;base64,test',
    cached_at: Date.now(),
  };
  setCache(wallet, token, mockResult);
  console.log('✅ setCache completed');

  // Test 3: Retrieve cache
  console.assert(hasCache(wallet, token), 'Should have cache after set');
  const cached = getCache(wallet, token);
  console.assert(cached?.result.exit_type === 'Curve Jeet', 'Should retrieve correct data');
  console.log('✅ getCache retrieves correct data');

  // Test 4: Case insensitivity
  console.assert(hasCache(wallet.toLowerCase(), token.toUpperCase()), 'Should be case-insensitive');
  console.log('✅ Cache key is case-insensitive');

  // Test 5: Stats
  const stats = getCacheStats();
  console.assert(stats.keys === 1, 'Should have 1 key');
  console.log(`✅ Stats: ${stats.keys} keys, ${stats.hits} hits, ${stats.misses} misses`);

  clearCache();
  console.log('✅ Phase 3 passed');
}

test();
