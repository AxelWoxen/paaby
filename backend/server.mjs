import express from 'express';
import healthRoutes from './routes/healthRoutes.mjs';
import eventRoutes from './routes/eventRoutes.mjs';
import innsendingRoutes from './routes/innsendingRoutes.mjs';
import bildeRoutes from './routes/bildeRoutes.mjs';
import feedbackRoutes from './routes/feedbackRoutes.mjs';
import analyticsRoutes from './routes/analyticsRoutes.mjs';
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

// Strengere grense enn /api/events — innsendinger skriver til databasen og
// er et naturlig mål for spam/bot-trafikk. Satt høyt nok til at én arrangør
// kan sende inn et helt program (6-10 events) i samme økt — hvert event
// postes fortsatt som egen request mot dette endepunktet.
const innsendingerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'For mange innsendinger. Prøv igjen om en stund.',
  },
});

app.use('/api/innsendinger', innsendingerLimiter, innsendingRoutes);
app.use('/api/bilder', bildeRoutes);

// Anonym "Ris eller ros?" — samme enkle spam-beskyttelse som innsendinger.
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'For mange tilbakemeldinger. Prøv igjen om en stund.',
  },
});

app.use('/api/feedback', feedbackLimiter, feedbackRoutes);

// Første-parts produktanalyse (Innsikt). Fyres mye oftere enn innsendinger
// (hvert kort_åpnet/filter_valgt osv. hos en vanlig nettleser-bruker), men
// er fire-and-forget fra klienten og skal aldri kunne brukes til spam av
// skrivende data — derfor egen, romsligere men fortsatt begrenset grense.
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'For mange forespørsler. Prøv igjen senere.'
  }
});

app.use('/api/analytics', analyticsLimiter, analyticsRoutes);

app.listen(PORT, () => {
  console.log(`Påby API kjører på http://localhost:${PORT}`);
});