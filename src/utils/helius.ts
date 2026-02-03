import axios from 'axios';
import { CONFIG } from '../config/constants';

// ═══════════════════════════════════════════════════════════════════════════
// HELIUS REST CLIENT — Enhanced Transactions API
// ═══════════════════════════════════════════════════════════════════════════
const heliusRest = axios.create({
  baseURL: CONFIG.HELIUS_REST_URL,
  timeout: 30000,
});

/**
 * Fetch enhanced transaction history for a wallet.
 * Returns human-readable tx data with tokenBalanceChanges, nativeBalanceChange.
 */
export async function getEnhancedHistory(
  wallet: string,
  before?: string
): Promise<any[]> {
  const url = `/v0/addresses/${wallet}/transactions`;
  const params: Record<string, string> = {
    'api-key': CONFIG.HELIUS_API_KEY,
  };
  if (before) params.before = before;

  const response = await heliusRest.get(url, { params });
  return response.data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELIUS RPC CLIENT — DAS API (getAsset for metadata)
// ═══════════════════════════════════════════════════════════════════════════
const heliusRpc = axios.create({
  baseURL: CONFIG.HELIUS_RPC_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Fetch token metadata via DAS getAsset.
 * Returns symbol, name, decimals.
 */
export async function getAssetMetadata(mintAddress: string): Promise<{
  symbol: string;
  name: string;
  decimals: number;
} | null> {
  try {
    const response = await heliusRpc.post('', {
      jsonrpc: '2.0',
      id: 'getAsset',
      method: 'getAsset',
      params: { id: mintAddress },
    });

    const result = response.data?.result;
    if (!result) return null;

    // Extract from content.metadata or token_info
    const metadata = result.content?.metadata;
    const tokenInfo = result.token_info;

    return {
      symbol: metadata?.symbol || tokenInfo?.symbol || 'UNKNOWN',
      name: metadata?.name || tokenInfo?.name || 'Unknown Token',
      decimals: tokenInfo?.decimals ?? 6,
    };
  } catch (err) {
    console.error(`[getAssetMetadata] Failed for ${mintAddress}:`, err);
    return null;
  }
}
