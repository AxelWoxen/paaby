import express from 'express';
import { getHealth } from '../controllers/healthController.mjs';

const router = express.Router();

router.get('/', getHealth);

export default router;