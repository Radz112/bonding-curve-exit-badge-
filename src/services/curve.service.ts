import { getEnhancedHistory } from '../utils/helius';
import {
  PROGRAM_IDS,
  EXIT_REGISTRY,
  HELIUS_SOURCE_MAP,
  ATTRIBUTION_WEIGHTS,
  CONFIDENCE_LEVELS,
  NATIVE_SOL_MINT,
  USDC_MINT,
} from '../config/constants';
import { CurveExitRequest, CurveExitResult, SellDetection, VenueScore } from '../types';
import { fetchTokenSymbol } from './metadata.service';

const KNOWN_PROGRAM_IDS = new Set(Object.values(PROGRAM_IDS));
const MAX_PAGES = 10;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════
export async function analyzeCurveExit(
  request: CurveExitRequest
): Promise<CurveExitResult> {
  const { wallet, token } = request;
  let before: string | undefined;
  let sellDetection: SellDetection | null = null;
  let pagesScanned = 0;

  // Scan wallet history for a qualifying sell
  while (!sellDetection && pagesScanned < MAX_PAGES) {
    const txHistory = await getEnhancedHistory(wallet, before);
    if (!txHistory.length) break;

    for (const tx of txHistory) {
      const detection = detectSellWithDelta(tx, wallet, token);
      if (detection) {
        sellDetection = detection;
        break;
      }
    }

    before = txHistory[txHistory.length - 1]?.signature;
    pagesScanned++;
  }

  if (!sellDetection) {
    throw new Error(
      `No sell transaction found for token ${token} in wallet ${wallet}. Scanned ${pagesScanned} pages.`
    );
  }

  // Get exit classification from winning venue
  const exitInfo = EXIT_REGISTRY[sellDetection.winningVenue.programId];
  if (!exitInfo) {
    throw new Error(
      `Unknown venue: ${sellDetection.winningVenue.programId} (score: ${sellDetection.winningVenue.score})`
    );
  }

  // Determine confidence level
  const score = sellDetection.winningVenue.score;
  const confidence =
    score >= CONFIDENCE_LEVELS.HIGH ? 'HIGH' :
    score >= CONFIDENCE_LEVELS.MEDIUM ? 'MEDIUM' : 'LOW';

  // Fetch token symbol for badge
  const tokenSymbol = await fetchTokenSymbol(token);

  return {
    wallet,
    token,
    token_symbol: tokenSymbol,
    exit_type: exitInfo.exit_type,
    exit_venue: exitInfo.exit_venue,
    description: exitInfo.description,
    confidence,
    sell_signature: sellDetection.signature,
    sell_timestamp: sellDetection.timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SMART SELL DETECTOR — Net Balance Delta Logic
// ═══════════════════════════════════════════════════════════════════════════
/**
 * A "Sell" is confirmed IF:
 * 1. Wallet's net balance change for target_token is NEGATIVE
 * 2. AND transaction type is SWAP (or contains known DEX program)
 * 3. AND there is positive inflow of SOL or USDC to wallet
 */
function detectSellWithDelta(
  tx: any,
  wallet: string,
  targetToken: string
): SellDetection | null {
  // Skip failed transactions
  if (tx.transactionError) return null;

  // ─── Step 1: Calculate Token Delta ───────────────────────────────────────
  const tokenDelta = calculateTokenDelta(tx, wallet, targetToken);
  if (tokenDelta >= 0) return null; // Not a sell (no negative delta)

  // ─── Step 2: Verify SOL/USDC Inflow ──────────────────────────────────────
  const solDelta = calculateSolDelta(tx, wallet);
  const usdcDelta = calculateTokenDelta(tx, wallet, USDC_MINT);

  // Must have positive inflow (received SOL or USDC)
  if (solDelta <= 0 && usdcDelta <= 0) return null;

  // ─── Step 3: Verify Swap Context ─────────────────────────────────────────
  // Transaction should be a SWAP or contain DEX program
  const isSwapType = tx.type === 'SWAP' || tx.type === 'SWAP_EXACT_IN' || tx.type === 'SWAP_EXACT_OUT';
  const hasDexProgram = hasKnownDexProgram(tx);

  if (!isSwapType && !hasDexProgram) return null;

  // ─── Step 4: Weighted Attribution Scoring ────────────────────────────────
  const venueScores = calculateVenueScores(tx);

  if (venueScores.length === 0) return null;

  // Pick highest scoring venue
  const winningVenue = venueScores.reduce((a, b) => a.score > b.score ? a : b);

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    slot: tx.slot || 0,
    tokenDelta,
    solDelta,
    venueScores,
    winningVenue,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NET BALANCE DELTA CALCULATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate net token balance change for a wallet in a transaction.
 * Uses accountData.tokenBalanceChanges for accuracy.
 */
function calculateTokenDelta(tx: any, wallet: string, mint: string): number {
  const accountData = tx.accountData || [];

  for (const acc of accountData) {
    const tokenChanges = acc.tokenBalanceChanges || [];
    for (const change of tokenChanges) {
      // Match by userAccount (main wallet) or the account itself
      const isWallet =
        change.userAccount?.toLowerCase() === wallet.toLowerCase() ||
        acc.account?.toLowerCase() === wallet.toLowerCase();

      if (isWallet && change.mint === mint) {
        // rawTokenAmount.tokenAmount is the delta as string
        const amount = parseFloat(change.rawTokenAmount?.tokenAmount || '0');
        return amount;
      }
    }
  }

  // Fallback: use tokenTransfers if accountData doesn't have it
  const tokenTransfers = tx.tokenTransfers || [];
  let delta = 0;
  for (const t of tokenTransfers) {
    if (t.mint !== mint) continue;
    if (t.fromUserAccount?.toLowerCase() === wallet.toLowerCase()) {
      delta -= t.tokenAmount || 0;
    }
    if (t.toUserAccount?.toLowerCase() === wallet.toLowerCase()) {
      delta += t.tokenAmount || 0;
    }
  }

  return delta;
}

/**
 * Calculate net SOL balance change for a wallet.
 * Uses accountData.nativeBalanceChange.
 */
function calculateSolDelta(tx: any, wallet: string): number {
  const accountData = tx.accountData || [];

  for (const acc of accountData) {
    if (acc.account?.toLowerCase() === wallet.toLowerCase()) {
      // nativeBalanceChange is in lamports, can be negative (fee) or positive
      return acc.nativeBalanceChange || 0;
    }
  }

  // Fallback: use nativeTransfers
  const nativeTransfers = tx.nativeTransfers || [];
  let delta = 0;
  for (const t of nativeTransfers) {
    if (t.fromUserAccount?.toLowerCase() === wallet.toLowerCase()) {
      delta -= t.amount || 0;
    }
    if (t.toUserAccount?.toLowerCase() === wallet.toLowerCase()) {
      delta += t.amount || 0;
    }
  }

  return delta;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTED ATTRIBUTION SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate attribution scores for all detected venues.
 * Returns sorted array (highest score first).
 */
function calculateVenueScores(tx: any): VenueScore[] {
  const scores: Map<string, VenueScore> = new Map();

  // Initialize scores for known programs
  for (const programId of Object.values(PROGRAM_IDS)) {
    scores.set(programId, { programId, score: 0, sources: [] });
  }

  // ─── Signal 1: Helius Source Field (+100) ────────────────────────────────
  if (tx.source && HELIUS_SOURCE_MAP[tx.source]) {
    const programId = HELIUS_SOURCE_MAP[tx.source];
    const entry = scores.get(programId)!;
    entry.score += ATTRIBUTION_WEIGHTS.HELIUS_SOURCE;
    entry.sources.push(`helius_source:${tx.source}`);
  }

  // ─── Signal 2: Inner Instructions (+50 each) ─────────────────────────────
  const innerInstructions = tx.innerInstructions || [];
  for (const inner of innerInstructions) {
    const ixs = inner.instructions || [];
    for (const ix of ixs) {
      if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) {
        const entry = scores.get(ix.programId)!;
        // Only add once per program (avoid double-counting)
        if (!entry.sources.some((s: string) => s.startsWith('inner_ix'))) {
          entry.score += ATTRIBUTION_WEIGHTS.INNER_INSTRUCTION;
          entry.sources.push(`inner_ix:${ix.programId.slice(0, 8)}`);
        }
      }
    }
  }

  // ─── Signal 3: Top-Level Instructions (+10 each) ─────────────────────────
  const instructions = tx.instructions || [];
  for (const ix of instructions) {
    if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) {
      const entry = scores.get(ix.programId)!;
      if (!entry.sources.some((s: string) => s.startsWith('instruction'))) {
        entry.score += ATTRIBUTION_WEIGHTS.INSTRUCTION;
        entry.sources.push(`instruction:${ix.programId.slice(0, 8)}`);
      }
    }
  }

  // Filter to only venues with score > 0, sort by score descending
  return Array.from(scores.values())
    .filter(v => v.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Check if transaction contains any known DEX program.
 */
function hasKnownDexProgram(tx: any): boolean {
  const instructions = tx.instructions || [];
  const innerInstructions = tx.innerInstructions || [];

  for (const ix of instructions) {
    if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) return true;
  }

  for (const inner of innerInstructions) {
    for (const ix of inner.instructions || []) {
      if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) return true;
    }
  }

  return false;
}
