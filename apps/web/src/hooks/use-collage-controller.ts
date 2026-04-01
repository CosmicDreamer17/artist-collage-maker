'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { CollageBuildResult, ImageCandidate } from '@starter/domain';
import { buildAlternateCandidates, normalizeArtistName } from '@starter/domain';
import { buildCollage, getHealth, getRenderableImageUrl, recordSignal } from '../lib/api.js';
import { enhanceCollageWithFaceDetection } from '../lib/face-detection.js';
import {
  applyFocalPointToResult,
  applyLocalQualityAction,
  buildCacheKey,
  createSavedCollageRecord,
  refreshCollageResult,
  replaceRemovedImage,
  swapSelectedImage,
  swapWorstSelectedImage,
  updateSavedCollageRecord,
  withAlternates,
  upsertSavedCollageRecord,
} from '../lib/state.js';
import {
  ACTIVE_COLLAGE_KEY,
  ARTIST_THEMES,
  CACHE_TTL,
  DEFAULT_THEME,
  SAVED_COLLAGES_KEY,
  type ArtistTheme,
  type SavedCollageRecord,
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
    // Ignore storage quota errors for the transient cache.
  }
}

function loadSavedCollages(): SavedCollageRecord[] {
  try {
    const raw = localStorage.getItem(SAVED_COLLAGES_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as SavedCollageRecord[]).map((item) => ({
      ...item,
      result: withAlternates(item.result),
    }));
  } catch {
    return [];
  }
}

function loadActiveCollageId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_COLLAGE_KEY);
  } catch {
    return null;
  }
}

function createCollageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `collage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSavedTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

type SaveState = 'saved' | 'error';

interface CollageController {
  artistInput: string;
  setArtistInput: (value: string) => void;
  savedCollages: SavedCollageRecord[];
  activeCollageId: string | null;
  loading: boolean;
  loaderMsg: string;
  error: boolean;
  hasResults: boolean;
  result: CollageBuildResult | null;
  theme: ArtistTheme;
  collageSubtitle: string;
  saveState: SaveState;
  saveStatusLabel: string | null;
  saveStatusDetail: string | null;
  artistInputRef: React.RefObject<HTMLInputElement | null>;
  selectedSwapTargetArt: string | null;
  selectedSwapTargetLabel: string | null;
  handleSubmit: (event?: React.FormEvent) => void;
  handleQuickPick: (name: string) => void;
  handleSavedCollageClick: (item: SavedCollageRecord) => void;
  handleDeleteSavedCollage: (id: string) => void;
  handleClearSavedCollages: () => void;
  handleRefresh: () => void;
  handleSelectTile: (image: ImageCandidate) => void;
  handleAdjustTilePosition: (image: ImageCandidate, focalPoint: [number, number]) => void;
  handleRemoveTile: (image: ImageCandidate) => void;
  handleSwapCandidate: (image: ImageCandidate) => void;
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
}

export function useCollageController(): CollageController {
  const [artistInput, setArtistInput] = useState('');
  const [savedCollages, setSavedCollages] = useState<SavedCollageRecord[]>([]);
  const [activeCollageId, setActiveCollageId] = useState<string | null>(null);
  const [result, setResult] = useState<CollageBuildResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaderMsg, setLoaderMsg] = useState('Searching for artist...');
  const [error, setError] = useState(false);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [selectedSwapTargetArt, setSelectedSwapTargetArt] = useState<string | null>(null);

  const artistInputRef = useRef<HTMLInputElement>(null);
  const savedCollagesRef = useRef<SavedCollageRecord[]>([]);
  const activeCollageIdRef = useRef<string | null>(null);

  const hasResults = result !== null;

  const theme = useMemo(() => {
    if (!result) return DEFAULT_THEME;
    return ARTIST_THEMES[normalizeArtistName(result.artist.artistName)] ?? DEFAULT_THEME;
  }, [result]);

  const activeSavedCollage = useMemo(
    () => savedCollages.find((item) => item.id === activeCollageId) ?? null,
    [savedCollages, activeCollageId],
  );

  useEffect(() => {
    savedCollagesRef.current = savedCollages;
  }, [savedCollages]);

  useEffect(() => {
    activeCollageIdRef.current = activeCollageId;
  }, [activeCollageId]);

  useEffect(() => {
    const nextSavedCollages = loadSavedCollages();
    const storedActiveId = loadActiveCollageId();
    const initialActive = nextSavedCollages.find((item) => item.id === storedActiveId) ?? nextSavedCollages[0] ?? null;

    savedCollagesRef.current = nextSavedCollages;
    setSavedCollages(nextSavedCollages);

    if (initialActive) {
      activeCollageIdRef.current = initialActive.id;
      setActiveCollageId(initialActive.id);
      setArtistInput(initialActive.query);
      setResult(withAlternates(initialActive.result));
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

  const saveStatusLabel = useMemo(() => {
    if (!activeSavedCollage) return null;
    if (saveState === 'error') return 'Local save failed';
    return activeSavedCollage.mode === 'copy'
      ? 'Saved copy on this device'
      : 'Autosaved on this device';
  }, [activeSavedCollage, saveState]);

  const saveStatusDetail = useMemo(() => {
    if (!activeSavedCollage) return null;
    if (saveState === 'error') {
      return 'Keep this tab open while we retry writing changes to local storage.';
    }
    return `Last update ${formatSavedTime(activeSavedCollage.updatedAt)}`;
  }, [activeSavedCollage, saveState]);

  const persistActiveCollageId = (nextId: string | null): void => {
    activeCollageIdRef.current = nextId;
    setActiveCollageId(nextId);

    try {
      if (nextId) {
        localStorage.setItem(ACTIVE_COLLAGE_KEY, nextId);
      } else {
        localStorage.removeItem(ACTIVE_COLLAGE_KEY);
      }
    } catch {
      setSaveState('error');
    }
  };

  const persistSavedCollages = (nextCollages: SavedCollageRecord[]): SavedCollageRecord[] => {
    savedCollagesRef.current = nextCollages;
    setSavedCollages(nextCollages);

    try {
      if (nextCollages.length === 0) {
        localStorage.removeItem(SAVED_COLLAGES_KEY);
      } else {
        localStorage.setItem(SAVED_COLLAGES_KEY, JSON.stringify(nextCollages));
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }

    return nextCollages;
  };

  const activateSavedCollage = (item: SavedCollageRecord): void => {
    persistActiveCollageId(item.id);
    setArtistInput(item.query);
    setResult(withAlternates(item.result));
    setError(false);
    setLoading(false);
    setSelectedSwapTargetArt(null);
  };

  const autosaveResult = (nextResult: CollageBuildResult): void => {
    const currentId = activeCollageIdRef.current;
    if (!currentId) return;
    const nextCollages = updateSavedCollageRecord(savedCollagesRef.current, currentId, nextResult);
    persistSavedCollages(nextCollages);
  };

  const createAndActivateCollage = (
    nextResult: CollageBuildResult,
    query: string,
    mode: 'autosave' | 'copy' = 'autosave',
  ): void => {
    const entry = createSavedCollageRecord(nextResult, query, {
      id: createCollageId(),
      mode,
    });
    persistSavedCollages(upsertSavedCollageRecord(savedCollagesRef.current, entry));
    activateSavedCollage(entry);
  };

  const runSearch = async (query: string): Promise<void> => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setLoading(true);
    setError(false);
    setLoaderMsg('Searching for artist...');

    try {
      const cached = loadCachedResult(normalizedQuery);
      if (cached) {
        startTransition(() => {
          createAndActivateCollage(cached, normalizedQuery);
        });
        setLoading(false);
        return;
      }

      setLoaderMsg('Gathering images from multiple sources...');
      const apiResult = await buildCollage(normalizedQuery, 18);

      setLoaderMsg('Analyzing image quality...');
      const enhanced = await enhanceCollageWithFaceDetection(apiResult);
      const finalized = withAlternates({
        ...enhanced,
        alternateCandidates: buildAlternateCandidates(enhanced.candidatePool, enhanced.selectedImages),
      });

      storeCachedResult(normalizedQuery, finalized);

      startTransition(() => {
        createAndActivateCollage(finalized, normalizedQuery);
      });
      setLoading(false);
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

  const handleSavedCollageClick = (item: SavedCollageRecord): void => {
    activateSavedCollage(item);
  };

  const handleDeleteSavedCollage = (id: string): void => {
    const nextCollages = savedCollagesRef.current.filter((item) => item.id !== id);
    persistSavedCollages(nextCollages);

    if (activeCollageIdRef.current === id) {
      const next = nextCollages[0];
      if (next) {
        activateSavedCollage(next);
      } else {
        persistActiveCollageId(null);
        setResult(null);
        setArtistInput('');
        setSelectedSwapTargetArt(null);
      }
    }
  };

  const handleClearSavedCollages = (): void => {
    persistSavedCollages([]);
    persistActiveCollageId(null);
    setResult(null);
    setArtistInput('');
    setError(false);
    setSelectedSwapTargetArt(null);
  };

  const handleRefresh = (): void => {
    if (!result) return;
    const refreshed = refreshCollageResult(result);
    setResult(refreshed);
    setSelectedSwapTargetArt(null);
    autosaveResult(refreshed);
  };

  const handleSelectTile = (image: ImageCandidate): void => {
    setSelectedSwapTargetArt((current) => (current === image.art ? null : image.art));
  };

  const handleAdjustTilePosition = (image: ImageCandidate, focalPoint: [number, number]): void => {
    if (!result) return;
    const updated = applyFocalPointToResult(result, image.art, focalPoint);
    setResult(updated);
    autosaveResult(updated);
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

    const nextResult = {
      ...result,
      candidatePool: finalPool,
      selectedImages: replacementState.selectedImages,
      alternateCandidates: buildAlternateCandidates(finalPool, replacementState.selectedImages),
    };

    setResult(nextResult);
    setSelectedSwapTargetArt((current) => (current === image.art ? null : current));
    autosaveResult(nextResult);
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

    const nextResult = {
      ...result,
      candidatePool: nextPool,
      selectedImages: swapped.selectedImages,
      alternateCandidates: buildAlternateCandidates(nextPool, swapped.selectedImages),
    };

    setResult(nextResult);
    setSelectedSwapTargetArt(null);
    autosaveResult(nextResult);
  };

  return {
    artistInput,
    setArtistInput,
    savedCollages,
    activeCollageId,
    loading,
    loaderMsg,
    error,
    hasResults,
    result,
    theme,
    collageSubtitle,
    saveState,
    saveStatusLabel,
    saveStatusDetail,
    artistInputRef,
    selectedSwapTargetArt,
    selectedSwapTargetLabel: selectedSwapTargetArt
      ? result?.selectedImages.find((image) => image.art === selectedSwapTargetArt)?.label ?? 'Selected image'
      : null,
    handleSubmit,
    handleQuickPick,
    handleSavedCollageClick,
    handleDeleteSavedCollage,
    handleClearSavedCollages,
    handleRefresh,
    handleSelectTile,
    handleAdjustTilePosition,
    handleRemoveTile,
    handleSwapCandidate,
    renderImageUrl: getRenderableImageUrl,
  };
}
