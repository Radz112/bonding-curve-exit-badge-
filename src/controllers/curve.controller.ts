import { Request, Response } from 'express';
import { analyzeCurveExit } from '../services/curve.service';
import { generateBadge } from '../services/badge.service';
import { getCache, setCache, getCacheStats } from '../services/cache.service';
import { EXIT_REGISTRY, CONFIG } from '../config/constants';
import { CurveExitRequest, CurveExitResult, ApiResponse } from '../types';

const REQUEST_TIMEOUT_MS = 25000;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function getCurveExit(_req: Request, res: Response) {
  return res.json({
    endpoint: '/api/v1/solana/curve-exit',
    version: 'v2',
    method: 'POST',
    description: 'Verify where a wallet sold a Pump.fun token with weighted attribution scoring. Returns badge with token symbol and confidence level.',
    pricing: '$0.01 per call',
    pay_to_address: CONFIG.PAY_TO_ADDRESS,
    request_body: {
      wallet: 'string — Solana wallet address',
      token: 'string — Token mint address',
    },
    response_format: {
      status: 'success | error',
      data: {
        wallet: 'string',
        token_symbol: 'string — e.g. $PEPE',
        exit_type: 'Curve Jeet | PumpSwap Graduate | Raydium OG',
        exit_venue: 'string',
        confidence: 'HIGH | MEDIUM | LOW',
        image_base64: 'string',
        pay_to_address: 'string',
      },
    },
    supported_venues: Object.values(EXIT_REGISTRY).map(e => ({
      exit_type: e.exit_type,
      exit_venue: e.exit_venue,
    })),
    cache_stats: getCacheStats(),
  });
}

export async function postCurveExit(req: Request, res: Response) {
  try {
    const nestedBody = req.body?.body || req.body;
    const payload: CurveExitRequest =
      typeof nestedBody === 'string' ? JSON.parse(nestedBody) : nestedBody;

    if (!payload.wallet || !BASE58_RE.test(payload.wallet)) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid "wallet" — must be a base58-encoded Solana address (32-44 chars)',
      });
    }
    if (!payload.token || !BASE58_RE.test(payload.token)) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid "token" — must be a base58-encoded token mint address (32-44 chars)',
      });
    }

    const cached = getCache(payload.wallet, payload.token);
    if (cached) {
      return res.json(formatResponse(cached.result, cached.badge_base64, true));
    }

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Request timed out after 25s')), REQUEST_TIMEOUT_MS);
    });

    const exitResult = await Promise.race([
      analyzeCurveExit(payload),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutHandle!));

    const badgeBase64 = await generateBadge(exitResult);

    setCache(payload.wallet, payload.token, {
      result: exitResult,
      badge_base64: badgeBase64,
      cached_at: Date.now(),
    });

    return res.json(formatResponse(exitResult, badgeBase64, false));

  } catch (err: any) {
    console.error(`[curve-exit] ${err.message}`);

    const statusCode =
      err.message.includes('No sell transaction') ? 404 :
      err.message.includes('timed out') ? 504 : 500;

    return res.status(statusCode).json({ status: 'error', error: err.message });
  }
}

function formatResponse(result: CurveExitResult, badge: string, cached: boolean): ApiResponse {
  return {
    status: 'success',
    cached,
    data: {
      wallet: result.wallet,
      token_symbol: result.token_symbol,
      exit_type: result.exit_type,
      exit_venue: result.exit_venue,
      confidence: result.confidence,
      description: result.description,
      image_base64: badge,
      pay_to_address: CONFIG.PAY_TO_ADDRESS,
      sell_signature: result.sell_signature,
      sell_timestamp: new Date(result.sell_timestamp * 1000).toISOString(),
    },
  };
}
