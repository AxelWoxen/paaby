import express from 'express';
import { getBilde } from '../controllers/bildeController.mjs';

const router = express.Router();

router.get('/:id', getBilde);

export default router;
