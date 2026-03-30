'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { CollageBuildResult, ImageCandidate } from '@starter/domain';
import { buildAlternateCandidates, normalizeArtistName } from '@starter/domain';
import { buildCollage, getHealth, getRenderableImageUrl, recordSignal } from '../lib/api.js';
import { enhanceCollageWithFaceDetection } from '../lib/face-detection.js';
import {
  applyLocalQualityAction,
  buildCacheKey,
  refreshCollageResult,
  replaceRemovedImage,
  swapSelectedImage,
  swapWorstSelectedImage,
  upsertHistory,
  withAlternates,
} from '../lib/state.js';
import {
  ARTIST_THEMES,
  CACHE_TTL,
  DEFAULT_THEME,
  HISTORY_KEY,
  type ArtistTheme,
  type HistoryItem,
} from '../lib/constants.js';

function loadCachedResult(query: string): CollageBuildResult | null {
  try {
    const raw = localStorage.getItem(buildCacheKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: CollageBuildResult };
    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(buildCacheKey(query));
      return null;
    }
    return withAlternates(parsed.data);
  } catch {
    return null;
  }
}

function storeCachedResult(query: string, result: CollageBuildResult): void {
  try {
    localStorage.setItem(buildCacheKey(query), JSON.stringify({ ts: Date.now(), data: result }));
  } catch {
    // Ignore storage quota errors.
  }
}

interface CollageController {
  artistInput: string;
  setArtistInput: (value: string) => void;
  history: HistoryItem[];
  loading: boolean;
  loaderMsg: string;
  error: boolean;
  hasResults: boolean;
  result: CollageBuildResult | null;
  theme: ArtistTheme;
  collageSubtitle: string;
  artistInputRef: React.RefObject<HTMLInputElement | null>;
  selectedSwapTargetArt: string | null;
  selectedSwapTargetLabel: string | null;
  handleSubmit: (event?: React.FormEvent) => void;
  handleQuickPick: (name: string) => void;
  handleHistoryClick: (item: HistoryItem) => void;
  handleClearHistory: () => void;
  handleRefresh: () => void;
  handleSelectTile: (image: ImageCandidate) => void;
  handleRemoveTile: (image: ImageCandidate) => void;
  handleSwapCandidate: (image: ImageCandidate) => void;
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
}

export function useCollageController(): CollageController {
  const [artistInput, setArtistInput] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [result, setResult] = useState<CollageBuildResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaderMsg, setLoaderMsg] = useState('Searching for artist...');
  const [error, setError] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [selectedSwapTargetArt, setSelectedSwapTargetArt] = useState<string | null>(null);

  const artistInputRef = useRef<HTMLInputElement>(null);

  const theme = useMemo(() => {
    if (!result) return DEFAULT_THEME;
    return ARTIST_THEMES[normalizeArtistName(result.artist.artistName)] ?? DEFAULT_THEME;
  }, [result]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      setHistory(raw ? (JSON.parse(raw) as HistoryItem[]) : []);
    } catch {
      setHistory([]);
    }

    void getHealth()
      .then(() => setDbAvailable(true))
      .catch(() => setDbAvailable(false));
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-results', hasResults);
  }, [hasResults]);

  useEffect(() => {
    document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();
    if (theme.cls) document.body.classList.add(theme.cls);
  }, [theme]);

  const collageSubtitle = useMemo(() => {
    const years = result?.selectedImages.filter((image) => image.year).map((image) => image.year as number) ?? [];
    if (!result) return '0 images';
    return years.length
      ? `${Math.min(...years)}–${Math.max(...years)}  ·  ${result.selectedImages.length} images`
      : `${result.selectedImages.length} images`;
  }, [result]);

  const runSearch = async (query: string): Promise<void> => {
    if (!query.trim()) return;

    setLoading(true);
    setError(false);
    setHasResults(false);
    setResult(null);
    setLoaderMsg('Searching for artist...');

    try {
      const cached = loadCachedResult(query);
      if (cached) {
        startTransition(() => {
          setResult(cached);
          setHasResults(true);
          setLoading(false);
          setSelectedSwapTargetArt(null);
        });
        return;
      }

      setLoaderMsg('Gathering images from multiple sources...');
      const apiResult = await buildCollage(query, 18);

      setLoaderMsg('Analyzing image quality...');
      const enhanced = await enhanceCollageWithFaceDetection(apiResult);
      const finalized = {
        ...enhanced,
        alternateCandidates: buildAlternateCandidates(enhanced.candidatePool, enhanced.selectedImages),
      };

      storeCachedResult(query, finalized);

      const historyName = finalized.artist.albumFilter
        ? `${finalized.artist.artistName} — ${finalized.artist.albumFilter}`
        : finalized.artist.artistName;
      const thumb = finalized.selectedImages[0] ? getRenderableImageUrl(finalized.selectedImages[0]) : '';

      startTransition(() => {
        setResult(finalized);
        setHasResults(true);
        setLoading(false);
        setSelectedSwapTargetArt(null);
      });

      if (thumb) {
        const queryValue = finalized.artist.albumFilter
          ? `${finalized.artist.artistName} ${finalized.artist.albumFilter}`
          : finalized.artist.artistName;
        const nextHistory = upsertHistory(history, { name: historyName, thumb, query: queryValue });
        setHistory(nextHistory);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      }
    } catch {
      setLoading(false);
      setError(true);
    }
  };

  const handleSubmit = (event?: React.FormEvent): void => {
    event?.preventDefault();
    void runSearch(artistInput);
  };

  const handleQuickPick = (name: string): void => {
    setArtistInput(name);
    void runSearch(name);
  };

  const handleHistoryClick = (item: HistoryItem): void => {
    const query = item.query ?? item.name;
    setArtistInput(query);
    void runSearch(query);
  };

  const handleClearHistory = (): void => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const handleRefresh = (): void => {
    if (!result) return;
    const refreshed = refreshCollageResult(result);
    const query = result.artist.albumFilter
      ? `${result.artist.artistName} ${result.artist.albumFilter}`
      : result.artist.artistName;
    localStorage.removeItem(buildCacheKey(query));
    storeCachedResult(query, refreshed);
    setResult(refreshed);
    setSelectedSwapTargetArt(null);
  };

  const handleSelectTile = (image: ImageCandidate): void => {
    setSelectedSwapTargetArt((current) => (current === image.art ? null : image.art));
  };

  const handleRemoveTile = (image: ImageCandidate): void => {
    if (!result) return;
    if (dbAvailable) {
      void recordSignal(image.art, result.artist.artistName, 'reject');
    }

    const updatedPool = applyLocalQualityAction(result.candidatePool, image.art, 'reject');
    const replacementState = replaceRemovedImage(updatedPool, result.selectedImages, image);
    if (dbAvailable && replacementState.replacement) {
      void recordSignal(replacementState.replacement.art, result.artist.artistName, 'swap_in');
    }
    const finalPool = replacementState.replacement
      ? applyLocalQualityAction(updatedPool, replacementState.replacement.art, 'swap_in')
      : updatedPool;

    setResult({
      ...result,
      candidatePool: finalPool,
      selectedImages: replacementState.selectedImages,
      alternateCandidates: buildAlternateCandidates(finalPool, replacementState.selectedImages),
    });
    setSelectedSwapTargetArt((current) => (current === image.art ? null : current));
  };

  const handleSwapCandidate = (image: ImageCandidate): void => {
    if (!result) return;

    const target = selectedSwapTargetArt
      ? result.selectedImages.find((selected) => selected.art === selectedSwapTargetArt)
      : undefined;
    const swapped = target
      ? swapSelectedImage(result.selectedImages, target, image)
      : swapWorstSelectedImage(result.selectedImages, image);
    let nextPool = result.candidatePool;
    if (dbAvailable) {
      if (swapped.removed) {
        void recordSignal(swapped.removed.art, result.artist.artistName, 'swap_out');
      }
      void recordSignal(image.art, result.artist.artistName, 'swap_in');
    }
    if (swapped.removed) {
      nextPool = applyLocalQualityAction(nextPool, swapped.removed.art, 'swap_out');
    }
    nextPool = applyLocalQualityAction(nextPool, image.art, 'swap_in');

    setResult({
      ...result,
      candidatePool: nextPool,
      selectedImages: swapped.selectedImages,
      alternateCandidates: buildAlternateCandidates(nextPool, swapped.selectedImages),
    });
    setSelectedSwapTargetArt(null);
  };

  return {
    artistInput,
    setArtistInput,
    history,
    loading,
    loaderMsg,
    error,
    hasResults,
    result,
    theme,
    collageSubtitle,
    artistInputRef,
    selectedSwapTargetArt,
    selectedSwapTargetLabel: selectedSwapTargetArt
      ? result?.selectedImages.find((image) => image.art === selectedSwapTargetArt)?.label ?? 'Selected image'
      : null,
    handleSubmit,
    handleQuickPick,
    handleHistoryClick,
    handleClearHistory,
    handleRefresh,
    handleSelectTile,
    handleRemoveTile,
    handleSwapCandidate,
    renderImageUrl: getRenderableImageUrl,
  };
}
