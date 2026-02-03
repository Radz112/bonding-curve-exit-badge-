import express from 'express';
import curveRoutes from './routes/curve.routes';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: 'v2' });
});

app.use(curveRoutes);

export default app;
