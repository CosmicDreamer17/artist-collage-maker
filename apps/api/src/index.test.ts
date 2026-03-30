import { describe, expect, it } from 'vitest';
import { createApp } from './index.js';
import type {
  ArtistCatalogGateway,
  ArtistPhotoGateway,
  ArtistSearchGateway,
  ImageRepository,
  QualitySignalRepository,
} from '@starter/application';
import type { CreateImage, CreateQualitySignal, Image } from '@starter/domain';

class InMemoryImageRepository implements ImageRepository {
  saved: CreateImage[] = [];

  async findByArtist(): Promise<Image[]> {
    return [];
  }

  async saveBatch(images: CreateImage[]): Promise<void> {
    this.saved.push(...images);
  }
}

class InMemorySignalRepository implements QualitySignalRepository {
  signals: CreateQualitySignal[] = [];

  async findByArtist(artist: string) {
    const normalized = artist.toLowerCase();
    return {
      rejected: this.signals
        .filter((signal) => signal.artist.toLowerCase() === normalized && ['reject', 'swap_out'].includes(signal.action))
        .map((signal) => signal.url),
      preferred: this.signals
        .filter((signal) => signal.artist.toLowerCase() === normalized && ['prefer', 'swap_in'].includes(signal.action))
        .map((signal) => signal.url),
    };
  }

  async save(signal: CreateQualitySignal): Promise<void> {
    this.signals.push(signal);
  }
}

function makeApp() {
  const imageRepository = new InMemoryImageRepository();
  const signalRepository = new InMemorySignalRepository();
  const artistSearchGateway: ArtistSearchGateway = {
    async searchArtists(term: string) {
      if (term.toLowerCase() === 'sabrina carpenter') {
        return [{ artistName: 'Sabrina Carpenter', artistId: 12 }];
      }
      return [];
    },
  };
  const artistCatalogGateway: ArtistCatalogGateway = {
    async fetchAlbums() {
      return [{ art: 'https://example.com/album.jpg', type: 'album', name: 'Emails I Can’t Send', label: 'Emails I Can’t Send (2022)', score: 88, year: 2022 }];
    },
    async fetchVideos() {
      return [{ art: 'https://example.com/video.jpg', type: 'video', score: 70, year: 2023 }];
    },
    async fetchSingles() {
      return [{ art: 'https://example.com/single.jpg', type: 'single', score: 69, year: 2022 }];
    },
  };
  const photoGateways: ArtistPhotoGateway[] = [
    {
      async fetchPhotos() {
        return [
          { art: 'https://example.com/photo-a.jpg', type: 'photo', score: 81, year: 2024 },
          { art: 'https://example.com/photo-b.jpg', type: 'photo', score: 77, year: 2021 },
        ];
      },
    },
  ];

  return {
    imageRepository,
    signalRepository,
    app: createApp({
      imageRepository,
      signalRepository,
      artistSearchGateway,
      artistCatalogGateway,
      photoGateways,
    }).app,
  };
}

describe('api routes', () => {
  it('reports health', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, storage: 'sqlite' });
  });

  it('records and reads quality signals', async () => {
    const { app } = makeApp();
    const postResponse = await app.request('/api/signal', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/reject.jpg',
        artist: 'Sabrina Carpenter',
        action: 'reject',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(postResponse.status).toBe(201);

    const swapResponse = await app.request('/api/signal', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/swap-in.jpg',
        artist: 'Sabrina Carpenter',
        action: 'swap_in',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(swapResponse.status).toBe(201);

    const getResponse = await app.request('/api/quality/Sabrina%20Carpenter');
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      rejected: ['https://example.com/reject.jpg'],
      preferred: ['https://example.com/swap-in.jpg'],
    });
  });

  it('accepts image persistence requests', async () => {
    const { app, imageRepository } = makeApp();
    const response = await app.request('/api/images', {
      method: 'POST',
      body: JSON.stringify({
        artist: 'Sabrina Carpenter',
        images: [{ url: 'https://example.com/a.jpg', source: 'itunes-album', score: 80 }],
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(imageRepository.saved).toHaveLength(1);
  });

  it('builds a collage result from the orchestration endpoint', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/collage', {
      method: 'POST',
      body: JSON.stringify({ query: 'Sabrina Carpenter', count: 4 }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.artist.artistName).toBe('Sabrina Carpenter');
    expect(payload.data.selectedImages).toHaveLength(4);
    expect(payload.data.albums).toHaveLength(1);
  });

  it('returns not found when the artist cannot be resolved', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/collage', {
      method: 'POST',
      body: JSON.stringify({ query: 'Nobody', count: 4 }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'artist_not_found',
      message: 'No artist matched that query.',
    });
  });
});
