import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { events } from './routes/events.js';
import { documents } from './routes/documents.js';
import { verifyOwnerPassword, issueOwnerToken } from './auth.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Owner login — exchange the password for a JWT.
app.post('/api/auth/login', async (req, res) => {
  const ok = await verifyOwnerPassword(req.body?.password);
  if (!ok) return res.status(401).json({ error: 'Неверный пароль' });
  res.json({ token: issueOwnerToken() });
});

app.use('/api/events', events);
app.use('/api', documents);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const port = process.env.PORT || 8080;
// Bind to loopback only — the API is never exposed publicly; nginx fronts it
// with TLS. Override with HOST=0.0.0.0 if running without a reverse proxy.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`API listening on ${host}:${port}`));
