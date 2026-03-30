import { describe, expect, it } from 'vitest';
import {
  applyQualitySignalsToImages,
  buildAlternateCandidates,
  composeCollage,
  type ImageCandidate,
} from './collage.js';

function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    art: `https://example.com/${Math.random().toString(36).slice(2)}.jpg`,
    type: 'photo',
    score: 50,
    ...overrides,
  };
}

describe('collage policy evals', () => {
  it('keeps high-quality photos ahead of artwork in a realistic mixed pool', () => {
    const pool = [
      candidate({ art: 'https://example.com/album-1.jpg', type: 'album', score: 92, tags: ['album-art', 'square'] }),
      candidate({ art: 'https://example.com/album-2.jpg', type: 'album', score: 88, tags: ['album-art', 'square'] }),
      candidate({ art: 'https://example.com/press-1.jpg', type: 'photo', score: 83, tags: ['press-photo', 'portrait-ratio', 'high-res'] }),
      candidate({ art: 'https://example.com/press-2.jpg', type: 'photo', score: 81, tags: ['press-photo', 'portrait-ratio'] }),
      candidate({ art: 'https://example.com/live-1.jpg', type: 'photo', score: 76, tags: ['live-performance', 'portrait-ratio'] }),
      candidate({ art: 'https://example.com/bad-crop.jpg', type: 'photo', score: 80, tags: ['press-photo', 'bad-crop'] }),
      candidate({ art: 'https://example.com/video.jpg', type: 'video', score: 79, tags: ['video-still', 'square'] }),
    ];

    const selected = composeCollage(pool, null, 4);
    const alternates = buildAlternateCandidates(pool, selected, 6, 'photo');

    expect(selected.filter((image) => image.type === 'photo').length).toBeGreaterThanOrEqual(2);
    expect(alternates[0]?.type).toBe('photo');
    expect(alternates.some((image) => image.art === 'https://example.com/bad-crop.jpg')).toBe(false);
  });

  it('respects learned rejection and preference signals in a crowded pool', () => {
    const pool = applyQualitySignalsToImages(
      [
        candidate({ art: 'https://example.com/reject.jpg', score: 84, tags: ['press-photo'] }),
        candidate({ art: 'https://example.com/prefer.jpg', score: 68, tags: ['press-photo', 'portrait-ratio'] }),
        candidate({ art: 'https://example.com/other-1.jpg', score: 75, tags: ['album-art'], type: 'album' }),
        candidate({ art: 'https://example.com/other-2.jpg', score: 73, tags: ['live-performance'] }),
      ],
      {
        rejected: ['https://example.com/reject.jpg'],
        preferred: ['https://example.com/prefer.jpg'],
      },
    );

    const selected = composeCollage(pool, null, 3);

    expect(selected.some((image) => image.art === 'https://example.com/reject.jpg')).toBe(false);
    expect(selected.some((image) => image.art === 'https://example.com/prefer.jpg')).toBe(true);
  });
});
