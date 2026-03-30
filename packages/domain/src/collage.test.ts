import { describe, expect, it } from 'vitest';
import {
  applyAlbumBias,
  applyQualitySignalsToImages,
  buildAlternateCandidates,
  composeCollage,
  deduplicateImageCandidates,
  scoreImageCandidate,
  type ImageCandidate,
} from './collage.js';

function makeImage(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    art: `https://example.com/${Math.random().toString(36).slice(2)}.jpg`,
    type: 'photo',
    score: 50,
    ...overrides,
  };
}

describe('collage policies', () => {
  it('scores an image candidate with source metadata', () => {
    const image = scoreImageCandidate(
      {
        art: 'https://example.com/artist.jpg',
        title: 'Press portrait',
        type: 'photo',
        dims: [1200, 1600],
        year: new Date().getFullYear(),
      },
      'wiki-main',
    );

    expect(image.score).toBeGreaterThan(40);
    expect(image.tags).toContain('press-photo');
    expect(image.tags).toContain('high-res');
    expect(image.src).toBe('wiki-main');
  });

  it('deduplicates normalized URLs', () => {
    const images = deduplicateImageCandidates([
      makeImage({ art: 'https://example.com/thumb/foo/300px-a.jpg?x=1' }),
      makeImage({ art: 'https://example.com/thumb/foo/600px-a.jpg?x=2' }),
      makeImage({ art: 'https://example.com/unique.jpg' }),
    ]);

    expect(images).toHaveLength(2);
  });

  it('applies quality signals to reject and prefer images', () => {
    const base = [
      makeImage({ art: 'https://example.com/reject.jpg', score: 70 }),
      makeImage({ art: 'https://example.com/prefer.jpg', score: 40 }),
    ];

    const updated = applyQualitySignalsToImages(base, {
      rejected: ['https://example.com/reject.jpg'],
      preferred: ['https://example.com/prefer.jpg'],
    });

    expect(updated[0]?.score).toBe(0);
    expect(updated[1]?.score).toBe(60);
  });

  it('boosts matching album era when album filter matches', () => {
    const images = applyAlbumBias(
      [
        makeImage({ art: 'https://example.com/album.jpg', type: 'album', name: 'Positions', year: 2020, score: 40 }),
        makeImage({ art: 'https://example.com/era.jpg', type: 'photo', year: 2021, score: 40 }),
        makeImage({ art: 'https://example.com/other.jpg', type: 'photo', year: 2015, score: 40 }),
      ],
      'Positions',
    );

    const matchingAlbum = images.find((image) => image.name === 'Positions');
    const matchingEra = images.find((image) => image.art === 'https://example.com/era.jpg');
    const other = images.find((image) => image.art === 'https://example.com/other.jpg');

    expect((matchingAlbum?.score ?? 0) - 40).toBeGreaterThanOrEqual(20);
    expect((matchingEra?.score ?? 0) - 40).toBeGreaterThanOrEqual(15);
    expect(other?.score).toBe(40);
  });

  it('composes a diverse collage and provides alternates', () => {
    const pool = [
      makeImage({ art: 'https://example.com/album.jpg', type: 'album', score: 90, year: 2024 }),
      makeImage({ art: 'https://example.com/photo-1.jpg', type: 'photo', score: 80, year: 2024 }),
      makeImage({ art: 'https://example.com/photo-2.jpg', type: 'photo', score: 75, year: 2020 }),
      makeImage({ art: 'https://example.com/video.jpg', type: 'video', score: 74, year: 2023 }),
      makeImage({ art: 'https://example.com/single.jpg', type: 'single', score: 73, year: 2022 }),
      makeImage({ art: 'https://example.com/alt.jpg', type: 'photo', score: 72, year: 2021 }),
    ];

    const selected = composeCollage(pool, null, 4);
    const alternates = buildAlternateCandidates(pool, selected, 10);

    expect(selected).toHaveLength(4);
    expect(new Set(selected.map((image) => image.art)).size).toBe(4);
    expect(alternates.every((image) => !selected.some((selectedImage) => selectedImage.art === image.art))).toBe(true);
  });

  it('prioritizes strong photo alternates over weaker artwork', () => {
    const selected = [makeImage({ art: 'https://example.com/selected.jpg', type: 'photo', score: 90 })];
    const alternates = buildAlternateCandidates(
      [
        ...selected,
        makeImage({ art: 'https://example.com/album.jpg', type: 'album', score: 92, tags: ['album-art'] }),
        makeImage({ art: 'https://example.com/photo.jpg', type: 'photo', score: 82, tags: ['press-photo', 'portrait-ratio'] }),
      ],
      selected,
      5,
      'photo',
    );

    expect(alternates[0]?.art).toBe('https://example.com/photo.jpg');
  });
});
