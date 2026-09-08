import { checkDatabase } from '../services/healthService.mjs';

export async function getHealth(req, res) {
  try {
    const database = await checkDatabase();

    res.status(200).json({
      status: 'ok',
      message: 'Påby API kjører',
      database: 'connected',
      databaseTime: database.database_time
    });
  } catch (error) {
    console.error('Database health check failed:', error);

    res.status(500).json({
      status: 'error',
      message: 'Påby API kjører, men databasen svarer ikke',
      database: 'disconnected'
    });
  }
}