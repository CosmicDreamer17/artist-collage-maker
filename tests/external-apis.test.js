import { describe, it, expect } from 'vitest';

// These tests verify external API contracts are still working.
// They make real HTTP calls — run sparingly, not on every CI build.

describe('iTunes Search API', () => {
  it('finds Sabrina Carpenter as musicArtist', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/search?term=Sabrina+Carpenter&entity=musicArtist&limit=5&country=US'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.resultCount).toBeGreaterThan(0);
    const match = data.results.find(a => a.artistName === 'Sabrina Carpenter');
    expect(match).toBeDefined();
    expect(match.artistId).toBeTruthy();
  });

  it('looks up albums by artist ID', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=album&limit=5&country=US'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    const albums = data.results.filter(r => r.wrapperType === 'collection');
    expect(albums.length).toBeGreaterThan(0);
    expect(albums[0].artworkUrl100).toBeTruthy();
  });

  it('looks up music videos by artist ID', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=musicVideo&limit=5&country=US'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    const videos = data.results.filter(r => r.kind === 'music-video');
    expect(videos.length).toBeGreaterThan(0);
  });

  it('looks up songs by artist ID', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=song&limit=5&country=US'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    const songs = data.results.filter(r => r.kind === 'song');
    expect(songs.length).toBeGreaterThan(0);
    expect(songs[0].artworkUrl100).toBeTruthy();
  });

  it('artwork URLs can be upscaled to 600x600', async () => {
    const resp = await fetch(
      'https://itunes.apple.com/lookup?id=390647681&entity=album&limit=1&country=US'
    );
    const data = await resp.json();
    const album = data.results.find(r => r.wrapperType === 'collection');
    expect(album.artworkUrl100).toContain('100x100');
    const hiRes = album.artworkUrl100.replace('100x100', '600x600');
    const imgResp = await fetch(hiRes, { method: 'HEAD' });
    expect(imgResp.ok).toBe(true);
  });
});

describe('Wikipedia REST API', () => {
  it('returns summary with image for Sabrina Carpenter', async () => {
    const resp = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Sabrina_Carpenter'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.title).toBe('Sabrina Carpenter');
    expect(data.originalimage?.source).toBeTruthy();
  });

  it('returns summary for Reneé Rapp (accented name)', async () => {
    const resp = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Rene%C3%A9_Rapp'
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.title.toLowerCase()).toContain('rapp');
  });
});

describe('Wikimedia Commons API', () => {
  it('category search returns files for Sabrina Carpenter', async () => {
    const resp = await fetch(
      'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers' +
      '&cmtitle=Category:Sabrina_Carpenter&cmtype=file&cmnamespace=6&cmlimit=5&format=json',
      { headers: { 'User-Agent': 'ArtistCollageMakerTest/1.0' } }
    );
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    const members = data.query?.categorymembers || [];
    expect(members.length).toBeGreaterThan(0);
  });

  it('imageinfo returns dimensions and MIME type', async () => {
    const resp = await fetch(
      'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers' +
      '&cmtitle=Category:Sabrina_Carpenter&cmtype=file&cmnamespace=6&cmlimit=1&format=json',
      { headers: { 'User-Agent': 'ArtistCollageMakerTest/1.0' } }
    );
    const data = await resp.json();
    const title = data.query?.categorymembers?.[0]?.title;
    expect(title).toBeTruthy();

    const infoResp = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
      '&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json',
      { headers: { 'User-Agent': 'ArtistCollageMakerTest/1.0' } }
    );
    expect(infoResp.ok).toBe(true);
    const infoData = await infoResp.json();
    const pages = Object.values(infoData.query?.pages || {});
    expect(pages.length).toBeGreaterThan(0);
    const info = pages[0].imageinfo?.[0];
    expect(info).toBeDefined();
    expect(info.width).toBeGreaterThan(0);
    expect(info.mime).toBeTruthy();
  });
});

describe('Smart Parse Logic', () => {
  // Test the artist resolution logic without depending on browser code
  async function findArtist(query) {
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10&country=US`
    );
    const data = await resp.json();
    return data.results.find(a => {
      const n = a.artistName.toLowerCase();
      const c = query.toLowerCase();
      if (n === c) return true;
      if (n.includes(c) && n.length <= c.length + 5) return true;
      if (c.includes(n) && c.length <= n.length + 3) return true;
      return false;
    });
  }

  it('resolves "Sabrina Carpenter"', async () => {
    const match = await findArtist('Sabrina Carpenter');
    expect(match).toBeDefined();
    expect(match.artistId).toBe(390647681);
  });

  it('resolves "Billie Eilish"', async () => {
    const match = await findArtist('Billie Eilish');
    expect(match).toBeDefined();
  });

  it('resolves "SZA" (short name)', async () => {
    const match = await findArtist('SZA');
    expect(match).toBeDefined();
  });

  it('does NOT resolve "Sabrina Carpenter GUTS" as artist', async () => {
    const match = await findArtist('Sabrina Carpenter GUTS');
    expect(match).toBeUndefined();
  });

  it('resolves "Olivia Rodrigo" but NOT "Olivia Rodrigo GUTS"', async () => {
    const exact = await findArtist('Olivia Rodrigo');
    expect(exact).toBeDefined();
    const withAlbum = await findArtist('Olivia Rodrigo GUTS');
    expect(withAlbum).toBeUndefined();
  });
});
