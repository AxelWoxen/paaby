import express from 'express';
import healthRoutes from './routes/healthRoutes.mjs';
import eventRoutes from './routes/eventRoutes.mjs';
import cors from 'cors';

const app = express();

const PORT = process.env.PORT || 3000;


app.use(cors({
  origin: [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://paaby.online',
    'https://www.paaby.online'
  ]
}));

// Lar API-et lese JSON fra requests senere
app.use(express.json());

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/events', eventRoutes);

app.listen(PORT, () => {
  console.log(`Påby API kjører på http://localhost:${PORT}`);
});