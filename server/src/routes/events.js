import { Router } from 'express';
import { query } from '../db.js';
import { requireOwner } from '../auth.js';

export const events = Router();

// ── Public reads ───────────────────────────────────────────────────

// List events (lightweight — no full state blob).
events.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, type, event_date, created_at, updated_at
       FROM events
   ORDER BY event_date DESC NULLS LAST, created_at DESC`
  );
  res.json(rows);
});

// Full event including its state blob.
events.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM events WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Ивент не найден' });
  res.json(rows[0]);
});

// ── Owner-only mutations ───────────────────────────────────────────

events.post('/', requireOwner, async (req, res) => {
  const { name, type = null, event_date = null, state = {} } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Не указано название' });
  const { rows } = await query(
    `INSERT INTO events (name, type, event_date, state)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, type, event_date, state]
  );
  res.status(201).json(rows[0]);
});

events.put('/:id', requireOwner, async (req, res) => {
  const { name, type, event_date, state } = req.body || {};
  const { rows } = await query(
    `UPDATE events SET
       name       = COALESCE($2, name),
       type       = COALESCE($3, type),
       event_date = COALESCE($4, event_date),
       state      = COALESCE($5, state),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, name ?? null, type ?? null, event_date ?? null, state ?? null]
  );
  if (!rows.length) return res.status(404).json({ error: 'Ивент не найден' });
  res.json(rows[0]);
});

events.delete('/:id', requireOwner, async (req, res) => {
  const { rowCount } = await query('DELETE FROM events WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Ивент не найден' });
  res.status(204).end();
});
