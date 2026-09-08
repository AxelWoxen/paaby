import { getAllEvents } from '../services/eventService.mjs';

export async function getEvents(req, res) {
  try {
    const events = await getAllEvents();

    res.status(200).json({
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Kunne ikke hente events:', error);

    res.status(500).json({
      status: 'error',
      message: 'Kunne ikke hente events'
    });
  }
}