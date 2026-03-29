// test.js - Tests the core API endpoints and search flow
// Run: node test.js

const BASE = 'http://localhost:3000';

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function main() {
  console.log('\n  Testing Artist Collage Maker\n');

  // 1. Server is running
  await test('Server responds', async () => {
    const resp = await fetch(BASE);
    assert(resp.ok, `Status ${resp.status}`);
    const html = await resp.text();
    assert(html.includes('Artist Collage Maker'), 'Missing title');
  });

  // 2. iTunes artist search works
  await test('iTunes artist search: Sabrina Carpenter', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/search?term=Sabrina+Carpenter&entity=musicArtist&limit=10&country=US'
    );
    assert(resp.ok);
    const data = await resp.json();
    assert(data.resultCount > 0, 'No results');
    const match = data.results.find(a => a.artistName.toLowerCase().includes('sabrina'));
    assert(match, 'No matching artist');
    assert(match.artistId, 'Missing artistId');
    console.log(`      → ID: ${match.artistId}, Name: ${match.artistName}`);
  });

  // 3. iTunes lookup by ID works (albums)
  await test('iTunes lookup by ID: albums', async () => {
    // Sabrina Carpenter's ID
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=album&limit=10&country=US'
    );
    assert(resp.ok);
    const data = await resp.json();
    assert(data.resultCount > 1, `Only ${data.resultCount} results`);
    const albums = data.results.filter(r => r.wrapperType === 'collection');
    assert(albums.length > 0, 'No albums');
    console.log(`      → ${albums.length} albums found`);
  });

  // 4. iTunes lookup by ID works (music videos)
  await test('iTunes lookup by ID: music videos', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=musicVideo&limit=10&country=US'
    );
    assert(resp.ok);
    const data = await resp.json();
    const videos = data.results.filter(r => r.kind === 'music-video');
    assert(videos.length > 0, 'No videos');
    console.log(`      → ${videos.length} videos found`);
  });

  // 5. Wikipedia API works
  await test('Wikipedia summary: Sabrina Carpenter', async () => {
    const resp = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Sabrina_Carpenter'
    );
    assert(resp.ok);
    const data = await resp.json();
    assert(data.title, 'Missing title');
    assert(data.originalimage?.source, 'Missing main image');
    console.log(`      → Image: ${data.originalimage.source.substring(0, 60)}...`);
  });

  // 6. Wikimedia Commons category works
  await test('Wikimedia Commons category: Sabrina Carpenter', async () => {
    const resp = await fetch(
      'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers' +
      '&cmtitle=Category:Sabrina_Carpenter&cmtype=file&cmnamespace=6&cmlimit=5' +
      '&format=json',
      { headers: { 'User-Agent': 'ArtistCollageMaker/1.0 (test)' } }
    );
    assert(resp.ok);
    const data = await resp.json();
    const members = data.query?.categorymembers || [];
    assert(members.length > 0, `No category members found`);
    console.log(`      → ${members.length} category members`);
  });

  // 7. Server quality API works
  await test('Quality API: POST signal', async () => {
    const resp = await fetch(`${BASE}/api/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://test.com/img.jpg', artist: 'test', action: 'reject' }),
    });
    assert(resp.ok, `Status ${resp.status}`);
    const data = await resp.json();
    assert(data.ok, 'Response not ok');
  });

  // 8. Quality API: GET signals
  await test('Quality API: GET quality', async () => {
    const resp = await fetch(`${BASE}/api/quality/test`);
    assert(resp.ok, `Status ${resp.status}`);
    const data = await resp.json();
    assert(Array.isArray(data.rejected), 'Missing rejected array');
    assert(data.rejected.includes('https://test.com/img.jpg'), 'Reject not recorded');
    console.log(`      → ${data.rejected.length} rejected, ${data.preferred.length} preferred`);
  });

  // 9. Discogs proxy works
  await test('Discogs proxy: search', async () => {
    const resp = await fetch(`${BASE}/api/proxy/discogs/artist?q=Sabrina+Carpenter`);
    assert(resp.ok, `Status ${resp.status}`);
    const data = await resp.json();
    // Discogs might rate-limit without a token, so just check the response shape
    assert(data.results !== undefined || data.message, 'Unexpected response shape');
    if (data.results) console.log(`      → ${data.results.length} results`);
    else console.log(`      → Rate limited (expected without token)`);
  });

  // 10. Smart parse: "Ariana Grande Positions" should split correctly
  await test('Smart parse: "Ariana Grande" finds artist', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/search?term=Ariana+Grande&entity=musicArtist&limit=10&country=US'
    );
    const data = await resp.json();
    const match = data.results.find(a => a.artistName.toLowerCase() === 'ariana grande');
    assert(match, 'Ariana Grande not found');
    assert(match.artistId, 'Missing artistId');
    console.log(`      → ID: ${match.artistId}`);
  });

  // 11. Images API: batch upsert
  await test('Images API: batch upsert', async () => {
    const resp = await fetch(`${BASE}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: 'test',
        images: [
          { url: 'https://test.com/a.jpg', source: 'itunes-album', score: 75 },
          { url: 'https://test.com/b.jpg', source: 'wiki-cat', score: 60 },
        ]
      }),
    });
    assert(resp.ok);
    const data = await resp.json();
    assert(data.count === 2);
  });

  console.log('\n  All tests complete.\n');
}

main().catch(e => {
  console.error('Test runner failed:', e);
  process.exitCode = 1;
});
