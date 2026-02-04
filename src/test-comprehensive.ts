import dotenv from 'dotenv';
dotenv.config();

import { PROGRAM_IDS, USDC_MINT } from './config/constants';
import { detectSell, getTokenDelta, getSolDelta, scoreVenues } from './services/curve.service';
import { generateBadge } from './services/badge.service';
import { getCache, setCache, getCacheStats, clearCache } from './services/cache.service';
import { fetchTokenSymbol } from './services/metadata.service';
import { CachedResult } from './types';
import app from './app';
import http from 'http';

// ═══════════════════════════════════════════════════════════════════════════
// Test runner
// ═══════════════════════════════════════════════════════════════════════════
let total = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n--- ${name} ---`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
// Real base58 addresses for tests (system program + a real mint)
const WALLET = 'DstMVRU2GpqFnH7oGq5JC2MamLiMRe5emFe6fBguR97f';
const TOKEN = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';

function makeTx(overrides: Record<string, any> = {}) {
  return {
    signature: 'sig_test',
    timestamp: 1700000000,
    slot: 250000000,
    type: 'SWAP',
    source: 'PUMP_FUN',
    transactionError: null,
    accountData: [
      {
        account: WALLET,
        nativeBalanceChange: 1_000_000_000,
        tokenBalanceChanges: [
          {
            userAccount: WALLET,
            mint: TOKEN,
            rawTokenAmount: { tokenAmount: '-1000000' },
          },
        ],
      },
    ],
    instructions: [{ programId: PROGRAM_IDS.PUMP_FUN }],
    innerInstructions: [{ instructions: [{ programId: PROGRAM_IDS.PUMP_FUN }] }],
    tokenTransfers: [],
    nativeTransfers: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// getTokenDelta
// ═══════════════════════════════════════════════════════════════════════════
function testGetTokenDelta() {
  section('getTokenDelta');

  // Reads negative delta from accountData
  const tx1 = makeTx();
  const d1 = getTokenDelta(tx1, WALLET, TOKEN);
  assert(d1 === -1000000, 'negative delta from accountData', `got ${d1}`);

  // Returns 0 for unrelated mint
  const d2 = getTokenDelta(tx1, WALLET, 'SomeOtherMintNotInThisTx1234567890');
  assert(d2 === 0, 'returns 0 for unrelated mint', `got ${d2}`);

  // Case-sensitive: different case wallet does NOT match (Solana is case-sensitive)
  const d3 = getTokenDelta(tx1, WALLET.toLowerCase(), TOKEN);
  assert(d3 === 0, 'case-sensitive: lowercase wallet does not match', `got ${d3}`);

  // Falls back to tokenTransfers when accountData has no match
  const tx2 = makeTx({
    accountData: [],
    tokenTransfers: [
      { mint: TOKEN, fromUserAccount: WALLET, toUserAccount: 'Other', tokenAmount: 500 },
      { mint: TOKEN, fromUserAccount: 'Other', toUserAccount: WALLET, tokenAmount: 100 },
    ],
  });
  const d4 = getTokenDelta(tx2, WALLET, TOKEN);
  assert(d4 === -400, 'fallback to tokenTransfers net delta', `got ${d4}`);

  // Returns 0 with empty tx
  const d5 = getTokenDelta({}, WALLET, TOKEN);
  assert(d5 === 0, 'returns 0 for empty tx', `got ${d5}`);

  // Handles positive delta (buy)
  const txBuy = makeTx({
    accountData: [{
      account: WALLET,
      nativeBalanceChange: -500000,
      tokenBalanceChanges: [{
        userAccount: WALLET,
        mint: TOKEN,
        rawTokenAmount: { tokenAmount: '5000000' },
      }],
    }],
  });
  const d6 = getTokenDelta(txBuy, WALLET, TOKEN);
  assert(d6 === 5000000, 'positive delta for buy', `got ${d6}`);

  // Handles missing rawTokenAmount gracefully
  const txNoRaw = makeTx({
    accountData: [{
      account: WALLET,
      nativeBalanceChange: 0,
      tokenBalanceChanges: [{
        userAccount: WALLET,
        mint: TOKEN,
        rawTokenAmount: null,
      }],
    }],
  });
  const d7 = getTokenDelta(txNoRaw, WALLET, TOKEN);
  assert(d7 === 0, 'handles null rawTokenAmount', `got ${d7}`);

  // Matches via acc.account when userAccount differs
  const txAccMatch = makeTx({
    accountData: [{
      account: WALLET,
      nativeBalanceChange: 0,
      tokenBalanceChanges: [{
        userAccount: 'DifferentAccount',
        mint: TOKEN,
        rawTokenAmount: { tokenAmount: '-200' },
      }],
    }],
  });
  const d8 = getTokenDelta(txAccMatch, WALLET, TOKEN);
  assert(d8 === -200, 'matches via acc.account fallback', `got ${d8}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// getSolDelta
// ═══════════════════════════════════════════════════════════════════════════
function testGetSolDelta() {
  section('getSolDelta');

  // Positive SOL inflow from accountData
  const tx1 = makeTx();
  const d1 = getSolDelta(tx1, WALLET);
  assert(d1 === 1_000_000_000, 'positive SOL from accountData', `got ${d1}`);

  // Negative SOL (fee only, no inflow)
  const txFee = makeTx({
    accountData: [{ account: WALLET, nativeBalanceChange: -5000 }],
  });
  const d2 = getSolDelta(txFee, WALLET);
  assert(d2 === -5000, 'negative SOL for fee-only', `got ${d2}`);

  // Case-sensitive: different case wallet does NOT match
  const d3 = getSolDelta(tx1, WALLET.toLowerCase());
  assert(d3 === 0, 'case-sensitive: lowercase wallet no match', `got ${d3}`);

  // Fallback to nativeTransfers
  const txNative = makeTx({
    accountData: [],
    nativeTransfers: [
      { fromUserAccount: 'Other', toUserAccount: WALLET, amount: 2_000_000_000 },
      { fromUserAccount: WALLET, toUserAccount: 'Other', amount: 5000 },
    ],
  });
  const d4 = getSolDelta(txNative, WALLET);
  assert(d4 === 2_000_000_000 - 5000, 'fallback to nativeTransfers', `got ${d4}`);

  // Zero when wallet not found
  const d5 = getSolDelta(makeTx({ accountData: [], nativeTransfers: [] }), WALLET);
  assert(d5 === 0, 'zero for missing wallet', `got ${d5}`);

  // Empty tx
  const d6 = getSolDelta({}, WALLET);
  assert(d6 === 0, 'zero for empty tx', `got ${d6}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// scoreVenues
// ═══════════════════════════════════════════════════════════════════════════
function testScoreVenues() {
  section('scoreVenues');

  // Helius source only → 100 points
  const tx1 = makeTx({ instructions: [], innerInstructions: [] });
  const s1 = scoreVenues(tx1);
  assert(s1.length === 1, 'helius source only: 1 venue', `got ${s1.length}`);
  assert(s1[0]!.score === 100, 'helius source score = 100', `got ${s1[0]?.score}`);
  assert(s1[0]!.programId === PROGRAM_IDS.PUMP_FUN, 'helius source maps to PUMP_FUN');

  // Inner instruction only → 50 points
  const tx2 = makeTx({ source: null, instructions: [] });
  const s2 = scoreVenues(tx2);
  assert(s2.length === 1, 'inner ix only: 1 venue');
  assert(s2[0]!.score === 50, 'inner ix score = 50', `got ${s2[0]?.score}`);

  // Top-level instruction only → 10 points
  const tx3 = makeTx({ source: null, innerInstructions: [] });
  const s3 = scoreVenues(tx3);
  assert(s3.length === 1, 'instruction only: 1 venue');
  assert(s3[0]!.score === 10, 'instruction score = 10', `got ${s3[0]?.score}`);

  // All three signals combined → 160
  const txAll = makeTx();
  const sAll = scoreVenues(txAll);
  assert(sAll[0]!.score === 160, 'combined score = 160', `got ${sAll[0]?.score}`);
  assert(sAll[0]!.sources.length === 3, 'three source signals', `got ${sAll[0]?.sources.length}`);

  // No known programs → empty
  const txNone = makeTx({
    source: null,
    instructions: [{ programId: 'UnknownProgramId00000000000000000' }],
    innerInstructions: [],
  });
  const sNone = scoreVenues(txNone);
  assert(sNone.length === 0, 'no known programs → empty');

  // Deduplication: same program in multiple inner instructions counts once
  const txDup = makeTx({
    source: null,
    instructions: [],
    innerInstructions: [
      { instructions: [{ programId: PROGRAM_IDS.PUMP_SWAP }, { programId: PROGRAM_IDS.PUMP_SWAP }] },
      { instructions: [{ programId: PROGRAM_IDS.PUMP_SWAP }] },
    ],
  });
  const sDup = scoreVenues(txDup);
  assert(sDup.length === 1, 'dedup: 1 venue');
  assert(sDup[0]!.score === 50, 'dedup: scored once at 50', `got ${sDup[0]?.score}`);

  // Conflicting venues: PUMP_FUN source (100) vs RAYDIUM inner+ix (60)
  const txConflict = makeTx({
    source: 'PUMP_FUN',
    instructions: [{ programId: PROGRAM_IDS.RAYDIUM_V4 }],
    innerInstructions: [{ instructions: [{ programId: PROGRAM_IDS.RAYDIUM_V4 }] }],
  });
  const sConf = scoreVenues(txConflict);
  assert(sConf.length === 2, 'conflict: 2 venues scored');
  assert(sConf[0]!.programId === PROGRAM_IDS.PUMP_FUN, 'conflict: PUMP_FUN wins (100 > 60)');
  assert(sConf[0]!.score === 100, 'conflict: winner score 100', `got ${sConf[0]?.score}`);
  assert(sConf[1]!.programId === PROGRAM_IDS.RAYDIUM_V4, 'conflict: RAYDIUM second');
  assert(sConf[1]!.score === 60, 'conflict: RAYDIUM score 60', `got ${sConf[1]?.score}`);

  // Unknown Helius source is ignored
  const txUnkSrc = makeTx({
    source: 'JUPITER',
    instructions: [{ programId: PROGRAM_IDS.PUMP_SWAP }],
    innerInstructions: [],
  });
  const sUnk = scoreVenues(txUnkSrc);
  assert(sUnk.length === 1, 'unknown source ignored, only ix scored');
  assert(sUnk[0]!.score === 10, 'ix-only score', `got ${sUnk[0]?.score}`);

  // Empty tx
  const sEmpty = scoreVenues({});
  assert(sEmpty.length === 0, 'empty tx → no scores');
}

// ═══════════════════════════════════════════════════════════════════════════
// detectSell
// ═══════════════════════════════════════════════════════════════════════════
function testDetectSell() {
  section('detectSell');

  // Valid sell: negative token delta, positive SOL, known venue
  const tx1 = makeTx();
  const d1 = detectSell(tx1, WALLET, TOKEN);
  assert(d1 !== null, 'valid sell detected');
  assert(d1!.tokenDelta === -1000000, 'sell tokenDelta', `got ${d1?.tokenDelta}`);
  assert(d1!.solDelta === 1_000_000_000, 'sell solDelta', `got ${d1?.solDelta}`);
  assert(d1!.winningVenue.programId === PROGRAM_IDS.PUMP_FUN, 'sell venue = PUMP_FUN');
  assert(d1!.signature === 'sig_test', 'sell signature');
  assert(d1!.timestamp === 1700000000, 'sell timestamp');

  // Skips failed transactions
  const txFail = makeTx({ transactionError: { error: 'some error' } });
  assert(detectSell(txFail, WALLET, TOKEN) === null, 'skips failed tx');

  // Skips positive token delta (buy, not sell)
  const txBuy = makeTx({
    accountData: [{
      account: WALLET,
      nativeBalanceChange: -500000,
      tokenBalanceChanges: [{
        userAccount: WALLET,
        mint: TOKEN,
        rawTokenAmount: { tokenAmount: '5000000' },
      }],
    }],
  });
  assert(detectSell(txBuy, WALLET, TOKEN) === null, 'skips buy (positive delta)');

  // Skips zero token delta
  const txZero = makeTx({
    accountData: [{
      account: WALLET,
      nativeBalanceChange: 1000,
      tokenBalanceChanges: [{
        userAccount: WALLET,
        mint: TOKEN,
        rawTokenAmount: { tokenAmount: '0' },
      }],
    }],
  });
  assert(detectSell(txZero, WALLET, TOKEN) === null, 'skips zero delta');

  // Skips non-SWAP with no SOL/USDC inflow
  const txNoInflow = makeTx({
    type: 'TRANSFER',
    accountData: [{
      account: WALLET,
      nativeBalanceChange: -5000,
      tokenBalanceChanges: [{
        userAccount: WALLET,
        mint: TOKEN,
        rawTokenAmount: { tokenAmount: '-1000' },
      }],
    }],
  });
  assert(detectSell(txNoInflow, WALLET, TOKEN) === null, 'skips no inflow on non-SWAP');

  // Skips when no venue can be attributed
  const txNoVenue = makeTx({
    source: null,
    instructions: [{ programId: 'UnknownProgram00000000000000000000' }],
    innerInstructions: [],
  });
  assert(detectSell(txNoVenue, WALLET, TOKEN) === null, 'skips no attributable venue');

  // Accepts sell with USDC inflow instead of SOL
  const txUsdc = makeTx({
    accountData: [
      {
        account: WALLET,
        nativeBalanceChange: -5000, // negative SOL (fee only)
        tokenBalanceChanges: [
          { userAccount: WALLET, mint: TOKEN, rawTokenAmount: { tokenAmount: '-1000' } },
          { userAccount: WALLET, mint: USDC_MINT, rawTokenAmount: { tokenAmount: '50000000' } },
        ],
      },
    ],
  });
  const dUsdc = detectSell(txUsdc, WALLET, TOKEN);
  assert(dUsdc !== null, 'accepts USDC inflow sell');
  assert(dUsdc!.tokenDelta === -1000, 'USDC sell tokenDelta', `got ${dUsdc?.tokenDelta}`);

  // winningVenue is the highest-scored
  const txMulti = makeTx({
    source: 'RAYDIUM',
    instructions: [{ programId: PROGRAM_IDS.PUMP_FUN }],
    innerInstructions: [{ instructions: [{ programId: PROGRAM_IDS.PUMP_FUN }] }],
  });
  const dMulti = detectSell(txMulti, WALLET, TOKEN);
  assert(dMulti !== null, 'multi-venue detected');
  assert(dMulti!.winningVenue.programId === PROGRAM_IDS.RAYDIUM_V4, 'raydium wins at 100', `got ${dMulti?.winningVenue.programId}`);
  assert(dMulti!.venueScores.length === 2, 'two venues scored', `got ${dMulti?.venueScores.length}`);

  // Non-SWAP type with known DEX program still detected
  const txTransfer = makeTx({ type: 'TRANSFER' });
  const dTransfer = detectSell(txTransfer, WALLET, TOKEN);
  assert(dTransfer !== null, 'non-SWAP type with DEX program detected');

  // Non-SWAP type without DEX program → null
  const txPlainTransfer = makeTx({
    type: 'TRANSFER',
    source: null,
    instructions: [],
    innerInstructions: [],
  });
  assert(detectSell(txPlainTransfer, WALLET, TOKEN) === null, 'plain transfer without DEX → null');
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache service
// ═══════════════════════════════════════════════════════════════════════════
function testCache() {
  section('Cache service');
  clearCache();

  const data: CachedResult = {
    result: {
      wallet: 'W', token: 'T', token_symbol: 'X', exit_type: 'Curve Jeet',
      exit_venue: 'Pump.fun Bonding Curve', description: 'd', confidence: 'HIGH',
      sell_signature: 's', sell_timestamp: 1, badge_color: 'red', badge_title: 'T',
    },
    badge_base64: 'b64',
    cached_at: 1,
  };

  // Miss returns undefined
  assert(getCache('A', 'B') === undefined, 'miss returns undefined');

  // Set and retrieve
  setCache('A', 'B', data);
  const got = getCache('A', 'B');
  assert(got !== undefined, 'hit returns data');
  assert(got!.result.exit_type === 'Curve Jeet', 'correct exit_type');
  assert(got!.badge_base64 === 'b64', 'correct badge');

  // Case SENSITIVE: different case is a different key (Solana addresses are case-sensitive)
  assert(getCache('a', 'b') === undefined, 'case-sensitive: lowercase is a miss');
  assert(getCache('A', 'b') === undefined, 'case-sensitive: mixed case is a miss');

  // Overwrite
  const data2 = { ...data, badge_base64: 'new_b64' };
  setCache('A', 'B', data2);
  assert(getCache('A', 'B')!.badge_base64 === 'new_b64', 'overwrite works');

  // Stats
  const stats = getCacheStats();
  assert(stats.keys === 1, 'stats: 1 key after overwrite', `got ${stats.keys}`);

  // Multiple keys
  setCache('C', 'D', data);
  setCache('E', 'F', data);
  assert(getCacheStats().keys === 3, '3 distinct keys', `got ${getCacheStats().keys}`);

  // Clear resets
  clearCache();
  assert(getCache('A', 'B') === undefined, 'clear resets all');
  assert(getCacheStats().keys === 0, 'clear resets key count');
}

// ═══════════════════════════════════════════════════════════════════════════
// Badge service
// ═══════════════════════════════════════════════════════════════════════════
async function testBadge() {
  section('Badge service');

  const baseBadge = {
    badge_title: 'TEST', badge_color: 'red' as const, exit_type: 'Curve Jeet',
    exit_venue: 'Pump.fun', token_symbol: '$TEST', wallet: WALLET, token: TOKEN,
    sell_timestamp: 1700000000, confidence: 'HIGH' as const,
    description: 'Test', sell_signature: 'sig123',
  };

  // Valid JPEG output (FFD8FF magic bytes)
  const b1 = await generateBadge(baseBadge);
  assert(b1.startsWith('data:image/jpeg;base64,'), 'data URI prefix');
  const raw1 = Buffer.from(b1.replace('data:image/jpeg;base64,', ''), 'base64');
  assert(raw1[0] === 0xFF && raw1[1] === 0xD8 && raw1[2] === 0xFF, 'valid JPEG magic bytes');
  assert(raw1.length > 1000, 'reasonable file size', `got ${raw1.length}`);

  // Very long token symbol doesn't crash
  const bLong = await generateBadge({ ...baseBadge, token_symbol: '$SUPERLONGNAME' });
  assert(bLong.startsWith('data:image/jpeg;base64,'), 'long symbol renders');

  // Short wallet (no truncation path)
  const bShort = await generateBadge({ ...baseBadge, wallet: 'ShortWallet' });
  assert(bShort.startsWith('data:image/jpeg;base64,'), 'short wallet renders');

  // Timestamp 0 (epoch)
  const bEpoch = await generateBadge({ ...baseBadge, sell_timestamp: 0 });
  assert(bEpoch.startsWith('data:image/jpeg;base64,'), 'epoch timestamp renders');

  // Future timestamp
  const bFuture = await generateBadge({ ...baseBadge, sell_timestamp: 2000000000 });
  assert(bFuture.startsWith('data:image/jpeg;base64,'), 'future timestamp renders');

  // All three color variants produce different outputs
  const bRed = await generateBadge({ ...baseBadge, badge_color: 'red' });
  const bGold = await generateBadge({ ...baseBadge, badge_color: 'gold' });
  const bPlat = await generateBadge({ ...baseBadge, badge_color: 'platinum' });
  assert(bRed !== bGold, 'red != gold output');
  assert(bGold !== bPlat, 'gold != platinum output');
  assert(bRed !== bPlat, 'red != platinum output');

  // All confidence levels render
  for (const conf of ['HIGH', 'MEDIUM', 'LOW'] as const) {
    const b = await generateBadge({ ...baseBadge, confidence: conf });
    assert(b.startsWith('data:image/jpeg;base64,'), `confidence ${conf} renders`);
  }

  // Empty strings don't crash
  const bEmpty = await generateBadge({
    ...baseBadge, token_symbol: '', exit_venue: '', exit_type: '', badge_title: '',
  });
  assert(bEmpty.startsWith('data:image/jpeg;base64,'), 'empty strings render');
}

// ═══════════════════════════════════════════════════════════════════════════
// Metadata service
// ═══════════════════════════════════════════════════════════════════════════
async function testMetadata() {
  section('Metadata service');

  // Without a valid API key, getAssetMetadata fails → fallback to truncated mint
  const sym = await fetchTokenSymbol('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
  assert(typeof sym === 'string', 'returns string');
  assert(sym.length > 0, 'non-empty result');
  if (sym.includes('...')) {
    assert(sym === 'DezX...B263', 'fallback truncation format', `got "${sym}"`);
  }

  // Very short mint (edge case for slice)
  const symShort = await fetchTokenSymbol('ABC');
  assert(typeof symShort === 'string', 'short mint returns string');
  assert(symShort.length > 0, 'short mint non-empty');
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP controller
// ═══════════════════════════════════════════════════════════════════════════
async function testHTTP() {
  section('HTTP controller');
  clearCache();

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  const post = (body: any) => fetch(`${base}/api/v1/solana/curve-exit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // GET /health
  const health = await fetch(`${base}/health`);
  const hBody = await health.json();
  assert(health.status === 200, 'health 200');
  assert(hBody.status === 'ok', 'health status ok');

  // GET /api/v1/solana/curve-exit returns full schema
  const getRes = await fetch(`${base}/api/v1/solana/curve-exit`);
  const gBody = await getRes.json();
  assert(getRes.status === 200, 'GET 200');
  assert(gBody.version === 'v2', 'GET version');
  assert(gBody.endpoint === '/api/v1/solana/curve-exit', 'GET endpoint');
  assert(typeof gBody.pay_to_address === 'string', 'GET pay_to_address is string');
  assert(gBody.pricing === '$0.01 per call', 'GET pricing');
  assert(Array.isArray(gBody.supported_venues), 'GET supported_venues is array');
  assert(gBody.supported_venues.length === 3, 'GET 3 venues', `got ${gBody.supported_venues.length}`);
  assert(gBody.cache_stats !== undefined, 'GET has cache_stats');
  assert(typeof gBody.cache_stats.keys === 'number', 'cache_stats.keys is number');
  assert(typeof gBody.cache_stats.hits === 'number', 'cache_stats.hits is number');

  // 404 on unknown route
  const notFound = await fetch(`${base}/api/v1/solana/nonexistent`);
  assert(notFound.status === 404, 'unknown route 404', `got ${notFound.status}`);

  // POST: empty body → 400
  const r1 = await post({});
  assert(r1.status === 400, 'empty body → 400');
  const r1b = await r1.json();
  assert(r1b.status === 'error', 'error status');
  assert(r1b.error.includes('wallet'), 'error mentions wallet');

  // POST: missing token → 400
  const r2 = await post({ wallet: WALLET });
  assert(r2.status === 400, 'missing token → 400');
  const r2b = await r2.json();
  assert(r2b.error.includes('token'), 'error mentions token');

  // POST: non-base58 wallet → 400
  const r3 = await post({ wallet: 'INVALID!!CHARS##HERE$$00000000000', token: TOKEN });
  assert(r3.status === 400, 'non-base58 wallet → 400', `got ${r3.status}`);

  // POST: wallet too short (31 chars base58) → 400
  const r3b = await post({ wallet: '1234567890ABCDEFGHJKLMNPQRSTUVw', token: TOKEN });
  assert(r3b.status === 400, '31-char wallet → 400', `got ${r3b.status}`);

  // POST: wallet too long (45 chars) → 400
  const r3c = await post({ wallet: 'A'.repeat(45), token: TOKEN });
  assert(r3c.status === 400, '45-char wallet → 400', `got ${r3c.status}`);

  // POST: base58 but with forbidden char 'O' → 400
  const r3d = await post({ wallet: 'O'.repeat(32), token: TOKEN });
  assert(r3d.status === 400, 'base58 forbidden char O → 400', `got ${r3d.status}`);

  // POST: base58 but with forbidden char '0' → 400
  const r3e = await post({ wallet: '0'.repeat(32), token: TOKEN });
  assert(r3e.status === 400, 'base58 forbidden char 0 → 400', `got ${r3e.status}`);

  // POST: base58 but with forbidden char 'l' → 400
  const r3f = await post({ wallet: 'l'.repeat(32), token: TOKEN });
  assert(r3f.status === 400, 'base58 forbidden char l → 400', `got ${r3f.status}`);

  // POST: base58 but with forbidden char 'I' → 400
  const r3g = await post({ wallet: 'I'.repeat(32), token: TOKEN });
  assert(r3g.status === 400, 'base58 forbidden char I → 400', `got ${r3g.status}`);

  // POST: valid base58 wallet, non-base58 token → 400
  const r4 = await post({ wallet: WALLET, token: 'INVALID!!CHARS##00000000000000000' });
  assert(r4.status === 400, 'non-base58 token → 400', `got ${r4.status}`);

  // POST: valid base58, 32 chars → accepted (not 400)
  const r5 = await post({ wallet: '11111111111111111111111111111111', token: '22222222222222222222222222222222' });
  assert(r5.status !== 400, '32-char base58 accepted', `got ${r5.status}`);

  // POST: valid base58, 44 chars → accepted
  const r6 = await post({ wallet: WALLET, token: TOKEN });
  assert(r6.status !== 400, '44-char base58 accepted', `got ${r6.status}`);

  // POST: wallet as number → 400
  const r7 = await post({ wallet: 12345, token: TOKEN });
  assert(r7.status === 400, 'numeric wallet → 400');

  // POST: APIX402 nested body extraction
  const r8 = await post({ body: { wallet: WALLET, token: TOKEN } });
  assert(r8.status !== 400, 'nested body extracted', `got ${r8.status}`);

  // POST: flat body (no nesting)
  const r9 = await post({ wallet: WALLET, token: TOKEN });
  assert(r9.status !== 400, 'flat body accepted', `got ${r9.status}`);

  // POST: stringified nested body
  const r10 = await fetch(`${base}/api/v1/solana/curve-exit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: JSON.stringify({ wallet: WALLET, token: TOKEN }),
    }),
  });
  assert(r10.status !== 400, 'stringified nested body parsed', `got ${r10.status}`);

  // POST: cache behavior — manually cache, then verify cached: true
  const cacheWallet = WALLET;
  const cacheToken = TOKEN;
  setCache(cacheWallet, cacheToken, {
    result: {
      wallet: cacheWallet, token: cacheToken, token_symbol: '$CACHED',
      exit_type: 'Curve Jeet', exit_venue: 'Pump.fun Bonding Curve',
      description: 'test', confidence: 'HIGH', sell_signature: 'sig_cached',
      sell_timestamp: 1700000000, badge_color: 'red', badge_title: 'PRE-MIGRATION EXIT',
    },
    badge_base64: 'data:image/jpeg;base64,cacheddata',
    cached_at: Date.now(),
  });

  const rCached = await post({ wallet: cacheWallet, token: cacheToken });
  assert(rCached.status === 200, 'cached response 200');
  const cBody = await rCached.json();
  assert(cBody.cached === true, 'cached flag is true');
  assert(cBody.status === 'success', 'cached status success');
  assert(cBody.data.wallet === cacheWallet, 'cached wallet matches');
  assert(cBody.data.token_symbol === '$CACHED', 'cached symbol matches');
  assert(cBody.data.exit_type === 'Curve Jeet', 'cached exit_type matches');
  assert(cBody.data.confidence === 'HIGH', 'cached confidence matches');
  assert(cBody.data.image_base64 === 'data:image/jpeg;base64,cacheddata', 'cached image matches');
  assert(typeof cBody.data.pay_to_address === 'string', 'cached has pay_to_address');
  assert(cBody.data.sell_signature === 'sig_cached', 'cached sig matches');
  assert(cBody.data.sell_timestamp === '2023-11-14T22:13:20.000Z', 'cached timestamp ISO', `got ${cBody.data.sell_timestamp}`);

  // Second request for same key also returns cached
  const rCached2 = await post({ wallet: cacheWallet, token: cacheToken });
  const cBody2 = await rCached2.json();
  assert(cBody2.cached === true, 'repeat request still cached');

  server.close();
  clearCache();
}

// ═══════════════════════════════════════════════════════════════════════════
// Concurrent cache
// ═══════════════════════════════════════════════════════════════════════════
function testConcurrentCache() {
  section('Concurrent cache');
  clearCache();

  const data: CachedResult = {
    result: {
      wallet: 'W', token: 'T', token_symbol: 'X', exit_type: 'Curve Jeet',
      exit_venue: 'v', description: 'd', confidence: 'LOW',
      sell_signature: 's', sell_timestamp: 1, badge_color: 'gold', badge_title: 'T',
    },
    badge_base64: 'b',
    cached_at: 1,
  };

  for (let i = 0; i < 100; i++) {
    setCache(`wallet_${i}`, `token_${i}`, { ...data, cached_at: i });
  }
  assert(getCacheStats().keys === 100, '100 writes', `got ${getCacheStats().keys}`);

  let allReadable = true;
  for (let i = 0; i < 100; i++) {
    const got = getCache(`wallet_${i}`, `token_${i}`);
    if (!got || got.cached_at !== i) { allReadable = false; break; }
  }
  assert(allReadable, 'all 100 entries readable with correct data');

  clearCache();
}

// ═══════════════════════════════════════════════════════════════════════════
// Run all
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('=== Comprehensive Test Suite ===');

  testGetTokenDelta();
  testGetSolDelta();
  testScoreVenues();
  testDetectSell();
  testCache();
  testConcurrentCache();
  await testBadge();
  await testMetadata();
  await testHTTP();

  console.log(`\n=== Results: ${passed}/${total} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(e => { console.error('Suite error:', e); process.exit(1); });
