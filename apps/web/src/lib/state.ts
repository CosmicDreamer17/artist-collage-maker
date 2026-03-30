import type { CollageBuildResult, ImageCandidate, QualitySignalAction } from '@starter/domain';
import { buildAlternateCandidates, composeCollage, normalizeInput } from '@starter/domain';
import type { HistoryItem } from './constants.js';

export function buildCacheKey(query: string): string {
  return `acm_${normalizeInput(query).toLowerCase().replace(/\s+/g, '_')}`;
}

export function upsertHistory(history: HistoryItem[], nextItem: HistoryItem): HistoryItem[] {
  const nextKey = (nextItem.query ?? nextItem.name).toLowerCase();
  const filtered = history.filter((item) => (item.query ?? item.name).toLowerCase() !== nextKey);
  return [nextItem, ...filtered].slice(0, 20);
}

export function findReplacementCandidate(
  candidatePool: ImageCandidate[],
  selectedImages: ImageCandidate[],
  removedImage?: ImageCandidate,
  minimumScore = 15,
): ImageCandidate | undefined {
  return buildAlternateCandidates(candidatePool, selectedImages, 12, removedImage?.type)
    .filter((image) => (image.score ?? 0) > minimumScore)[0];
}

export function swapWorstSelectedImage(
  selectedImages: ImageCandidate[],
  incoming: ImageCandidate,
): { selectedImages: ImageCandidate[]; removed?: ImageCandidate } {
  if (selectedImages.length === 0) {
    return { selectedImages };
  }

  let worstIndex = 0;
  let worstScore = Number.POSITIVE_INFINITY;
  selectedImages.forEach((image, index) => {
    const score = image.score ?? 0;
    if (score < worstScore) {
      worstScore = score;
      worstIndex = index;
    }
  });

  const removed = selectedImages[worstIndex];
  const next = [...selectedImages];
  next[worstIndex] = incoming;
  return removed ? { selectedImages: next, removed } : { selectedImages: next };
}

export function swapSelectedImage(
  selectedImages: ImageCandidate[],
  target: ImageCandidate,
  incoming: ImageCandidate,
): { selectedImages: ImageCandidate[]; removed?: ImageCandidate } {
  const targetIndex = selectedImages.findIndex((image) => image.art === target.art);
  if (targetIndex === -1) {
    return swapWorstSelectedImage(selectedImages, incoming);
  }

  if (selectedImages.some((image) => image.art === incoming.art)) {
    return { selectedImages };
  }

  const next = [...selectedImages];
  const removed = next[targetIndex];
  next[targetIndex] = incoming;
  return removed ? { selectedImages: next, removed } : { selectedImages: next };
}

export function replaceRemovedImage(
  candidatePool: ImageCandidate[],
  selectedImages: ImageCandidate[],
  removed: ImageCandidate,
): { selectedImages: ImageCandidate[]; alternateCandidates: ImageCandidate[]; replacement?: ImageCandidate } {
  const replacement = findReplacementCandidate(candidatePool, selectedImages, removed);
  const nextSelected = replacement
    ? selectedImages.map((image) => (image.art === removed.art ? replacement : image))
    : selectedImages.filter((image) => image.art !== removed.art);

  return replacement
    ? {
        selectedImages: nextSelected,
        alternateCandidates: buildAlternateCandidates(candidatePool, nextSelected, 30, removed.type),
        replacement,
      }
    : {
      selectedImages: nextSelected,
      alternateCandidates: buildAlternateCandidates(candidatePool, nextSelected, 30, removed.type),
    };
}

export function withAlternates(result: CollageBuildResult): CollageBuildResult {
  return {
    ...result,
    alternateCandidates: buildAlternateCandidates(result.candidatePool, result.selectedImages),
  };
}

function haveSameSelection(left: ImageCandidate[], right: ImageCandidate[]): boolean {
  if (left.length !== right.length) return false;
  const leftUrls = new Set(left.map((image) => image.art));
  return right.every((image) => leftUrls.has(image.art));
}

export function refreshCollageResult(result: CollageBuildResult): CollageBuildResult {
  const selectedUrls = new Set(result.selectedImages.map((image) => image.art));
  const adjustedPool = result.candidatePool.map((image) => {
    const score = image.score ?? 0;
    return selectedUrls.has(image.art)
      ? { ...image, score: Math.max(0, score - 24) }
      : { ...image, score: Math.min(100, score + 6) };
  });

  let refreshed = composeCollage(adjustedPool, result.artist.albumFilter, result.selectedImages.length);

  if (haveSameSelection(refreshed, result.selectedImages)) {
    const alternates = buildAlternateCandidates(result.candidatePool, result.selectedImages, result.selectedImages.length + 8);
    refreshed = [...result.selectedImages];

    result.selectedImages
      .slice()
      .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))
      .slice(0, Math.min(4, alternates.length))
      .forEach((image, index) => {
        const replacement = alternates[index];
        if (!replacement) return;
        refreshed = refreshed.map((selected) => (selected.art === image.art ? replacement : selected));
      });
  }

  return {
    ...result,
    selectedImages: refreshed,
    alternateCandidates: buildAlternateCandidates(result.candidatePool, refreshed),
  };
}

export function applyLocalQualityAction(
  candidatePool: ImageCandidate[],
  url: string,
  action: QualitySignalAction,
): ImageCandidate[] {
  return candidatePool.map((image) => {
    if (image.art !== url) return image;

    const tags = new Set(image.tags ?? []);

    if (action === 'reject' || action === 'swap_out') {
      tags.add('session-rejected');
      return {
        ...image,
        score: 0,
        tags: Array.from(tags),
      };
    }

    tags.add('session-preferred');
    return {
      ...image,
      score: Math.min(100, (image.score ?? 0) + 15),
      tags: Array.from(tags),
    };
  });
}
