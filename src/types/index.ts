import { BadgeColor } from '../config/constants';

export interface CurveExitRequest {
  wallet: string;
  token: string;
}

export interface VenueScore {
  programId: string;
  score: number;
  sources: string[];
}

export interface SellDetection {
  signature: string;
  timestamp: number;
  tokenDelta: number;
  solDelta: number;
  venueScores: VenueScore[];
  winningVenue: VenueScore;
}

export interface CurveExitResult {
  wallet: string;
  token: string;
  token_symbol: string;
  exit_type: string;
  exit_venue: string;
  description: string;
  confidence: Confidence;
  sell_signature: string;
  sell_timestamp: number;
  badge_color: BadgeColor;
  badge_title: string;
}

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

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
    confidence: Confidence;
    description: string;
    image_base64: string;
    pay_to_address: string;
    sell_signature: string;
    sell_timestamp: string;
  };
  error?: string;
  cached?: boolean;
}
