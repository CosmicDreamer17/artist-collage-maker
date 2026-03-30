import { describe, expect, it } from 'vitest';
import type { ArtistSearchGateway, BuildCollageUseCaseDeps } from './index.js';
import { BuildCollageUseCase, ResolveArtistQueryUseCase } from './index.js';
import type { CreateImage, CreateQualitySignal, Image, ImageCandidate } from '@starter/domain';

class FakeImageRepository {
  constructor(private readonly existing: Image[] = []) {}

  saved: CreateImage[] = [];

  async findByArtist(): Promise<Image[]> {
    return this.existing;
  }

  async saveBatch(images: CreateImage[]): Promise<void> {
    this.saved.push(...images);
  }
}

class FakeSignalRepository {
  constructor(private readonly data: { rejected: string[]; preferred: string[] }) {}

  async findByArtist() {
    return this.data;
  }

  async save(_signal: CreateQualitySignal): Promise<void> {
    // noop
  }
}

function createDeps(overrides: Partial<BuildCollageUseCaseDeps> = {}): BuildCollageUseCaseDeps & { imageRepository: FakeImageRepository } {
  const imageRepository = new FakeImageRepository();
  const base: BuildCollageUseCaseDeps = {
    imageRepository,
    signalRepository: new FakeSignalRepository({ rejected: [], preferred: ['https://example.com/preferred.jpg'] }),
    artistSearchGateway: {
      async searchArtists(term: string) {
        if (term.toLowerCase() === 'ariana grande') {
          return [{ artistName: 'Ariana Grande', artistId: 1 }];
        }
        return [];
      },
    },
    artistCatalogGateway: {
      async fetchAlbums() {
        return [
          { art: 'https://example.com/album.jpg', type: 'album', name: 'Positions', label: 'Positions (2020)', score: 70, year: 2020 },
        ] satisfies ImageCandidate[];
      },
      async fetchVideos() {
        return [{ art: 'https://example.com/video.jpg', type: 'video', score: 65, year: 2021 }] satisfies ImageCandidate[];
      },
      async fetchSingles() {
        return [{ art: 'https://example.com/single.jpg', type: 'single', score: 60, year: 2020 }] satisfies ImageCandidate[];
      },
    },
    photoGateways: [
      {
        async fetchPhotos() {
          return [
            { art: 'https://example.com/preferred.jpg', type: 'photo', score: 50, year: 2020 },
            { art: 'https://example.com/reject.jpg', type: 'photo', score: 55, year: 2020 },
          ] satisfies ImageCandidate[];
        },
        },
      ],
  };

  const resolvedImageRepository = overrides.imageRepository ?? imageRepository;

  return {
    ...base,
    ...overrides,
    imageRepository: resolvedImageRepository as FakeImageRepository,
  };
}

describe('ResolveArtistQueryUseCase', () => {
  it('splits album-qualified input and resolves the artist', async () => {
    const gateway: ArtistSearchGateway = {
      async searchArtists(term: string) {
        if (term === 'Ariana Grande') {
          return [{ artistName: 'Ariana Grande', artistId: 7 }];
        }
        return [];
      },
    };

    const result = await new ResolveArtistQueryUseCase(gateway).execute('Ariana Grande Positions');
    expect(result).toEqual({
      artistName: 'Ariana Grande',
      artistId: 7,
      albumFilter: 'Positions',
    });
  });

  it('prefers the real artist split when the album title repeats the artist name', async () => {
    const gateway: ArtistSearchGateway = {
      async searchArtists(term: string) {
        if (term.toLowerCase().includes('indigo girls')) {
          return [{ artistName: 'Indigo Girls', artistId: 11 }];
        }
        return [];
      },
    };

    const result = await new ResolveArtistQueryUseCase(gateway).execute(
      'Indigo Girls Indigo Girls Live With the University of Colorado Symphony Orchestra',
    );

    expect(result).toEqual({
      artistName: 'Indigo Girls',
      artistId: 11,
      albumFilter: 'Indigo Girls Live With the University of Colorado Symphony Orchestra',
    });
  });

  it('keeps exact multi-word artists intact when a shorter split also returns results', async () => {
    const gateway: ArtistSearchGateway = {
      async searchArtists(term: string) {
        if (term === 'Billie Eilish') {
          return [{ artistName: 'Billie Eilish', artistId: 12 }];
        }
        if (term === 'Billie') {
          return [{ artistName: 'Billie', artistId: 13 }];
        }
        return [];
      },
    };

    const result = await new ResolveArtistQueryUseCase(gateway).execute('Billie Eilish');

    expect(result).toEqual({
      artistName: 'Billie Eilish',
      artistId: 12,
      albumFilter: null,
    });
  });
});

describe('BuildCollageUseCase', () => {
  it('builds a collage, applies signals, and persists candidates', async () => {
    const deps = createDeps({
      signalRepository: new FakeSignalRepository({
        rejected: ['https://example.com/reject.jpg'],
        preferred: ['https://example.com/preferred.jpg'],
      }),
    });

    const result = await new BuildCollageUseCase(deps).execute('Ariana Grande Positions', 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.artist.artistName).toBe('Ariana Grande');
    expect(result.data.artist.albumFilter).toBe('Positions');
    expect(result.data.selectedImages.length).toBeGreaterThan(0);
    expect(result.data.candidatePool.find((image) => image.art === 'https://example.com/reject.jpg')?.score).toBe(0);
    expect(result.data.candidatePool.find((image) => image.art === 'https://example.com/preferred.jpg')?.score).toBe(70);
    expect(deps.imageRepository.saved.length).toBe(result.data.candidatePool.length);
  });

  it('returns artist_not_found when no search match exists', async () => {
    const deps = createDeps({
      artistSearchGateway: {
        async searchArtists() {
          return [];
        },
      },
    });

    const result = await new BuildCollageUseCase(deps).execute('Unknown Artist', 4);
    expect(result).toEqual({
      success: false,
      error: 'artist_not_found',
      message: 'No artist matched that query.',
    });
  });

  it('returns no_images_found when all candidates are below the threshold', async () => {
    const deps = createDeps({
      artistCatalogGateway: {
        async fetchAlbums() {
          return [];
        },
        async fetchVideos() {
          return [];
        },
        async fetchSingles() {
          return [];
        },
      },
      photoGateways: [
        {
          async fetchPhotos() {
            return [{ art: 'https://example.com/low.jpg', type: 'photo', score: 10 }] satisfies ImageCandidate[];
          },
        },
      ],
    });

    const result = await new BuildCollageUseCase(deps).execute('Ariana Grande', 4);
    expect(result).toEqual({
      success: false,
      error: 'no_images_found',
      message: 'No usable images were found for that artist.',
    });
  });

  it('still builds a collage when an optional photo gateway fails', async () => {
    const deps = createDeps({
      photoGateways: [
        {
          async fetchPhotos() {
            throw new Error('wikimedia timeout');
          },
        },
        {
          async fetchPhotos() {
            return [{ art: 'https://example.com/photo-ok.jpg', type: 'photo', score: 72, year: 2023 }] satisfies ImageCandidate[];
          },
        },
      ],
    });

    const result = await new BuildCollageUseCase(deps).execute('Ariana Grande', 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.selectedImages.length).toBeGreaterThan(0);
    expect(result.data.candidatePool.some((image) => image.art === 'https://example.com/photo-ok.jpg')).toBe(true);
  });

  it('still builds a collage when saving discovered images fails', async () => {
    const deps = createDeps({
      imageRepository: {
        async findByArtist() {
          return [];
        },
        async saveBatch() {
          throw new Error('sqlite write failed');
        },
      },
    });

    const result = await new BuildCollageUseCase(deps).execute('Ariana Grande', 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.selectedImages.length).toBeGreaterThan(0);
  });

  it('rehydrates previously discovered images into the candidate pool', async () => {
    const deps = createDeps({
      imageRepository: new FakeImageRepository([
        {
          url: 'https://example.com/saved-photo.jpg' as CreateImage['url'],
          artist: 'Ariana Grande',
          source: 'wiki-main',
          score: 84,
        },
      ]),
      artistCatalogGateway: {
        async fetchAlbums() {
          return [];
        },
        async fetchVideos() {
          return [];
        },
        async fetchSingles() {
          return [];
        },
      },
      photoGateways: [],
    });

    const result = await new BuildCollageUseCase(deps).execute('Ariana Grande', 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.candidatePool.some((image) => image.art === 'https://example.com/saved-photo.jpg')).toBe(true);
    expect(result.data.selectedImages.some((image) => image.art === 'https://example.com/saved-photo.jpg')).toBe(true);
  });
});
