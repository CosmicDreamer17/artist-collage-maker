import { and, eq, inArray } from 'drizzle-orm';
import type {
  ArtistSearchMatch,
  CreateImage,
  CreateQualitySignal,
  Image,
  ImageCandidate,
} from '@starter/domain';
import { ImageUrlSchema, isExactArtistName, normalizeArtistName, scoreImageCandidate } from '@starter/domain';
import type {
  ArtistCatalogGateway,
  ArtistPhotoGateway,
  ArtistSearchGateway,
  ImageRepository,
  QualitySignalRepository,
} from '@starter/application';
import { db } from './db.js';
import { images, qualitySignals } from './schema.js';

interface ITunesArtistResponse {
  results?: Array<{
    artistName: string;
    artistId: number;
  }>;
}

interface ITunesAlbumResponse {
  results?: Array<{
    wrapperType: string;
    collectionType: string;
    artistName: string;
    collectionName: string;
    artworkUrl100: string;
    releaseDate: string;
    collectionId: number;
  }>;
}

interface ITunesTrackResponse {
  results?: Array<{
    wrapperType: string;
    kind?: string;
    artistName: string;
    trackName?: string;
    artworkUrl100?: string;
    releaseDate: string;
  }>;
}

interface WikipediaSummaryResponse {
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
}

interface WikimediaCategoryResponse {
  query?: {
    categorymembers?: Array<{
      title: string;
    }>;
  };
}

interface WikimediaPageInfo {
  url: string;
  thumburl?: string;
  width: number;
  height: number;
  mime: string;
  extmetadata?: {
    Artist?: { value: string };
    LicenseShortName?: { value: string };
    DateTimeOriginal?: { value: string };
    Categories?: { value: string };
    ImageDescription?: { value: string };
  };
}

interface WikimediaPage {
  pageid?: number;
  title?: string;
  imageinfo?: WikimediaPageInfo[];
}

interface WikimediaQueryResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

interface DiscogsSearchResponse {
  results?: Array<{
    title?: string;
    id: number;
  }>;
}

interface DiscogsArtistResponse {
  images?: Array<{
    type: string;
    uri: string;
    width: number;
    height: number;
  }>;
}

interface OpenverseImageResponse {
  results?: Array<{
    url: string;
    title?: string;
    creator?: string;
    license?: string;
    width?: number;
    height?: number;
  }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class DrizzleImageRepository implements ImageRepository {
  private toDomain(row: typeof images.$inferSelect): Image {
    return {
      url: ImageUrlSchema.parse(row.url),
      artist: row.artist,
      source: row.source || undefined,
      score: row.score || 0,
    };
  }

  async findByArtist(artist: string): Promise<Image[]> {
    const results = await db.select().from(images).where(eq(images.artist, normalizeArtistName(artist)));
    return results.map((row) => this.toDomain(row));
  }

  async saveBatch(items: CreateImage[]): Promise<void> {
    if (items.length === 0) return;

    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .insert(images)
          .values({
            url: item.url,
            artist: normalizeArtistName(item.artist),
            source: item.source,
            score: item.score,
          })
          .onConflictDoUpdate({
            target: images.url,
            set: { score: item.score },
          });
      }
    });
  }
}

export class DrizzleQualitySignalRepository implements QualitySignalRepository {
  async findByArtist(artist: string): Promise<{ rejected: string[]; preferred: string[] }> {
    const normalizedArtist = normalizeArtistName(artist);
    const rejectedRows = await db
      .select({ url: qualitySignals.url })
      .from(qualitySignals)
      .where(
        and(
          eq(qualitySignals.artist, normalizedArtist),
          inArray(qualitySignals.action, ['reject', 'swap_out']),
        ),
      );

    const preferredRows = await db
      .select({ url: qualitySignals.url })
      .from(qualitySignals)
      .where(
        and(
          eq(qualitySignals.artist, normalizedArtist),
          inArray(qualitySignals.action, ['prefer', 'swap_in']),
        ),
      );

    return {
      rejected: Array.from(new Set(rejectedRows.map((row) => row.url))),
      preferred: Array.from(new Set(preferredRows.map((row) => row.url))),
    };
  }

  async save(signal: CreateQualitySignal): Promise<void> {
    await db.insert(qualitySignals).values({
      url: signal.url,
      artist: normalizeArtistName(signal.artist),
      action: signal.action,
    });
  }
}

export class ITunesGateway implements ArtistSearchGateway, ArtistCatalogGateway {
  async searchArtists(term: string): Promise<ArtistSearchMatch[]> {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=10&country=US`;
    const data = await fetchJson<ITunesArtistResponse>(url);
    return (data.results ?? [])
      .filter((result) => result.artistId > 0)
      .map((result) => ({
        artistName: result.artistName,
        artistId: result.artistId,
      }));
  }

  async fetchAlbums(artistName: string, artistId: number): Promise<ImageCandidate[]> {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=50&country=US`;
    const data = await fetchJson<ITunesAlbumResponse>(url);
    const artistLower = normalizeArtistName(artistName);
    const albums: ImageCandidate[] = [];
    const seen = new Set<string>();

    for (const result of data.results ?? []) {
      if (result.wrapperType !== 'collection' || result.collectionType !== 'Album') continue;
      if (!isExactArtistName(result.artistName, artistLower)) continue;

      const key = normalizeArtistName(result.collectionName.replace(/\s*\(.*?\)\s*/g, ' '));
      if (seen.has(key)) continue;
      seen.add(key);

      const candidate = scoreImageCandidate(
        {
          art: result.artworkUrl100.replace('100x100', '600x600'),
          label: `${result.collectionName} (${new Date(result.releaseDate).getFullYear()})`,
          name: result.collectionName,
          type: 'album',
          year: new Date(result.releaseDate).getFullYear(),
          releaseDate: result.releaseDate,
          dims: [600, 600],
          collectionId: result.collectionId,
        },
        'itunes-album',
      );

      albums.push(candidate);
    }

    return albums.sort((left, right) => (right.year ?? 0) - (left.year ?? 0));
  }

  async fetchVideos(artistName: string, artistId: number): Promise<ImageCandidate[]> {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=musicVideo&limit=60&country=US`;
    const data = await fetchJson<ITunesTrackResponse>(url);
    const artistLower = normalizeArtistName(artistName);
    const videos: ImageCandidate[] = [];
    const seen = new Set<string>();

    for (const result of data.results ?? []) {
      if (result.wrapperType !== 'track' || result.kind !== 'music-video' || !result.artworkUrl100) continue;
      if (!isExactArtistName(result.artistName, artistLower)) continue;
      const key = normalizeArtistName(result.trackName ?? result.artworkUrl100);
      if (seen.has(key)) continue;
      seen.add(key);

      videos.push(
        scoreImageCandidate(
          {
            art: result.artworkUrl100.replace('100x100', '600x600'),
            label: result.trackName,
            type: 'video',
            year: new Date(result.releaseDate).getFullYear(),
            releaseDate: result.releaseDate,
            dims: [600, 600],
          },
          'itunes-video',
        ),
      );
    }

    return videos.sort((left, right) => (right.year ?? 0) - (left.year ?? 0));
  }

  async fetchSingles(artistName: string, artistId: number): Promise<ImageCandidate[]> {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=80&country=US`;
    const data = await fetchJson<ITunesTrackResponse>(url);
    const artistLower = normalizeArtistName(artistName);
    const singles: ImageCandidate[] = [];
    const seenArtwork = new Set<string>();

    for (const result of data.results ?? []) {
      if (result.wrapperType !== 'track' || result.kind !== 'song' || !result.artworkUrl100 || !result.trackName) continue;
      if (!isExactArtistName(result.artistName, artistLower)) continue;
      if (seenArtwork.has(result.artworkUrl100)) continue;
      seenArtwork.add(result.artworkUrl100);

      singles.push(
        scoreImageCandidate(
          {
            art: result.artworkUrl100.replace('100x100', '600x600'),
            label: `${result.trackName} (Single)`,
            type: 'single',
            year: new Date(result.releaseDate).getFullYear(),
            releaseDate: result.releaseDate,
            dims: [600, 600],
          },
          'itunes-single',
        ),
      );
    }

    return singles.sort((left, right) => (right.year ?? 0) - (left.year ?? 0));
  }
}

function processWikimediaPages(
  pages: WikimediaPage[],
  artistName: string,
  source: 'wiki-cat' | 'wiki-search',
): ImageCandidate[] {
  const artistLower = normalizeArtistName(artistName);
  const seenUrls = new Set<string>();
  const seenEvents = new Set<string>();
  const photos: ImageCandidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    if (!info.mime.startsWith('image/jpeg') && !info.mime.startsWith('image/png')) continue;
    if (info.width < 500 || info.height < 400) continue;

    const ratio = info.width / info.height;
    if (ratio > 2.2 || ratio < 0.35) continue;

    const title = normalizeArtistName(page.title ?? '');
    const skipWords = [
      'logo',
      'icon',
      'flag',
      'signature',
      'autograph',
      'chart',
      'poster',
      'screenshot',
      'fan art',
      'fanart',
      'drawing',
      'illustration',
      'artwork',
      'cartoon',
      'anime',
      'comic',
      'album cover',
      'single cover',
      'disc',
      'vinyl',
      'cd',
      'ticket',
      'setlist',
      'wristband',
      'merchandise',
      'merch',
      'map',
      'diagram',
      'graph',
      'table',
      'collage',
      'wicked',
      'movie poster',
      'film poster',
      'dvd',
    ];
    if (skipWords.some((word) => title.includes(word))) continue;

    const categories = normalizeArtistName(info.extmetadata?.Categories?.value ?? '');
    if (
      categories.includes('album covers') ||
      categories.includes('logos') ||
      categories.includes('drawings') ||
      categories.includes('fan art') ||
      categories.includes('screenshots')
    ) {
      continue;
    }

    const cleanTitle = title
      .replace(/file:/g, '')
      .replace(artistLower, '')
      .replace(/\.(jpg|jpeg|png)$/g, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const dateMatch = cleanTitle.match(/(\d{4}[\s-]\d{2}[\s-]\d{2})/);
    const eventWords = cleanTitle
      .replace(/\d+/g, '')
      .replace(/\b(at|in|the|of|by|from|on|during|jpg|png|file|commons)\b/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');
    const eventKey = `${dateMatch ? dateMatch[1] : ''} ${eventWords}`.trim();
    if (eventKey && seenEvents.has(eventKey)) continue;
    if (eventKey) seenEvents.add(eventKey);

    const url = info.thumburl ?? info.url;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const ext = info.extmetadata ?? {};
    const candidate = scoreImageCandidate(
      {
        art: url,
        label: `${artistName} (Photo)`,
        title: page.title ?? '',
        type: 'photo',
        dims: [info.width, info.height],
        photographer: Boolean(ext.Artist?.value),
        license: ext.LicenseShortName?.value ?? '',
        hasExifDate: Boolean(ext.DateTimeOriginal?.value),
        hasCategoryMatch: normalizeArtistName(ext.Categories?.value ?? '').includes(artistLower),
        descLength: (ext.ImageDescription?.value ?? '').length,
      },
      source,
    );

    if ((candidate.score ?? 0) < 20) continue;
    photos.push(candidate);
  }

  return photos.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
}

export class WikimediaPhotoGateway implements ArtistPhotoGateway {
  async fetchPhotos(artistName: string): Promise<ImageCandidate[]> {
    const photos: ImageCandidate[] = [];
    const wikiName = artistName.replace(/\s+/g, '_');

    try {
      const summary = await fetchJson<WikipediaSummaryResponse>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`,
      );
      if (summary.originalimage?.source) {
        photos.push(
          scoreImageCandidate(
            {
              art: summary.originalimage.source,
              label: `${artistName} (Press Photo)`,
              title: 'Wikipedia main press photo',
              type: 'photo',
              dims: [summary.originalimage.width, summary.originalimage.height],
            },
            'wiki-main',
          ),
        );
      }
    } catch {
      // Best-effort source.
    }

    try {
      const category = await fetchJson<WikimediaCategoryResponse>(
        `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(
          wikiName,
        )}&cmtype=file&cmnamespace=6&cmlimit=40&cmsort=timestamp&cmdir=desc&format=json&origin=*`,
      );

      const members = category.query?.categorymembers ?? [];
      if (members.length > 0) {
        const titles = members.map((member) => member.title).join('|');
        const detail = await fetchJson<WikimediaQueryResponse>(
          `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            titles,
          )}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&format=json&origin=*`,
        );

        const pages = Object.values(detail.query?.pages ?? {});
        return [...photos, ...processWikimediaPages(pages, artistName, 'wiki-cat')];
      }
    } catch {
      // Fall back to search below.
    }

    try {
      const search = await fetchJson<WikimediaQueryResponse>(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          `"${artistName}" photograph`,
        )}&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&format=json&origin=*`,
      );
      const pages = Object.values(search.query?.pages ?? {}).sort((left, right) => (right.pageid ?? 0) - (left.pageid ?? 0));
      return [...photos, ...processWikimediaPages(pages, artistName, 'wiki-search')];
    } catch {
      return photos;
    }
  }
}

export class DiscogsPhotoGateway implements ArtistPhotoGateway {
  async fetchPhotos(artistName: string): Promise<ImageCandidate[]> {
    try {
      const search = await fetchJson<DiscogsSearchResponse>(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(artistName)}&type=artist&per_page=5`,
        {
          headers: {
            'User-Agent': 'ArtistCollageMaker/1.0',
          },
        },
      );

      const searchLower = normalizeArtistName(artistName);
      const match = (search.results ?? []).find((result) => {
        const title = normalizeArtistName(result.title ?? '');
        return title === searchLower || title.includes(searchLower) || searchLower.includes(title);
      });
      if (!match) return [];

      const detail = await fetchJson<DiscogsArtistResponse>(`https://api.discogs.com/artists/${match.id}`, {
        headers: {
          'User-Agent': 'ArtistCollageMaker/1.0',
        },
      });

      const seen = new Set<string>();
      const photos: ImageCandidate[] = [];

      for (const image of detail.images ?? []) {
        if (image.type !== 'primary' && image.type !== 'secondary') continue;
        if (image.width < 300 || image.height < 300) continue;
        if (seen.has(image.uri)) continue;
        seen.add(image.uri);

        photos.push(
          scoreImageCandidate(
            {
              art: image.uri,
              label: `${artistName} (Discogs)`,
              title: `discogs ${image.type} photo`,
              type: 'photo',
              dims: [image.width, image.height],
            },
            'discogs-photo',
          ),
        );
      }

      return photos;
    } catch {
      return [];
    }
  }
}

export class OpenversePhotoGateway implements ArtistPhotoGateway {
  async fetchPhotos(artistName: string): Promise<ImageCandidate[]> {
    const queries = [
      `"${artistName}"`,
      `${artistName} press photo`,
      `${artistName} portrait`,
      `${artistName} live`,
      `${artistName} concert`,
    ];

    const artistLower = normalizeArtistName(artistName);
    const artistTokens = artistLower.split(/\s+/).filter((token) => token.length > 2);
    const seen = new Set<string>();
    const photos: ImageCandidate[] = [];

    for (const query of queries) {
      try {
        const response = await fetchJson<OpenverseImageResponse>(
          `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=20`,
        );

        for (const result of response.results ?? []) {
          if (!result.url || !result.width || !result.height) continue;
          if (result.width < 500 || result.height < 500) continue;
          if (seen.has(result.url)) continue;

          const title = `${result.title ?? ''} ${result.creator ?? ''}`.trim();
          const titleLower = normalizeArtistName(title);
          const tokenMatches = artistTokens.filter((token) => titleLower.includes(token)).length;
          const titleMentionsArtist = titleLower.includes(artistLower) || tokenMatches >= Math.min(2, artistTokens.length);
          if (!titleMentionsArtist && query.startsWith('"')) continue;

          seen.add(result.url);
          const candidate = scoreImageCandidate(
            {
              art: result.url,
              label: `${artistName} (Openverse)`,
              title,
              type: 'photo',
              dims: [result.width, result.height],
              license: result.license ?? '',
            },
            'openverse-photo',
          );

          if (titleLower.includes(artistLower)) candidate.score = Math.min(100, (candidate.score ?? 0) + 10);
          if (titleLower.includes('press') || titleLower.includes('portrait') || titleLower.includes('headshot')) {
            candidate.score = Math.min(100, (candidate.score ?? 0) + 6);
          }
          if ((candidate.score ?? 0) < 28) continue;
          photos.push(candidate);
        }
      } catch {
        // Best-effort source.
      }
    }

    return photos.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  }
}
