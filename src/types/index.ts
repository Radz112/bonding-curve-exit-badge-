export interface CurveExitRequest {
  wallet: string;
  token: string;
}

export interface VenueScore {
  programId: string;
  score: number;
  sources: string[]; // Where the match was found
}

export interface SellDetection {
  signature: string;
  timestamp: number;
  slot: number;
  tokenDelta: number;        // Negative = sold
  solDelta: number;          // Positive = received SOL
  venueScores: VenueScore[]; // All detected venues with scores
  winningVenue: VenueScore;  // Highest scoring venue
}

export interface CurveExitResult {
  wallet: string;
  token: string;
  token_symbol: string;
  exit_type: string;
  exit_venue: string;
  description: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sell_signature: string;
  sell_timestamp: number;
}

export interface BadgeInput {
  badge_title: string;
  badge_color: 'red' | 'gold' | 'platinum';
  exit_type: string;
  exit_venue: string;
  token_symbol: string;
  wallet: string;
  token: string;
  sell_timestamp: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
}

export interface CachedResult {
  result: CurveExitResult;
  badge_base64: string;
  cached_at: number;
}

export interface ApiResponse {
  status: 'success' | 'error';
  data?: {
    wallet: string;
    token_symbol: string;
    exit_type: string;
    exit_venue: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    image_base64: string;
    pay_to_address: string;
    sell_signature: string;
    sell_timestamp: string;
  };
  error?: string;
  cached?: boolean;
}
