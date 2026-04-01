import { z } from 'zod';

export const ImageTypeSchema = z.enum(['album', 'single', 'video', 'photo', 'other']);
export type ImageType = z.infer<typeof ImageTypeSchema>;

export const ImageSourceSchema = z.enum([
  'itunes-album',
  'itunes-single',
  'itunes-video',
  'wiki-main',
  'wiki-cat',
  'wiki-search',
  'discogs-photo',
  'openverse-photo',
  'serper-photo',
]);
export type ImageSource = z.infer<typeof ImageSourceSchema>;

export const ImageCandidateSchema = z.object({
  art: z.string().url(),
  label: z.string().optional(),
  title: z.string().optional(),
  type: ImageTypeSchema.optional(),
  dims: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  score: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  src: ImageSourceSchema.optional(),
  year: z.number().int().optional(),
  releaseDate: z.string().optional(),
  photographer: z.boolean().optional(),
  license: z.string().optional(),
  hasExifDate: z.boolean().optional(),
  hasCategoryMatch: z.boolean().optional(),
  descLength: z.number().int().optional(),
  name: z.string().optional(),
  collectionId: z.number().int().optional(),
  focalPoint: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
});
export type ImageCandidate = z.infer<typeof ImageCandidateSchema>;

export const ArtistSearchMatchSchema = z.object({
  artistName: z.string().min(1),
  artistId: z.number().int().positive(),
});
export type ArtistSearchMatch = z.infer<typeof ArtistSearchMatchSchema>;

export const ResolvedArtistQuerySchema = z.object({
  artistName: z.string().min(1),
  artistId: z.number().int().positive(),
  albumFilter: z.string().min(1).nullable(),
});
export type ResolvedArtistQuery = z.infer<typeof ResolvedArtistQuerySchema>;

export const QualitySignalsSummarySchema = z.object({
  rejected: z.array(z.string().url()),
  preferred: z.array(z.string().url()),
});
export type QualitySignalsSummary = z.infer<typeof QualitySignalsSummarySchema>;

export const CollageBuildResultSchema = z.object({
  artist: ResolvedArtistQuerySchema,
  selectedImages: z.array(ImageCandidateSchema),
  candidatePool: z.array(ImageCandidateSchema),
  alternateCandidates: z.array(ImageCandidateSchema),
  albums: z.array(ImageCandidateSchema),
});
export type CollageBuildResult = z.infer<typeof CollageBuildResultSchema>;

export const BuildCollageRequestSchema = z.object({
  query: z.string().min(1),
  count: z.number().int().min(1).max(36).default(18),
});
export type BuildCollageRequest = z.infer<typeof BuildCollageRequestSchema>;

export const BuildCollageSuccessSchema = z.object({
  ok: z.literal(true),
  data: CollageBuildResultSchema,
});

export const BuildCollageErrorSchema = z.object({
  ok: z.literal(false),
  error: z.enum(['artist_not_found', 'no_images_found', 'upstream_error']),
  message: z.string(),
});

export const BuildCollageResponseSchema = z.union([
  BuildCollageSuccessSchema,
  BuildCollageErrorSchema,
]);
export type BuildCollageResponse = z.infer<typeof BuildCollageResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  storage: z.enum(['sqlite']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

const SOURCE_SCORES: Record<ImageSource, number> = {
  'wiki-main': 35,
  'serper-photo': 33,
  'openverse-photo': 30,
  'wiki-cat': 28,
  'discogs-photo': 22,
  'itunes-album': 20,
  'itunes-single': 16,
  'itunes-video': 12,
  'wiki-search': 10,
};

const POSITIVE_TITLE_WORDS: Record<string, number> = {
  press: 12,
  promo: 12,
  portrait: 12,
  headshot: 12,
  concert: 8,
  live: 8,
  perform: 8,
  festival: 8,
  tour: 8,
  award: 10,
  premiere: 10,
  'red carpet': 10,
  gala: 10,
  ceremony: 10,
  interview: 6,
  appearance: 6,
};

const NEGATIVE_TITLE_WORDS: Record<string, number> = {
  crop: -8,
  cropped: -8,
  blur: -15,
  fan: -15,
  unofficial: -15,
  'fan art': -20,
  fanart: -20,
  drawing: -20,
  illustration: -20,
  cartoon: -20,
  anime: -20,
  screenshot: -15,
  poster: -12,
  wicked: -10,
  logo: -20,
  icon: -20,
  banner: -15,
};

export function normalizeInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeArtistName(value: string): string {
  return normalizeInput(value).toLowerCase();
}

export function isExactArtistName(resultArtist: string, searchLower: string): boolean {
  if (!resultArtist) return false;
  const resultLower = normalizeArtistName(resultArtist);
  if (resultLower === searchLower) return true;
  if (resultLower.includes(' & ') || resultLower.includes(' x ') || resultLower.includes(', ')) return false;
  if (/\bfeat\.?\s/i.test(resultLower) || /\bwith\b/i.test(resultLower) || /\bft\.?\s/i.test(resultLower)) return false;
  return resultLower.includes(searchLower) || searchLower.includes(resultLower);
}

export function scoreArtistResolutionCandidate(
  resultArtist: string,
  candidateArtist: string,
  albumFilter: string | null,
): number {
  const resultLower = normalizeArtistName(resultArtist);
  const candidateLower = normalizeArtistName(candidateArtist);
  if (!isExactArtistName(resultArtist, candidateLower)) return Number.NEGATIVE_INFINITY;

  let score = 0;

  if (resultLower === candidateLower) {
    score += 120;
  } else if (candidateLower.startsWith(resultLower) || resultLower.startsWith(candidateLower)) {
    score += 72;
  } else {
    score += 48;
  }

  const resultWords = resultLower.split(/\s+/).length;
  const candidateWords = candidateLower.split(/\s+/).length;
  score -= Math.abs(candidateWords - resultWords) * 10;
  score -= Math.max(0, candidateLower.length - resultLower.length);

  if (albumFilter) {
    const albumWordCount = normalizeInput(albumFilter).split(/\s+/).length;
    score -= Math.min(24, albumWordCount * 2);
  }

  return score;
}

export function scoreImageCandidate(candidate: ImageCandidate, source: ImageSource): ImageCandidate {
  let score = SOURCE_SCORES[source] ?? 5;
  const tags: string[] = [source.startsWith('wiki') || source.endsWith('photo') ? 'web-photo' : 'music-source'];

  if (candidate.dims) {
    const [width, height] = candidate.dims;
    const minDim = Math.min(width, height);
    score += Math.min(Math.floor(minDim / 50), 15);
    if (minDim >= 800) tags.push('high-res');

    const ratio = width / height;
    if (ratio >= 0.65 && ratio <= 0.85) {
      score += 10;
      tags.push('portrait-ratio');
    } else if (ratio >= 0.95 && ratio <= 1.05) {
      score += 8;
      tags.push('square');
    } else if (ratio >= 0.5 && ratio <= 1.2) {
      score += 5;
    } else if (ratio >= 1.2 && ratio <= 1.8) {
      score += 3;
      tags.push('wide');
    }
    if (ratio < 0.7) tags.push('tall');
  } else if (source.startsWith('itunes')) {
    score += 8;
    tags.push('square');
  }

  const title = normalizeArtistName(candidate.title ?? candidate.label ?? '');
  let titleBonus = 0;

  for (const [word, points] of Object.entries(POSITIVE_TITLE_WORDS)) {
    if (title.includes(word)) {
      titleBonus = Math.max(titleBonus, points);
      break;
    }
  }

  for (const [word, points] of Object.entries(NEGATIVE_TITLE_WORDS)) {
    if (title.includes(word)) titleBonus += points;
  }

  score += Math.max(0, Math.min(20, titleBonus));

  if (source === 'itunes-album') tags.push('album-art');
  else if (source === 'itunes-single') tags.push('single-art');
  else if (source === 'itunes-video') tags.push('video-still');
  else if (source === 'wiki-main') tags.push('press-photo');
  else if (source === 'serper-photo') tags.push('press-photo');
  else if (/concert|live|perform|festival|tour/.test(title)) tags.push('live-performance');
  else if (/award|premiere|carpet|gala|ceremony/.test(title)) tags.push('event-photo');
  else if (/press|promo/.test(title)) tags.push('press-photo');
  else tags.push('photo');

  if (candidate.photographer) score += 4;
  if (candidate.license) score += 3;
  if (candidate.hasExifDate) score += 3;
  if (candidate.hasCategoryMatch) score += 3;
  if (candidate.descLength && candidate.descLength > 20) score += 2;
  if (source.startsWith('itunes')) score += 3;

  if (candidate.year) {
    const age = new Date().getFullYear() - candidate.year;
    if (age <= 2) {
      score += 10;
      tags.push('recent');
    } else if (age <= 5) {
      score += 7;
    } else if (age <= 10) {
      score += 4;
    } else {
      score += 1;
      tags.push('classic');
    }
  } else {
    score += 2;
  }

  if (titleBonus < -10) score = Math.max(score, 5);

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    tags,
    src: source,
  };
}

export function buildDeduplicationKey(url: string): string {
  return url
    .replace(/\/\d+x\d+[a-z]*\./i, '/NORM.')
    .replace(/\?.*$/, '')
    .replace(/\/thumb\/.*\/(\d+px-)/, '/NORM/');
}

export function deduplicateImageCandidates(images: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = buildDeduplicationKey(image.art);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyQualitySignalsToImages(
  images: ImageCandidate[],
  signals: QualitySignalsSummary,
): ImageCandidate[] {
  const rejected = new Set(signals.rejected);
  const preferred = new Set(signals.preferred);

  return images.map((image) => {
    if (rejected.has(image.art)) {
      return { ...image, score: 0 };
    }

    if (preferred.has(image.art)) {
      return { ...image, score: Math.min(100, (image.score ?? 0) + 20) };
    }

    return image;
  });
}

export function applyAlbumBias(images: ImageCandidate[], albumFilter: string | null): ImageCandidate[] {
  if (!albumFilter) return images.map((image) => ({ ...image }));

  const filter = normalizeArtistName(albumFilter);
  const matchedAlbum = images.find(
    (image) =>
      image.type === 'album' &&
      image.name &&
      (normalizeArtistName(image.name).includes(filter) || filter.includes(normalizeArtistName(image.name))),
  );

  if (!matchedAlbum) return images.map((image) => ({ ...image }));

  return images.map((image) => {
    let score = image.score ?? 0;
    if (matchedAlbum.year && image.year && Math.abs(image.year - matchedAlbum.year) <= 1) score += 15;
    if (image.art === matchedAlbum.art) score += 20;
    return { ...image, score };
  });
}

function compositionScore(
  candidate: ImageCandidate,
  selected: ImageCandidate[],
  typeCounts: Record<string, number>,
  slot: number,
): number {
  const individual = ((candidate.score ?? 0) / 100) * 50;
  const typeCount = typeCounts[candidate.type ?? 'other'] ?? 0;
  const photoCount = typeCounts.photo ?? 0;
  const typeDiversity = typeCount === 0 ? 20 : typeCount === 1 ? 12 : typeCount === 2 ? 5 : 0;

  const year = candidate.year ?? 0;
  let minDistance = 99;
  for (const selectedImage of selected) {
    if (selectedImage.year && year) {
      minDistance = Math.min(minDistance, Math.abs(year - selectedImage.year));
    }
  }
  if (selected.length === 0) minDistance = 5;
  const yearSpread = Math.min(minDistance * 4, 15);

  let adjacencyPenalty = 0;
  const previous = selected[selected.length - 1];
  if (previous) {
    if (previous.type === candidate.type) adjacencyPenalty -= 10;
    if (previous.year && candidate.year && previous.year === candidate.year) adjacencyPenalty -= 5;
  }

  let slotBonus = 0;
  if (slot <= 1) slotBonus = ((candidate.score ?? 0) / 100) * 10;
  if (slot <= 2 && candidate.type === 'photo') slotBonus += 5;
  if (candidate.type === 'photo') slotBonus += photoCount === 0 ? 18 : 10;
  if (slot <= 1 && candidate.type && candidate.type !== 'photo') slotBonus -= 12;
  if (slot === 0 && candidate.type && candidate.type !== 'photo') slotBonus -= 10;

  return individual + typeDiversity + yearSpread + adjacencyPenalty + slotBonus;
}

export function composeCollage(
  images: ImageCandidate[],
  albumFilter: string | null,
  count: number,
): ImageCandidate[] {
  let pool = applyAlbumBias(images, albumFilter)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, count * 3)
    .filter((image) => (image.score ?? 0) >= 20);

  if (pool.length === 0) return [];

  const selected: ImageCandidate[] = [];
  const typeCounts: Record<string, number> = {};

  for (let slot = 0; slot < count && pool.length > 0; slot += 1) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      if (!candidate) continue;
      const score = compositionScore(candidate, selected, typeCounts, slot);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) break;

    const picked = pool.splice(bestIndex, 1)[0];
    if (!picked) continue;
    selected.push(picked);
    const type = picked.type ?? 'other';
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  return selected;
}

export function buildAlternateCandidates(
  candidatePool: ImageCandidate[],
  selectedImages: ImageCandidate[],
  limit = 30,
  preferredType?: ImageType,
): ImageCandidate[] {
  const selectedUrls = new Set(selectedImages.map((image) => image.art));
  const available = candidatePool.filter((image) => !selectedUrls.has(image.art));

  const ranked = available
    .filter((image) => (image.score ?? 0) >= 25)
    .filter((image) => !(image.tags ?? []).includes('bad-crop'))
    .map((image) => ({
      image,
      score: scoreAlternateCandidate(image, preferredType),
    }))
    .sort((left, right) => right.score - left.score || (right.image.score ?? 0) - (left.image.score ?? 0))
    .map(({ image }) => image);

  if (ranked.length >= limit) {
    return ranked.slice(0, limit);
  }

  const rankedUrls = new Set(ranked.map((image) => image.art));
  const remainder = available
    .filter((image) => !rankedUrls.has(image.art))
    .filter((image) => !(image.tags ?? []).includes('bad-crop'))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, Math.max(0, limit - ranked.length));

  return [...ranked, ...remainder];
}

function scoreAlternateCandidate(image: ImageCandidate, preferredType?: ImageType): number {
  let score = image.score ?? 0;
  const tags = new Set(image.tags ?? []);

  if (preferredType && image.type === preferredType) score += 24;
  if (preferredType === 'photo' && image.type && image.type !== 'photo') score -= 18;
  if (image.type === 'photo') score += 22;
  if (tags.has('press-photo')) score += 12;
  if (tags.has('event-photo')) score += 8;
  if (tags.has('live-performance')) score += 6;
  if (tags.has('portrait-ratio')) score += 10;
  if (tags.has('tall')) score += 6;
  if (tags.has('high-res')) score += 5;
  if (tags.has('cached-prior')) score += 8;
  if (image.src === 'openverse-photo') score += 10;
  if (image.src === 'serper-photo') score += 10;
  if (image.src === 'wiki-main') score += 8;
  if (image.src === 'wiki-cat') score += 6;

  if (tags.has('bad-crop')) score -= 30;
  if (tags.has('square')) score -= 4;
  if (image.type === 'album') score -= 18;
  if (image.type === 'single') score -= 18;
  if (image.type === 'video') score -= 16;

  return score;
}

export const QualitySignalActionSchema = z.enum(['reject', 'prefer', 'swap_out', 'swap_in']);
export type QualitySignalAction = z.infer<typeof QualitySignalActionSchema>;
