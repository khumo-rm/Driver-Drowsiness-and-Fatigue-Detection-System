import { Router } from 'express';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireUser);
dashboardRoutes.get('/summary', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT COUNT(DISTINCT s.id)::int sessions, COUNT(e.id)::int drowsiness_events,
      COUNT(e.id) FILTER (WHERE e.level='CRITICAL')::int critical_events,
      COALESCE(ROUND(AVG(e.score)::numeric,3),0) average_event_score
      FROM driving_sessions s LEFT JOIN drowsiness_events e ON e.session_id=s.id
      WHERE s.driver_id=$1 AND s.started_at >= now() - interval '30 days'`, [req.auth!.userId]);
    res.json({ periodDays: 30, summary: result.rows[0] });
  } catch (error) { next(error); }
});
