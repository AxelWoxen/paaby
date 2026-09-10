import express from 'express';
import healthRoutes from './routes/healthRoutes.mjs';
import eventRoutes from './routes/eventRoutes.mjs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(helmet());
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;


app.use(cors({
  origin: [
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://paaby.no',
  'https://www.paaby.no'
]
}));

// Lar API-et lese JSON fra requests senere
app.use(express.json());

// Routes
app.use('/api/health', healthRoutes);

const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'For mange forespørsler. Prøv igjen senere.'
  }
});

app.use('/api/events', eventsLimiter);
app.use('/api/events', eventRoutes);

app.listen(PORT, () => {
  console.log(`Påby API kjører på http://localhost:${PORT}`);
});