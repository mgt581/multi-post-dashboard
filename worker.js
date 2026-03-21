// Worker routes full implementation

import express from 'express';
import { getWorkerRoutes } from './routes/worker.routes';

const router = express.Router();

// Add your full Worker routes logic here
router.use('/workers', getWorkerRoutes());

export default router;
