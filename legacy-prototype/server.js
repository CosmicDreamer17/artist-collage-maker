const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

// ── DATABASE SETUP ──
const db = new Database(path.join(__dirname, 'quality.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    url TEXT PRIMARY KEY,
    artist TEXT NOT NULL,
    source TEXT,
    score REAL DEFAULT 0,
    first_seen INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS quality_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    artist TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('reject','prefer','swap_out','swap_in')),
    timestamp INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_signals_url ON quality_signals(url);
  CREATE INDEX IF NOT EXISTS idx_signals_artist ON quality_signals(artist);
  CREATE INDEX IF NOT EXISTS idx_images_artist ON images(artist);
`);

// Prepared statements
const upsertImage = db.prepare(`
  INSERT INTO images (url, artist, source, score) VALUES (?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET score = excluded.score
`);

const insertSignal = db.prepare(`
  INSERT INTO quality_signals (url, artist, action) VALUES (?, ?, ?)
`);

const getSignals = db.prepare(`
  SELECT action, COUNT(*) as cnt FROM quality_signals WHERE url = ? GROUP BY action
`);

const getArtistRejected = db.prepare(`
  SELECT DISTINCT url FROM quality_signals WHERE artist = ? AND action = 'reject'
`);

const getArtistPreferred = db.prepare(`
  SELECT DISTINCT url FROM quality_signals WHERE artist = ? AND action = 'prefer'
`);

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(__dirname));

// ── QUALITY API ──

// Record a reject/prefer/swap signal
app.post('/api/signal', (req, res) => {
  const { url, artist, action } = req.body;
  if (!url || !artist || !action) return res.status(400).json({ error: 'Missing fields' });
  try {
    insertSignal.run(url, artist.toLowerCase(), action);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batch upsert images (called after fetching to populate the DB)
app.post('/api/images', (req, res) => {
  const { images, artist } = req.body;
  if (!images || !artist) return res.status(400).json({ error: 'Missing fields' });
  const tx = db.transaction((imgs) => {
    for (const img of imgs) {
      upsertImage.run(img.url, artist.toLowerCase(), img.source || '', img.score || 0);
    }
  });
  try {
    tx(images);
    res.json({ ok: true, count: images.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get quality adjustments for an artist
app.get('/api/quality/:artist', (req, res) => {
  const artist = req.params.artist.toLowerCase();
  const rejected = getArtistRejected.all(artist).map(r => r.url);
  const preferred = getArtistPreferred.all(artist).map(r => r.url);
  res.json({ rejected, preferred });
});

// ── CORS PROXY for external APIs ──

// Discogs proxy
app.get('/api/proxy/discogs/artist', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q param' });
  try {
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=artist&per_page=5`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'ArtistCollageMaker/1.0',
        // Add your Discogs personal access token here for higher rate limits:
        // 'Authorization': 'Discogs token=YOUR_TOKEN_HERE',
      }
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Discogs artist images proxy
app.get('/api/proxy/discogs/images/:id', async (req, res) => {
  try {
    const url = `https://api.discogs.com/artists/${req.params.id}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ArtistCollageMaker/1.0' }
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generic image proxy (for images blocked by CORS)
app.get('/api/proxy/image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ArtistCollageMaker/1.0' }
    });
    const contentType = resp.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).send('Proxy error');
  }
});

// ── START ──
app.listen(PORT, () => {
  console.log(`\n  🎀 Artist Collage Maker running at http://localhost:${PORT}\n`);
});
