import { PROGRAM_IDS, EXIT_REGISTRY, ATTRIBUTION_WEIGHTS, CONFIG, HELIUS_SOURCE_MAP } from './config/constants';

const tests = [
  // Registry completeness
  () => { if (Object.keys(EXIT_REGISTRY).length !== 3) throw new Error('Should have 3 venues'); },
  () => { if (!EXIT_REGISTRY[PROGRAM_IDS.PUMP_FUN]) throw new Error('Missing PUMP_FUN'); },
  () => { if (!EXIT_REGISTRY[PROGRAM_IDS.PUMP_SWAP]) throw new Error('Missing PUMP_SWAP'); },
  () => { if (!EXIT_REGISTRY[PROGRAM_IDS.RAYDIUM_V4]) throw new Error('Missing RAYDIUM_V4'); },

  // Attribution weights
  () => { if (ATTRIBUTION_WEIGHTS.HELIUS_SOURCE !== 100) throw new Error('HELIUS_SOURCE should be 100'); },
  () => { if (ATTRIBUTION_WEIGHTS.INNER_INSTRUCTION !== 50) throw new Error('INNER_INSTRUCTION should be 50'); },
  () => { if (ATTRIBUTION_WEIGHTS.INSTRUCTION !== 10) throw new Error('INSTRUCTION should be 10'); },

  // Source map coverage
  () => { if (!HELIUS_SOURCE_MAP['PUMP_FUN']) throw new Error('Missing PUMP_FUN source map'); },
  () => { if (!HELIUS_SOURCE_MAP['PUMP_SWAP']) throw new Error('Missing PUMP_SWAP source map'); },
  () => { if (!HELIUS_SOURCE_MAP['RAYDIUM']) throw new Error('Missing RAYDIUM source map'); },

  // Colors
  () => { if (EXIT_REGISTRY[PROGRAM_IDS.PUMP_FUN].badge_color !== 'red') throw new Error('PUMP_FUN should be red'); },
  () => { if (EXIT_REGISTRY[PROGRAM_IDS.PUMP_SWAP].badge_color !== 'gold') throw new Error('PUMP_SWAP should be gold'); },
  () => { if (EXIT_REGISTRY[PROGRAM_IDS.RAYDIUM_V4].badge_color !== 'platinum') throw new Error('RAYDIUM should be platinum'); },
];

let passed = 0;
for (const test of tests) {
  try { test(); passed++; } catch (e: any) { console.error('❌', e.message); }
}
console.log(`✅ Phase 1: ${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exit(1);
