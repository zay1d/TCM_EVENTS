import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { requireOwner } from '../auth.js';
import { presignUpload, downloadUrl, deleteObject } from '../r2.js';
import { ah } from '../async.js';

export const documents = Router();

// ── Public reads ───────────────────────────────────────────────────

// List ready documents for an event.
documents.get('/events/:eventId/documents', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT id, filename, content_type, size, status, created_at
       FROM documents
      WHERE event_id = $1 AND status = 'ready'
   ORDER BY created_at DESC`,
    [req.params.eventId]
  );
  res.json(rows);
}));

// Issue a short-lived download URL (redirect) for a document.
documents.get('/documents/:id/download', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT storage_key, status FROM documents WHERE id = $1`,
    [req.params.id]
  );
  if (!rows.length || rows[0].status !== 'ready') {
    return res.status(404).json({ error: 'Документ не найден' });
  }
  const url = await downloadUrl(rows[0].storage_key);
  res.redirect(url);
}));

// ── Owner-only mutations ───────────────────────────────────────────

// Step 1: register the document and get a presigned URL to upload straight to R2.
documents.post('/events/:eventId/documents/presign', requireOwner, ah(async (req, res) => {
  const { filename, contentType = 'application/octet-stream', size = null } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'Не указано имя файла' });

  const storageKey = `${req.params.eventId}/${randomUUID()}-${filename}`;
  const { rows } = await query(
    `INSERT INTO documents (event_id, filename, content_type, size, storage_key, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
    [req.params.eventId, filename, contentType, size, storageKey]
  );
  const uploadUrl = await presignUpload(storageKey, contentType);
  res.status(201).json({ documentId: rows[0].id, uploadUrl, storageKey });
}));

// Step 2: after the browser finishes the PUT to R2, mark the document ready.
documents.post('/documents/:id/confirm', requireOwner, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE documents SET status = 'ready' WHERE id = $1 RETURNING id, filename, size, status`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
  res.json(rows[0]);
}));

documents.delete('/documents/:id', requireOwner, ah(async (req, res) => {
  const { rows } = await query(
    `DELETE FROM documents WHERE id = $1 RETURNING storage_key`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
  try {
    await deleteObject(rows[0].storage_key);
  } catch (err) {
    console.error('R2 delete failed (metadata already removed):', err.message);
  }
  res.status(204).end();
}));
