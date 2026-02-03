import { Request, Response } from 'express';
import { analyzeCurveExit } from '../services/curve.service';
import { generateBadge } from '../services/badge.service';
import { hasCache, getCache, setCache, getCacheStats } from '../services/cache.service';
import { EXIT_REGISTRY, CONFIG } from '../config/constants';
import { CurveExitRequest, ApiResponse, CachedResult } from '../types';

const REQUEST_TIMEOUT_MS = 25000;

/**
 * GET /api/v1/solana/curve-exit
 * APIX402 registration validation endpoint.
 */
export async function getCurveExit(_req: Request, res: Response) {
  const stats = getCacheStats();

  return res.status(200).json({
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
    cache_stats: stats,
  });
}

/**
 * POST /api/v1/solana/curve-exit
 * Main API endpoint — called by APIX402 after payment.
 * NO payment middleware — payment handled by APIX402 gateway.
 */
export async function postCurveExit(req: Request, res: Response) {
  try {
    // ─── APIX402 Nested Body Extraction ────────────────────────────────────
    const nestedBody = req.body?.body || req.body;
    const payload: CurveExitRequest =
      typeof nestedBody === 'string' ? JSON.parse(nestedBody) : nestedBody;

    // ─── Validation ────────────────────────────────────────────────────────
    if (!payload.wallet || typeof payload.wallet !== 'string' || payload.wallet.length < 32) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid "wallet" — must be a valid Solana address',
      } as ApiResponse);
    }
    if (!payload.token || typeof payload.token !== 'string' || payload.token.length < 32) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid "token" — must be a valid token mint address',
      } as ApiResponse);
    }

    // ─── Cache Check ───────────────────────────────────────────────────────
    if (hasCache(payload.wallet, payload.token)) {
      const cached = getCache(payload.wallet, payload.token)!;
      return res.status(200).json({
        status: 'success',
        cached: true,
        data: {
          wallet: cached.result.wallet,
          token_symbol: cached.result.token_symbol,
          exit_type: cached.result.exit_type,
          exit_venue: cached.result.exit_venue,
          confidence: cached.result.confidence,
          description: cached.result.description,
          image_base64: cached.badge_base64,
          pay_to_address: CONFIG.PAY_TO_ADDRESS,
          sell_signature: cached.result.sell_signature,
          sell_timestamp: new Date(cached.result.sell_timestamp * 1000).toISOString(),
        },
      } as ApiResponse);
    }

    // ─── Core Logic with Timeout ───────────────────────────────────────────
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 25s')), REQUEST_TIMEOUT_MS)
    );

    const exitResult = await Promise.race([
      analyzeCurveExit(payload),
      timeoutPromise,
    ]);

    // ─── Badge Generation ──────────────────────────────────────────────────
    const exitInfoKey = Object.keys(EXIT_REGISTRY).find(
      k => EXIT_REGISTRY[k]?.exit_type === exitResult.exit_type
    );
    const exitInfo = exitInfoKey ? EXIT_REGISTRY[exitInfoKey] : null;

    if (!exitInfo) {
      return res.status(500).json({
        status: 'error',
        error: `Unable to map exit type: ${exitResult.exit_type}`,
      } as ApiResponse);
    }

    const badgeBase64 = await generateBadge({
      badge_title: exitInfo.badge_title,
      badge_color: exitInfo.badge_color,
      exit_type: exitResult.exit_type,
      exit_venue: exitResult.exit_venue,
      token_symbol: exitResult.token_symbol,
      wallet: exitResult.wallet,
      token: exitResult.token,
      sell_timestamp: exitResult.sell_timestamp,
      confidence: exitResult.confidence,
    });

    // ─── Store in Cache (Immutable) ────────────────────────────────────────
    const cachedData: CachedResult = {
      result: exitResult,
      badge_base64: badgeBase64,
      cached_at: Date.now(),
    };
    setCache(payload.wallet, payload.token, cachedData);

    // ─── Response ──────────────────────────────────────────────────────────
    return res.status(200).json({
      status: 'success',
      cached: false,
      data: {
        wallet: exitResult.wallet,
        token_symbol: exitResult.token_symbol,
        exit_type: exitResult.exit_type,
        exit_venue: exitResult.exit_venue,
        confidence: exitResult.confidence,
        description: exitResult.description,
        image_base64: badgeBase64,
        pay_to_address: CONFIG.PAY_TO_ADDRESS,
        sell_signature: exitResult.sell_signature,
        sell_timestamp: new Date(exitResult.sell_timestamp * 1000).toISOString(),
      },
    } as ApiResponse);

  } catch (err: any) {
    console.error(`[curve-exit] Error: ${err.message}`);

    const statusCode =
      err.message.includes('No sell transaction') ? 404 :
      err.message.includes('timed out') ? 504 : 500;

    return res.status(statusCode).json({
      status: 'error',
      error: err.message,
    } as ApiResponse);
  }
}
