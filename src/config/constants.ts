export const PROGRAM_IDS = {
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMP_SWAP: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
} as const;

export type BadgeColor = 'red' | 'gold' | 'platinum';

export interface ExitInfo {
  exit_type: string;
  exit_venue: string;
  description: string;
  badge_color: BadgeColor;
  badge_title: string;
}

export const EXIT_REGISTRY: Record<string, ExitInfo> = {
  [PROGRAM_IDS.PUMP_FUN]: {
    exit_type: 'Curve Jeet',
    exit_venue: 'Pump.fun Bonding Curve',
    description: 'You sold before the migration. Weak aura.',
    badge_color: 'red',
    badge_title: 'PRE-MIGRATION EXIT',
  },
  [PROGRAM_IDS.PUMP_SWAP]: {
    exit_type: 'PumpSwap Graduate',
    exit_venue: 'PumpSwap AMM',
    description: 'You held through migration. Diamond hands on PumpSwap.',
    badge_color: 'gold',
    badge_title: 'PUMPSWAP GRADUATE',
  },
  [PROGRAM_IDS.RAYDIUM_V4]: {
    exit_type: 'Raydium OG',
    exit_venue: 'Raydium V4 AMM',
    description: 'You held through legacy Raydium migration. True OG status.',
    badge_color: 'platinum',
    badge_title: 'RAYDIUM OG',
  },
};

export const HELIUS_SOURCE_MAP: Record<string, string> = {
  'PUMP_FUN': PROGRAM_IDS.PUMP_FUN,
  'PUMP_SWAP': PROGRAM_IDS.PUMP_SWAP,
  'RAYDIUM': PROGRAM_IDS.RAYDIUM_V4,
};

export const ATTRIBUTION_WEIGHTS = {
  HELIUS_SOURCE: 100,
  INNER_INSTRUCTION: 50,
  INSTRUCTION: 10,
};

export const CONFIDENCE_LEVELS = {
  HIGH: 100,
  MEDIUM: 50,
  LOW: 10,
};

export const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  HELIUS_REST_URL: process.env.HELIUS_REST_URL || 'https://api-mainnet.helius-rpc.com',
  PAY_TO_ADDRESS: process.env.PAY_TO_ADDRESS || '',
  PORT: parseInt(process.env.PORT || '3000', 10),
};

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
