// Canvas import with fallback chain
let createCanvasFn: (w: number, h: number) => any;
try {
  const napi = require('@napi-rs/canvas');
  createCanvasFn = napi.createCanvas;
} catch {
  try {
    const skia = require('skia-canvas');
    createCanvasFn = (w: number, h: number) => new skia.Canvas(w, h);
  } catch {
    const nodeCanvas = require('canvas');
    createCanvasFn = nodeCanvas.createCanvas;
  }
}

import { BadgeInput } from '../types';

const COLOR_SCHEMES = {
  red: {
    primary: '#DC2626',
    gradStart: '#7F1D1D',
    gradEnd: '#DC2626',
    accent: '#FCA5A5',
    emoji: '🐔',
    bg: '#1A0A0A',
  },
  gold: {
    primary: '#F59E0B',
    gradStart: '#78350F',
    gradEnd: '#F59E0B',
    accent: '#FDE68A',
    emoji: '🎓',
    bg: '#1A1400',
  },
  platinum: {
    primary: '#94A3B8',
    gradStart: '#334155',
    gradEnd: '#94A3B8',
    accent: '#CBD5E1',
    emoji: '👑',
    bg: '#0F172A',
  },
};

const CONFIDENCE_COLORS = {
  HIGH: '#22C55E',   // Green
  MEDIUM: '#F59E0B', // Amber
  LOW: '#EF4444',    // Red
};

export async function generateBadge(input: BadgeInput): Promise<string> {
  const W = 800;
  const H = 650; // Slightly taller to fit confidence indicator
  const canvas = createCanvasFn(W, H);
  const ctx = canvas.getContext('2d');
  const c = COLOR_SCHEMES[input.badge_color];

  // ─── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // ─── Outer border with glow ──────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = c.primary;
  ctx.lineWidth = 3;
  ctx.shadowColor = c.primary;
  ctx.shadowBlur = 20;
  drawRoundRect(ctx, 20, 20, W - 40, H - 40, 16);
  ctx.stroke();
  ctx.restore();

  // ─── Medal circle ────────────────────────────────────────────────────────
  const cx = W / 2;
  const medalY = 140;
  const medalR = 70;

  const grad = ctx.createRadialGradient(cx, medalY, 10, cx, medalY, medalR);
  grad.addColorStop(0, c.gradEnd);
  grad.addColorStop(1, c.gradStart);

  ctx.beginPath();
  ctx.arc(cx, medalY, medalR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ─── Emoji in medal ──────────────────────────────────────────────────────
  ctx.font = '40px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.emoji, cx, medalY);

  // ─── Token Symbol (NEW) ──────────────────────────────────────────────────
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = c.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(input.token_symbol, cx, 230);

  // ─── Title ───────────────────────────────────────────────────────────────
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = c.primary;
  ctx.fillText(input.badge_title, cx, 270);

  // ─── Subtitle ────────────────────────────────────────────────────────────
  ctx.font = '14px monospace';
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = 0.8;
  ctx.fillText(input.exit_venue, cx, 305);
  ctx.globalAlpha = 1;

  // ─── Confidence Indicator (NEW) ──────────────────────────────────────────
  const confColor = CONFIDENCE_COLORS[input.confidence];
  const confText = `${input.confidence} CONFIDENCE`;
  ctx.font = 'bold 12px monospace';
  const confWidth = ctx.measureText(confText).width + 20;
  const confX = cx - confWidth / 2;
  const confY = 335;

  // Confidence pill background
  ctx.fillStyle = confColor;
  ctx.globalAlpha = 0.2;
  drawRoundRect(ctx, confX, confY, confWidth, 22, 11);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Confidence pill border
  ctx.strokeStyle = confColor;
  ctx.lineWidth = 1;
  drawRoundRect(ctx, confX, confY, confWidth, 22, 11);
  ctx.stroke();

  // Confidence text
  ctx.fillStyle = confColor;
  ctx.textBaseline = 'middle';
  ctx.fillText(confText, cx, confY + 11);

  // ─── Divider ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = c.primary;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(100, 375);
  ctx.lineTo(W - 100, 375);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ─── Detail rows ─────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const labelX = 100;
  const valueX = 230;
  const rows = [
    { label: 'WALLET', value: truncAddr(input.wallet) },
    { label: 'TOKEN', value: truncAddr(input.token) },
    { label: 'EXIT DATE', value: formatDate(input.sell_timestamp) },
  ];

  rows.forEach((row, i) => {
    const y = 395 + i * 30;
    ctx.font = '12px monospace';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(row.label, labelX, y);
    ctx.fillStyle = '#D1D5DB';
    ctx.fillText(row.value, valueX, y);
  });

  // ─── Flavor text ─────────────────────────────────────────────────────────
  ctx.font = 'italic 14px monospace';
  ctx.fillStyle = c.primary;
  ctx.textAlign = 'center';
  ctx.fillText(`"${input.exit_type}"`, cx, 510);

  // ─── Footer ──────────────────────────────────────────────────────────────
  ctx.font = '10px monospace';
  ctx.fillStyle = '#374151';
  ctx.fillText('Verified on-chain by APIX402 · Bonding Curve Exit Badge v2', cx, 600);

  // ─── Export ──────────────────────────────────────────────────────────────
  let buffer: Buffer;
  if (typeof canvas.toBuffer === 'function') {
    const result = canvas.toBuffer('image/jpeg');
    buffer = result instanceof Promise ? await result : result;
  } else if (typeof canvas.toBufferSync === 'function') {
    buffer = canvas.toBufferSync('image/jpeg');
  } else {
    buffer = await canvas.toBuffer('image/jpeg');
  }

  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

function truncAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split('T')[0];
}

function drawRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
