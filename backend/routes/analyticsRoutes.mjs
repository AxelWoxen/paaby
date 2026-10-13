import express from 'express';
import { postSession, postEvent, postSavedSync } from '../controllers/analyticsController.mjs';

const router = express.Router();

router.post('/session', postSession);
router.post('/event', postEvent);
router.post('/saved/sync', postSavedSync);

export default router;
