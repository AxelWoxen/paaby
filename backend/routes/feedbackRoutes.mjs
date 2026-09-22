import express from 'express';
import { postFeedback } from '../controllers/feedbackController.mjs';

const router = express.Router();

router.post('/', postFeedback);

export default router;
