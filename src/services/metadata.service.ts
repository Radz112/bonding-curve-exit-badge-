import { getAssetMetadata } from '../utils/helius';
import { TokenMetadata } from '../types';

/**
 * Fetches token symbol for display on badge.
 * Falls back to truncated mint address if lookup fails.
 */
export async function fetchTokenSymbol(mintAddress: string): Promise<string> {
  const metadata = await getAssetMetadata(mintAddress);

  if (metadata?.symbol && metadata.symbol !== 'UNKNOWN') {
    // Format: $SYMBOL (uppercase, max 10 chars)
    const symbol = metadata.symbol.toUpperCase().slice(0, 10);
    return `${symbol}`;
  }

  // Fallback: truncated mint
  return `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
}

/**
 * Fetches full token metadata.
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
  const metadata = await getAssetMetadata(mintAddress);

  return {
    symbol: metadata?.symbol || 'UNKNOWN',
    name: metadata?.name || 'Unknown Token',
    decimals: metadata?.decimals ?? 6,
  };
}
