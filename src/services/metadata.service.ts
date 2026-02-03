import { getAssetMetadata } from '../utils/helius';

export async function fetchTokenSymbol(mintAddress: string): Promise<string> {
  const metadata = await getAssetMetadata(mintAddress);

  if (metadata?.symbol && metadata.symbol !== 'UNKNOWN') {
    return metadata.symbol.toUpperCase().slice(0, 10);
  }

  return `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
}
