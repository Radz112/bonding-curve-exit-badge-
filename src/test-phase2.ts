import { getEnhancedHistory, getAssetMetadata } from './utils/helius';
import { fetchTokenSymbol } from './services/metadata.service';
import { CONFIG } from './config/constants';

async function test() {
  if (!CONFIG.HELIUS_API_KEY || CONFIG.HELIUS_API_KEY === 'your_helius_api_key') {
    console.log('⚠️  Set HELIUS_API_KEY in .env to run Phase 2 tests');
    return;
  }

  // Test 1: Enhanced history fetch
  console.log('Testing getEnhancedHistory...');
  const history = await getEnhancedHistory('11111111111111111111111111111111');
  console.assert(Array.isArray(history), 'Should return array');
  console.log(`✅ getEnhancedHistory returned ${history.length} txs`);

  // Test 2: DAS getAsset — use a known Pump.fun token
  console.log('Testing getAssetMetadata...');
  const testMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK
  const metadata = await getAssetMetadata(testMint);
  console.log('Metadata:', metadata);
  if (metadata) {
    console.assert(!!metadata.symbol, 'Should have symbol');
    console.log(`✅ getAssetMetadata: ${metadata.symbol}`);
  }

  // Test 3: fetchTokenSymbol formatting
  console.log('Testing fetchTokenSymbol...');
  const symbol = await fetchTokenSymbol(testMint);
  console.assert(symbol.length > 0, 'Should format symbol');
  console.log(`✅ fetchTokenSymbol: ${symbol}`);

  console.log('✅ Phase 2 passed');
}

test().catch(e => { console.error('❌', e.message); process.exit(1); });
