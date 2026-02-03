import { Router } from 'express';
import { getCurveExit, postCurveExit } from '../controllers/curve.controller';

const router = Router();

router.get('/api/v1/solana/curve-exit', getCurveExit);
router.post('/api/v1/solana/curve-exit', postCurveExit);

export default router;
