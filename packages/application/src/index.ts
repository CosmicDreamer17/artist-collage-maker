import type {
  ArtistSearchMatch,
  CollageBuildResult,
  CreateImage,
  CreateQualitySignal,
  Image,
  ImageCandidate,
  QualitySignalsSummary,
  ResolvedArtistQuery,
} from '@starter/domain';
import {
  applyQualitySignalsToImages,
  buildAlternateCandidates,
  composeCollage,
  deduplicateImageCandidates,
  ImageSourceSchema,
  normalizeInput,
  scoreArtistResolutionCandidate,
} from '@starter/domain';

export interface ImageRepository {
  findByArtist(artist: string): Promise<Image[]>;
  saveBatch(images: CreateImage[]): Promise<void>;
}

export interface QualitySignalRepository {
  findByArtist(artist: string): Promise<QualitySignalsSummary>;
  save(signal: CreateQualitySignal): Promise<void>;
}

export interface ArtistSearchGateway {
  searchArtists(term: string): Promise<ArtistSearchMatch[]>;
}

export interface ArtistCatalogGateway {
  fetchAlbums(artistName: string, artistId: number): Promise<ImageCandidate[]>;
  fetchVideos(artistName: string, artistId: number): Promise<ImageCandidate[]>;
  fetchSingles(artistName: string, artistId: number): Promise<ImageCandidate[]>;
}

export interface ArtistPhotoGateway {
  fetchPhotos(artistName: string): Promise<ImageCandidate[]>;
}

export type RecordSignalResult =
  | { success: true }
  | { success: false; error: string };

export type BuildCollageUseCaseResult =
  | { success: true; data: CollageBuildResult }
  | { success: false; error: 'artist_not_found' | 'no_images_found' | 'upstream_error'; message: string };

export class RecordSignalUseCase {
  constructor(private readonly signalRepository: QualitySignalRepository) {}

  async execute(data: CreateQualitySignal): Promise<RecordSignalResult> {
    try {
      await this.signalRepository.save(data);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

export class GetQualitySignalsUseCase {
  constructor(private readonly signalRepository: QualitySignalRepository) {}

  async execute(artist: string): Promise<QualitySignalsSummary> {
    return this.signalRepository.findByArtist(artist);
  }
}

export class SaveImagesUseCase {
  constructor(private readonly imageRepository: ImageRepository) {}

  async execute(images: CreateImage[]): Promise<void> {
    await this.imageRepository.saveBatch(images);
  }
}

export class ResolveArtistQueryUseCase {
  constructor(private readonly artistSearchGateway: ArtistSearchGateway) {}

  async execute(rawInput: string): Promise<ResolvedArtistQuery | null> {
    const normalized = normalizeInput(rawInput);
    if (!normalized) return null;

    const words = normalized.split(/\s+/);
    let bestMatch: ResolvedArtistQuery | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let split = words.length; split >= 1; split -= 1) {
      const candidateArtist = words.slice(0, split).join(' ');
      const candidateAlbum = words.slice(split).join(' ') || null;
      const matches = await this.artistSearchGateway.searchArtists(candidateArtist);

      for (const match of matches) {
        const score = scoreArtistResolutionCandidate(match.artistName, candidateArtist, candidateAlbum);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
          artistName: match.artistName,
          artistId: match.artistId,
          albumFilter: candidateAlbum,
          };
        }
      }
    }

    return bestMatch;
  }
}

export interface BuildCollageUseCaseDeps {
  imageRepository: ImageRepository;
  signalRepository: QualitySignalRepository;
  artistSearchGateway: ArtistSearchGateway;
  artistCatalogGateway: ArtistCatalogGateway;
  photoGateways: ArtistPhotoGateway[];
}

function inferStoredImageType(source?: string): ImageCandidate['type'] {
  if (source === 'itunes-album') return 'album';
  if (source === 'itunes-single') return 'single';
  if (source === 'itunes-video') return 'video';
  return 'photo';
}

function hydrateStoredImages(images: Image[]): ImageCandidate[] {
  return images.map((image) => {
    const parsedSource = ImageSourceSchema.safeParse(image.source);
    const src = parsedSource.success ? parsedSource.data : undefined;
    const type = inferStoredImageType(src);
    const tags =
      type === 'photo'
        ? ['cached-prior', 'photo']
        : type === 'album'
          ? ['cached-prior', 'album-art']
          : ['cached-prior'];

    return {
      art: image.url,
      label: type === 'photo' ? 'Saved discovery' : 'Saved artwork',
      type,
      src,
      score: Math.max(25, image.score),
      tags,
    };
  });
}

export class BuildCollageUseCase {
  private readonly resolveArtistQueryUseCase: ResolveArtistQueryUseCase;

  constructor(private readonly deps: BuildCollageUseCaseDeps) {
    this.resolveArtistQueryUseCase = new ResolveArtistQueryUseCase(deps.artistSearchGateway);
  }

  async execute(rawInput: string, count: number): Promise<BuildCollageUseCaseResult> {
    const resolvedArtist = await this.resolveArtistQueryUseCase.execute(rawInput);
    if (!resolvedArtist) {
      return {
        success: false,
        error: 'artist_not_found',
        message: 'No artist matched that query.',
      };
    }

    try {
      const settledResults = await Promise.allSettled([
        this.deps.signalRepository.findByArtist(resolvedArtist.artistName),
        this.deps.imageRepository.findByArtist(resolvedArtist.artistName),
        this.deps.artistCatalogGateway.fetchAlbums(resolvedArtist.artistName, resolvedArtist.artistId),
        this.deps.artistCatalogGateway.fetchVideos(resolvedArtist.artistName, resolvedArtist.artistId),
        this.deps.artistCatalogGateway.fetchSingles(resolvedArtist.artistName, resolvedArtist.artistId),
        ...this.deps.photoGateways.map((gateway) => gateway.fetchPhotos(resolvedArtist.artistName)),
      ]);

      const [signalsResult, storedImagesResult, albumsSettled, videosSettled, singlesSettled, ...photoSettled] = settledResults;

      const signals = signalsResult?.status === 'fulfilled'
        ? signalsResult.value
        : { rejected: [], preferred: [] };
      const storedImages = storedImagesResult?.status === 'fulfilled'
        ? hydrateStoredImages(storedImagesResult.value)
        : [];
      const albumsResult = albumsSettled?.status === 'fulfilled' ? albumsSettled.value : [];
      const videosResult = videosSettled?.status === 'fulfilled' ? videosSettled.value : [];
      const singlesResult = singlesSettled?.status === 'fulfilled' ? singlesSettled.value : [];
      const photoResults = photoSettled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));

      const mergedCandidatePool = deduplicateImageCandidates([
        ...storedImages,
        ...photoResults.flat(),
        ...albumsResult,
        ...videosResult,
        ...singlesResult,
      ]);

      const candidatePool = applyQualitySignalsToImages(mergedCandidatePool, signals);
      const selectedImages = composeCollage(candidatePool, resolvedArtist.albumFilter, count);

      if (selectedImages.length === 0) {
        return {
          success: false,
          error: 'no_images_found',
          message: 'No usable images were found for that artist.',
        };
      }

      const alternateCandidates = buildAlternateCandidates(candidatePool, selectedImages);

      try {
        await this.deps.imageRepository.saveBatch(
          candidatePool.map((image) => ({
            url: image.art as CreateImage['url'],
            artist: resolvedArtist.artistName,
            source: image.src,
            score: image.score ?? 0,
          })),
        );
      } catch {
        // Image persistence is a cache/warmup concern and should not block collage generation.
      }

      return {
        success: true,
        data: {
          artist: resolvedArtist,
          selectedImages,
          candidatePool,
          alternateCandidates,
          albums: albumsResult,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: 'upstream_error',
        message,
      };
    }
  }
}
