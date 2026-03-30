import { describe, expect, it } from 'vitest';
import {
  applyLocalQualityAction,
  buildCacheKey,
  findReplacementCandidate,
  refreshCollageResult,
  replaceRemovedImage,
  swapSelectedImage,
  swapWorstSelectedImage,
  upsertHistory,
  withAlternates,
} from './state.js';
import type { CollageBuildResult, ImageCandidate } from '@starter/domain';

function image(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    art: `https://example.com/${Math.random().toString(36).slice(2)}.jpg`,
    score: 50,
    type: 'photo',
    ...overrides,
  };
}

describe('web collage state helpers', () => {
  it('normalizes cache keys from queries', () => {
    expect(buildCacheKey('  Sabrina   Carpenter  ')).toBe('acm_sabrina_carpenter');
  });

  it('upserts history without duplicates and caps length', () => {
    const initial = [{ name: 'Sabrina Carpenter', thumb: 'a', query: 'Sabrina Carpenter' }];
    const updated = upsertHistory(initial, { name: 'Sabrina Carpenter — Short n Sweet', thumb: 'b', query: 'Sabrina Carpenter Short n Sweet' });
    expect(updated).toEqual([
      { name: 'Sabrina Carpenter — Short n Sweet', thumb: 'b', query: 'Sabrina Carpenter Short n Sweet' },
      { name: 'Sabrina Carpenter', thumb: 'a', query: 'Sabrina Carpenter' },
    ]);
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
    const result: CollageBuildResult = {
      artist: { artistName: 'Sabrina Carpenter', artistId: 1, albumFilter: null },
      selectedImages: [image({ art: 'https://example.com/a.jpg', score: 90 })],
      candidatePool: [
        image({ art: 'https://example.com/a.jpg', score: 90 }),
        image({ art: 'https://example.com/b.jpg', score: 80 }),
      ],
      alternateCandidates: [],
      albums: [],
    };

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
