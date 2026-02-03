import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import http from 'http';
import { clearCache } from './services/cache.service';

async function test() {
  clearCache();

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  const getRes = await fetch(`${base}/api/v1/solana/curve-exit`);
  const getBody = await getRes.json();
  console.assert(getRes.status === 200, 'GET should 200');
  console.assert(getBody.version === 'v2', 'Should be v2');
  console.assert(getBody.pay_to_address !== undefined, 'Should have pay_to_address');
  console.assert(getBody.cache_stats, 'Should have cache_stats');
  console.log('GET handler returns v2 metadata + pay_to_address');

  const badRes = await fetch(`${base}/api/v1/solana/curve-exit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: 'short' }),
  });
  console.assert(badRes.status === 400, 'Should 400 on invalid input');
  console.log('POST validates input correctly');

  const req1 = await fetch(`${base}/api/v1/solana/curve-exit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: { wallet: '11111111111111111111111111111111', token: '22222222222222222222222222222222' },
    }),
  });
  console.assert(req1.status !== 400, 'Should parse nested body');
  console.log('POST parses APIX402 nested body');

  server.close();
  console.log('Phase 6 passed');
}

test().catch(e => { console.error('FAIL', e.message); process.exit(1); });
