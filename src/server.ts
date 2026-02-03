import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { CONFIG } from './config/constants';

if (!CONFIG.HELIUS_API_KEY) {
  console.warn('[curve-exit-badge] HELIUS_API_KEY is not set — all Helius requests will fail');
}

const server = app.listen(CONFIG.PORT, () => {
  console.log(`[curve-exit-badge] running on port ${CONFIG.PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[curve-exit-badge] port ${CONFIG.PORT} is already in use`);
  } else {
    console.error(`[curve-exit-badge] failed to start: ${err.message}`);
  }
  process.exit(1);
});
