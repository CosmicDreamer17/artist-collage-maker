import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

const PORT = 3111; // Use a different port for tests
let serverProcess;

// Start a test server instance
beforeAll(async () => {
  serverProcess = spawn('node', ['-e', `
    process.env.PORT = ${PORT};
    const express = require('express');
    const Database = require('better-sqlite3');
    const path = require('path');
    const app = express();
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(\`
      CREATE TABLE IF NOT EXISTS images (url TEXT PRIMARY KEY, artist TEXT NOT NULL, source TEXT, score REAL DEFAULT 0, first_seen INTEGER DEFAULT (unixepoch()));
      CREATE TABLE IF NOT EXISTS quality_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, artist TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('reject','prefer','swap_out','swap_in')), timestamp INTEGER DEFAULT (unixepoch()));
    \`);
    const upsertImage = db.prepare('INSERT INTO images (url, artist, source, score) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET score = excluded.score');
    const insertSignal = db.prepare('INSERT INTO quality_signals (url, artist, action) VALUES (?, ?, ?)');
    const getArtistRejected = db.prepare('SELECT DISTINCT url FROM quality_signals WHERE artist = ? AND action = \\'reject\\'');
    const getArtistPreferred = db.prepare('SELECT DISTINCT url FROM quality_signals WHERE artist = ? AND action = \\'prefer\\'');
    app.use(express.json());
    app.post('/api/signal', (req, res) => {
      const { url, artist, action } = req.body;
      if (!url || !artist || !action) return res.status(400).json({ error: 'Missing fields' });
      insertSignal.run(url, artist.toLowerCase(), action);
      res.json({ ok: true });
    });
    app.post('/api/images', (req, res) => {
      const { images, artist } = req.body;
      if (!images || !artist) return res.status(400).json({ error: 'Missing fields' });
      const tx = db.transaction((imgs) => { for (const img of imgs) upsertImage.run(img.url, artist.toLowerCase(), img.source || '', img.score || 0); });
      tx(images);
      res.json({ ok: true, count: images.length });
    });
    app.get('/api/quality/:artist', (req, res) => {
      const artist = req.params.artist.toLowerCase();
      const rejected = getArtistRejected.all(artist).map(r => r.url);
      const preferred = getArtistPreferred.all(artist).map(r => r.url);
      res.json({ rejected, preferred });
    });
    app.listen(${PORT}, () => console.log('Test server on ' + ${PORT}));
  `], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });

  // Wait for server to start
  await new Promise((resolve) => {
    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('Test server')) resolve();
    });
    setTimeout(resolve, 3000);
  });
});

afterAll(() => {
  if (serverProcess) serverProcess.kill();
});

const BASE = `http://localhost:${PORT}`;

describe('Quality API', () => {
  it('POST /api/signal records a reject', async () => {
    const resp = await fetch(`${BASE}/api/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/bad.jpg', artist: 'Test Artist', action: 'reject' }),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.ok).toBe(true);
  });

  it('POST /api/signal records a prefer', async () => {
    const resp = await fetch(`${BASE}/api/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/good.jpg', artist: 'Test Artist', action: 'prefer' }),
    });
    expect(resp.ok).toBe(true);
  });

  it('POST /api/signal rejects invalid action', async () => {
    const resp = await fetch(`${BASE}/api/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/x.jpg', artist: 'Test', action: 'invalid' }),
    });
    expect(resp.ok).toBe(false);
  });

  it('POST /api/signal rejects missing fields', async () => {
    const resp = await fetch(`${BASE}/api/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/x.jpg' }),
    });
    expect(resp.status).toBe(400);
  });

  it('GET /api/quality returns rejected and preferred', async () => {
    const resp = await fetch(`${BASE}/api/quality/test artist`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.rejected).toContain('https://example.com/bad.jpg');
    expect(data.preferred).toContain('https://example.com/good.jpg');
  });

  it('GET /api/quality normalizes artist name to lowercase', async () => {
    const resp = await fetch(`${BASE}/api/quality/TEST ARTIST`);
    const data = await resp.json();
    expect(data.rejected).toContain('https://example.com/bad.jpg');
  });

  it('GET /api/quality returns empty for unknown artist', async () => {
    const resp = await fetch(`${BASE}/api/quality/nobody`);
    const data = await resp.json();
    expect(data.rejected).toEqual([]);
    expect(data.preferred).toEqual([]);
  });
});

describe('Images API', () => {
  it('POST /api/images upserts batch', async () => {
    const resp = await fetch(`${BASE}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: 'Sabrina Carpenter',
        images: [
          { url: 'https://itunes.com/a.jpg', source: 'itunes-album', score: 85 },
          { url: 'https://itunes.com/b.jpg', source: 'itunes-video', score: 60 },
          { url: 'https://wiki.com/c.jpg', source: 'wiki-cat', score: 72 },
        ],
      }),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.count).toBe(3);
  });

  it('POST /api/images rejects missing artist', async () => {
    const resp = await fetch(`${BASE}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [{ url: 'x', source: 'x', score: 0 }] }),
    });
    expect(resp.status).toBe(400);
  });

  it('POST /api/images handles duplicate URLs (upsert)', async () => {
    const resp = await fetch(`${BASE}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: 'Sabrina Carpenter',
        images: [{ url: 'https://itunes.com/a.jpg', source: 'itunes-album', score: 90 }],
      }),
    });
    expect(resp.ok).toBe(true);
    expect((await resp.json()).count).toBe(1);
  });
});
