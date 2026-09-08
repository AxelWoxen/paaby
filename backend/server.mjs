import express from 'express';
import healthRoutes from './routes/healthRoutes.mjs';

const app = express();

const PORT = process.env.PORT || 3000;

// Lar API-et lese JSON fra requests senere
app.use(express.json());

// Routes
app.use('/api/health', healthRoutes);

app.listen(PORT, () => {
  console.log(`Påby API kjører på http://localhost:${PORT}`);
});