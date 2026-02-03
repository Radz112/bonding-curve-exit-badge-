import express from 'express';
import { getCurveExit, postCurveExit } from './controllers/curve.controller';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/v1/solana/curve-exit', getCurveExit);
app.post('/api/v1/solana/curve-exit', postCurveExit);

export default app;
