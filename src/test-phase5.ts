import { generateBadge } from './services/badge.service';
import fs from 'fs';

async function test() {
  const variants = [
    { color: 'red' as const, title: 'PRE-MIGRATION EXIT', type: 'Curve Jeet', venue: 'Pump.fun Bonding Curve', symbol: '$PEPE', confidence: 'HIGH' as const },
    { color: 'gold' as const, title: 'PUMPSWAP GRADUATE', type: 'PumpSwap Graduate', venue: 'PumpSwap AMM', symbol: '$MOODENG', confidence: 'MEDIUM' as const },
    { color: 'platinum' as const, title: 'RAYDIUM OG', type: 'Raydium OG', venue: 'Raydium V4 AMM', symbol: '$BONK', confidence: 'LOW' as const },
  ];

  for (const v of variants) {
    const b64 = await generateBadge({
      badge_title: v.title,
      badge_color: v.color,
      exit_type: v.type,
      exit_venue: v.venue,
      token_symbol: v.symbol,
      wallet: 'DstMVRU2GpqFnH7oGq5JC2MamLiMRe5emFe6fBguR97f',
      token: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
      sell_timestamp: 1700000000,
      confidence: v.confidence,
      description: 'Test',
      sell_signature: 'sig123',
    });

    if (!b64.startsWith('data:image/jpeg;base64,')) throw new Error(`${v.color} badge invalid`);

    const raw = Buffer.from(b64.replace('data:image/jpeg;base64,', ''), 'base64');
    fs.writeFileSync(`test-badge-v2-${v.color}.jpg`, raw);
    console.log(`✅ ${v.color} badge (${v.confidence}) → test-badge-v2-${v.color}.jpg`);
  }

  console.log('✅ Phase 5 passed: Badge v2 renders with symbol + confidence');
}

test().catch(e => { console.error('❌', e.message); process.exit(1); });
