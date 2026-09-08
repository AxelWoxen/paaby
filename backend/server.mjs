import express from 'express';

const app = express();

const PORT = process.env.PORT || 3000;

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Påby API kjører'
  });
});

app.listen(PORT, () => {
  console.log(`Påby API kjører på http://localhost:${PORT}`);
});