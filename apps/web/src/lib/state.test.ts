import { describe, expect, it } from 'vitest';
import type { CollageBuildResult, ImageCandidate } from '@starter/domain';
import {
  applyFocalPointToResult,
  applyLocalQualityAction,
  buildCacheKey,
  createSavedCollageRecord,
  duplicateSavedCollageRecord,
  findReplacementCandidate,
  refreshCollageResult,
  replaceRemovedImage,
  swapSelectedImage,
  swapWorstSelectedImage,
  updateSavedCollageRecord,
  upsertSavedCollageRecord,
  withAlternates,
} from './state.js';

function image(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    art: `https://example.com/${Math.random().toString(36).slice(2)}.jpg`,
    score: 50,
    type: 'photo',
    ...overrides,
  };
}

function collageResult(overrides: Partial<CollageBuildResult> = {}): CollageBuildResult {
  const selectedImages = overrides.selectedImages ?? [image({ art: 'https://example.com/a.jpg', score: 90 })];
  const candidatePool = overrides.candidatePool ?? [
    ...selectedImages,
    image({ art: 'https://example.com/b.jpg', score: 80 }),
  ];

  return {
    artist: { artistName: 'Sabrina Carpenter', artistId: 1, albumFilter: null },
    selectedImages,
    candidatePool,
    alternateCandidates: overrides.alternateCandidates ?? [],
    albums: overrides.albums ?? [],
    ...overrides,
  };
}

describe('web collage state helpers', () => {
  it('normalizes cache keys from queries', () => {
    expect(buildCacheKey('  Sabrina   Carpenter  ')).toBe('acm_sabrina_carpenter');
  });

  it('creates a saved collage record with browser-local autosave metadata', () => {
    const result = collageResult();
    const saved = createSavedCollageRecord(result, ' Sabrina Carpenter ', {
      id: 'collage-1',
      now: new Date('2026-03-29T14:00:00.000Z'),
    });

    expect(saved).toMatchObject({
      id: 'collage-1',
      query: 'Sabrina Carpenter',
      title: 'Sabrina Carpenter',
      mode: 'autosave',
      thumb: 'https://example.com/a.jpg',
      createdAt: '2026-03-29T14:00:00.000Z',
      updatedAt: '2026-03-29T14:00:00.000Z',
    });
  });

  it('keeps multiple collages for the same artist instead of replacing earlier drafts', () => {
    const base = collageResult();
    const first = createSavedCollageRecord(base, 'Billie Eilish', {
      id: 'draft-1',
      now: new Date('2026-03-29T10:00:00.000Z'),
    });
    const second = createSavedCollageRecord(base, 'Billie Eilish', {
      id: 'draft-2',
      now: new Date('2026-03-29T10:05:00.000Z'),
    });

    const saved = upsertSavedCollageRecord([first], second);

    expect(saved).toHaveLength(2);
    expect(saved.map((item) => item.id)).toEqual(['draft-2', 'draft-1']);
  });

  it('updates an active saved collage and moves it to the front', () => {
    const first = createSavedCollageRecord(collageResult(), 'Sabrina Carpenter', {
      id: 'draft-1',
      now: new Date('2026-03-29T10:00:00.000Z'),
    });
    const second = createSavedCollageRecord(
      collageResult({
        artist: { artistName: 'Taylor Swift', artistId: 2, albumFilter: null },
        selectedImages: [image({ art: 'https://example.com/taylor.jpg', score: 92 })],
        candidatePool: [image({ art: 'https://example.com/taylor.jpg', score: 92 })],
      }),
      'Taylor Swift',
      {
        id: 'draft-2',
        now: new Date('2026-03-29T11:00:00.000Z'),
      },
    );

    const updated = updateSavedCollageRecord(
      [second, first],
      'draft-1',
      collageResult({
        selectedImages: [image({ art: 'https://example.com/updated.jpg', score: 95 })],
        candidatePool: [image({ art: 'https://example.com/updated.jpg', score: 95 })],
      }),
      new Date('2026-03-29T12:00:00.000Z'),
    );

    expect(updated[0]?.id).toBe('draft-1');
    expect(updated[0]?.thumb).toBe('https://example.com/updated.jpg');
    expect(updated[0]?.updatedAt).toBe('2026-03-29T12:00:00.000Z');
  });

  it('duplicates an existing collage into a save copy', () => {
    const original = createSavedCollageRecord(collageResult(), 'Sabrina Carpenter', {
      id: 'draft-1',
      now: new Date('2026-03-29T10:00:00.000Z'),
    });

    const duplicated = duplicateSavedCollageRecord([original], 'draft-1', {
      id: 'draft-2',
      now: new Date('2026-03-29T10:15:00.000Z'),
    });

    expect(duplicated.duplicate).toMatchObject({
      id: 'draft-2',
      mode: 'copy',
      title: 'Sabrina Carpenter',
      updatedAt: '2026-03-29T10:15:00.000Z',
    });
    expect(duplicated.collages).toHaveLength(2);
  });

  it('finds a high scoring replacement candidate', () => {
    const selected = [image({ art: 'https://example.com/current.jpg', score: 80 })];
    const replacement = findReplacementCandidate(
      [
        ...selected,
        image({ art: 'https://example.com/album.jpg', type: 'album', score: 92, tags: ['album-art'] }),
        image({ art: 'https://example.com/high.jpg', type: 'photo', score: 90, tags: ['press-photo', 'portrait-ratio'] }),
      ],
      selected,
      selected[0],
    );

    expect(replacement?.art).toBe('https://example.com/high.jpg');
  });

  it('swaps the worst selected image for an alternate', () => {
    const selected = [
      image({ art: 'https://example.com/a.jpg', score: 90 }),
      image({ art: 'https://example.com/b.jpg', score: 30 }),
    ];
    const incoming = image({ art: 'https://example.com/c.jpg', score: 70 });
    const result = swapWorstSelectedImage(selected, incoming);

    expect(result.removed?.art).toBe('https://example.com/b.jpg');
    expect(result.selectedImages.some((candidate) => candidate.art === 'https://example.com/c.jpg')).toBe(true);
  });

  it('swaps a user-targeted image instead of always replacing the weakest tile', () => {
    const selected = [
      image({ art: 'https://example.com/hero.jpg', score: 95 }),
      image({ art: 'https://example.com/target.jpg', score: 82 }),
      image({ art: 'https://example.com/weak.jpg', score: 40 }),
    ];
    const incoming = image({ art: 'https://example.com/new.jpg', score: 78 });
    const result = swapSelectedImage(selected, selected[1]!, incoming);

    expect(result.removed?.art).toBe('https://example.com/target.jpg');
    expect(result.selectedImages.some((candidate) => candidate.art === 'https://example.com/new.jpg')).toBe(true);
    expect(result.selectedImages.some((candidate) => candidate.art === 'https://example.com/weak.jpg')).toBe(true);
  });

  it('replaces a removed image and recomputes alternates', () => {
    const selected = [
      image({ art: 'https://example.com/a.jpg', score: 90 }),
      image({ art: 'https://example.com/b.jpg', score: 70 }),
    ];
    const candidatePool = [...selected, image({ art: 'https://example.com/c.jpg', score: 80 })];
    const result = replaceRemovedImage(candidatePool, selected, selected[1]!);

    expect(result.replacement?.art).toBe('https://example.com/c.jpg');
    expect(result.selectedImages.some((candidate) => candidate.art === 'https://example.com/c.jpg')).toBe(true);
    expect(result.alternateCandidates.some((candidate) => candidate.art === 'https://example.com/a.jpg')).toBe(false);
  });

  it('ensures alternate candidates are refreshed for cached results', () => {
    const result = collageResult({
      alternateCandidates: [],
    });

    expect(withAlternates(result).alternateCandidates).toHaveLength(1);
  });

  it('refreshes the collage with a different selection when alternates exist', () => {
    const result: CollageBuildResult = {
      artist: { artistName: 'Billie Eilish', artistId: 2, albumFilter: null },
      selectedImages: [
        image({ art: 'https://example.com/a.jpg', score: 90 }),
        image({ art: 'https://example.com/b.jpg', score: 88 }),
        image({ art: 'https://example.com/c.jpg', score: 86 }),
        image({ art: 'https://example.com/d.jpg', score: 84 }),
      ],
      candidatePool: [
        image({ art: 'https://example.com/a.jpg', score: 90 }),
        image({ art: 'https://example.com/b.jpg', score: 88 }),
        image({ art: 'https://example.com/c.jpg', score: 86 }),
        image({ art: 'https://example.com/d.jpg', score: 84 }),
        image({ art: 'https://example.com/e.jpg', score: 82, tags: ['press-photo', 'portrait-ratio'] }),
        image({ art: 'https://example.com/f.jpg', score: 80, tags: ['press-photo'] }),
      ],
      alternateCandidates: [],
      albums: [],
    };

    const refreshed = refreshCollageResult(result);

    expect(refreshed.selectedImages.some((imageCandidate) => imageCandidate.art === 'https://example.com/e.jpg')).toBe(true);
    expect(refreshed.selectedImages).not.toEqual(result.selectedImages);
  });

  it('stores crop adjustments on both the selected collage and the candidate pool', () => {
    const result = collageResult({
      selectedImages: [image({ art: 'https://example.com/a.jpg', score: 90, focalPoint: [50, 30] })],
      candidatePool: [
        image({ art: 'https://example.com/a.jpg', score: 90, focalPoint: [50, 30] }),
        image({ art: 'https://example.com/b.jpg', score: 80 }),
      ],
    });

    const updated = applyFocalPointToResult(result, 'https://example.com/a.jpg', [62.4, -10]);

    expect(updated.selectedImages[0]?.focalPoint).toEqual([62.4, 5]);
    expect(updated.candidatePool[0]?.focalPoint).toEqual([62.4, 5]);
  });

  it('applies local quality actions so rejected and swapped-out images stop resurfacing', () => {
    const candidatePool = [
      image({ art: 'https://example.com/a.jpg', score: 82, tags: ['press-photo'] }),
      image({ art: 'https://example.com/b.jpg', score: 78, tags: ['press-photo'] }),
    ];

    const rejected = applyLocalQualityAction(candidatePool, 'https://example.com/a.jpg', 'reject');
    const swappedIn = applyLocalQualityAction(rejected, 'https://example.com/b.jpg', 'swap_in');

    expect(rejected[0]?.score).toBe(0);
    expect(rejected[0]?.tags).toContain('session-rejected');
    expect(swappedIn[1] && (swappedIn[1].score ?? 0) > 78).toBe(true);
    expect(swappedIn[1]?.tags).toContain('session-preferred');
  });
});
