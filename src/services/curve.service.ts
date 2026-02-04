import { getEnhancedHistory } from '../utils/helius';
import {
  PROGRAM_IDS,
  EXIT_REGISTRY,
  HELIUS_SOURCE_MAP,
  ATTRIBUTION_WEIGHTS,
  CONFIDENCE_LEVELS,
  USDC_MINT,
  WSOL_MINT,
} from '../config/constants';
import { CurveExitRequest, CurveExitResult, Confidence, SellDetection, VenueScore } from '../types';
import { fetchTokenSymbol } from './metadata.service';

const KNOWN_PROGRAM_IDS = new Set(Object.values(PROGRAM_IDS));
const MAX_PAGES = 10;

export async function analyzeCurveExit(request: CurveExitRequest): Promise<CurveExitResult> {
  const { wallet, token } = request;
  let before: string | undefined;
  let pagesScanned = 0;

  while (pagesScanned < MAX_PAGES) {
    const txHistory = await getEnhancedHistory(wallet, before);
    if (!txHistory.length) break;

    for (const tx of txHistory) {
      const detection = detectSell(tx, wallet, token);
      if (detection) return buildResult(detection, wallet, token);
    }

    before = txHistory[txHistory.length - 1]?.signature;
    pagesScanned++;
  }

  throw new Error(
    `No sell transaction found for token ${token} in wallet ${wallet}. Scanned ${pagesScanned} pages.`
  );
}

async function buildResult(
  sell: SellDetection,
  wallet: string,
  token: string
): Promise<CurveExitResult> {
  const exitInfo = EXIT_REGISTRY[sell.winningVenue.programId]!;
  const score = sell.winningVenue.score;
  const confidence: Confidence =
    score >= CONFIDENCE_LEVELS.HIGH ? 'HIGH' :
    score >= CONFIDENCE_LEVELS.MEDIUM ? 'MEDIUM' : 'LOW';

  const tokenSymbol = await fetchTokenSymbol(token);

  return {
    wallet,
    token,
    token_symbol: tokenSymbol,
    exit_type: exitInfo.exit_type,
    exit_venue: exitInfo.exit_venue,
    description: exitInfo.description,
    confidence,
    sell_signature: sell.signature,
    sell_timestamp: sell.timestamp,
    badge_color: exitInfo.badge_color,
    badge_title: exitInfo.badge_title,
  };
}

export function detectSell(tx: any, wallet: string, targetToken: string): SellDetection | null {
  if (tx.transactionError) return null;

  const tokenDelta = getTokenDelta(tx, wallet, targetToken);
  if (tokenDelta >= 0) return null;

  const solDelta = getSolDelta(tx, wallet);
  const wsolDelta = getTokenDelta(tx, wallet, WSOL_MINT);
  const usdcDelta = getTokenDelta(tx, wallet, USDC_MINT);
  if (solDelta <= 0 && wsolDelta <= 0 && usdcDelta <= 0) return null;

  const venueScores = scoreVenues(tx);
  if (venueScores.length === 0) return null;

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    tokenDelta,
    solDelta,
    venueScores,
    winningVenue: venueScores[0], // Already sorted descending
  };
}

export function getTokenDelta(tx: any, wallet: string, mint: string): number {
  for (const acc of tx.accountData || []) {
    for (const change of acc.tokenBalanceChanges || []) {
      const isWallet =
        change.userAccount === wallet ||
        acc.account === wallet;

      if (isWallet && change.mint === mint) {
        return parseFloat(change.rawTokenAmount?.tokenAmount || '0');
      }
    }
  }

  // Fallback: tokenTransfers
  let delta = 0;
  for (const t of tx.tokenTransfers || []) {
    if (t.mint !== mint) continue;
    if (t.fromUserAccount === wallet) delta -= t.tokenAmount || 0;
    if (t.toUserAccount === wallet) delta += t.tokenAmount || 0;
  }
  return delta;
}

export function getSolDelta(tx: any, wallet: string): number {
  for (const acc of tx.accountData || []) {
    if (acc.account === wallet) {
      return acc.nativeBalanceChange || 0;
    }
  }

  // Fallback: nativeTransfers
  let delta = 0;
  for (const t of tx.nativeTransfers || []) {
    if (t.fromUserAccount === wallet) delta -= t.amount || 0;
    if (t.toUserAccount === wallet) delta += t.amount || 0;
  }
  return delta;
}

export function scoreVenues(tx: any): VenueScore[] {
  const scores = new Map<string, VenueScore>(
    Object.values(PROGRAM_IDS).map(id => [id, { programId: id, score: 0, sources: [] }])
  );

  // Helius source field
  const mappedSource = tx.source && HELIUS_SOURCE_MAP[tx.source];
  if (mappedSource) {
    const entry = scores.get(mappedSource)!;
    entry.score += ATTRIBUTION_WEIGHTS.HELIUS_SOURCE;
    entry.sources.push(`helius_source:${tx.source}`);
  }

  // Inner instructions (once per program)
  for (const inner of tx.innerInstructions || []) {
    for (const ix of inner.instructions || []) {
      if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) {
        const entry = scores.get(ix.programId)!;
        if (!entry.sources.some((s: string) => s.startsWith('inner_ix'))) {
          entry.score += ATTRIBUTION_WEIGHTS.INNER_INSTRUCTION;
          entry.sources.push(`inner_ix:${ix.programId.slice(0, 8)}`);
        }
      }
    }
  }

  // Top-level instructions (once per program)
  for (const ix of tx.instructions || []) {
    if (ix.programId && KNOWN_PROGRAM_IDS.has(ix.programId)) {
      const entry = scores.get(ix.programId)!;
      if (!entry.sources.some((s: string) => s.startsWith('instruction'))) {
        entry.score += ATTRIBUTION_WEIGHTS.INSTRUCTION;
        entry.sources.push(`instruction:${ix.programId.slice(0, 8)}`);
      }
    }
  }

  return Array.from(scores.values())
    .filter(v => v.score > 0)
    .sort((a, b) => b.score - a.score);
}
