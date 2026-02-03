import axios from 'axios';
import { CONFIG } from '../config/constants';

const heliusRest = axios.create({
  baseURL: CONFIG.HELIUS_REST_URL,
  timeout: 30000,
});

export async function getEnhancedHistory(wallet: string, before?: string): Promise<any[]> {
  const params: Record<string, string> = { 'api-key': CONFIG.HELIUS_API_KEY };
  if (before) params.before = before;

  const { data } = await heliusRest.get(`/v0/addresses/${wallet}/transactions`, { params });
  return Array.isArray(data) ? data : [];
}

const heliusRpc = axios.create({
  baseURL: CONFIG.HELIUS_RPC_URL,
  timeout: 15000,
});

export async function getAssetMetadata(mintAddress: string): Promise<{
  symbol: string;
  name: string;
  decimals: number;
} | null> {
  try {
    const { data } = await heliusRpc.post('', {
      jsonrpc: '2.0',
      id: 'getAsset',
      method: 'getAsset',
      params: { id: mintAddress },
    });

    const result = data?.result;
    if (!result) return null;

    const metadata = result.content?.metadata;
    const tokenInfo = result.token_info;

    return {
      symbol: metadata?.symbol || tokenInfo?.symbol || 'UNKNOWN',
      name: metadata?.name || tokenInfo?.name || 'Unknown Token',
      decimals: tokenInfo?.decimals ?? 6,
    };
  } catch (err: any) {
    console.error(`[getAssetMetadata] Failed for ${mintAddress}: ${err.message}`);
    return null;
  }
}
