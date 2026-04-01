import type {
  BuildCollageResponse,
  CollageBuildResult,
  HealthResponse,
  ImageCandidate,
  QualitySignalAction,
} from '@starter/domain';
import {
  BuildCollageResponseSchema,
  HealthResponseSchema,
  normalizeArtistName,
} from '@starter/domain';

function getDefaultApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '';
  }

  return process.env.NEXT_PUBLIC_API_URL || '';
}

function getApiBaseUrl(): string {
  return getDefaultApiBaseUrl().replace(/\/$/, '');
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  return `${base}${path}`;
}

async function parseJson<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  return parse(await response.json());
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(buildApiUrl('/api/health'), { method: 'GET' });
  return parseJson(response, (value) => HealthResponseSchema.parse(value));
}

export async function buildCollage(query: string, count = 18): Promise<CollageBuildResult> {
  const response = await fetch(buildApiUrl('/api/collage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count }),
  });

  const payload = await parseJson(response, (value) => BuildCollageResponseSchema.parse(value)) as BuildCollageResponse;
  if (!payload.ok) {
    throw new Error(payload.message);
  }

  return payload.data;
}

export async function recordSignal(url: string, artist: string, action: QualitySignalAction): Promise<void> {
  await fetch(buildApiUrl('/api/signal'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, artist: normalizeArtistName(artist), action }),
  });
}

export function getRenderableImageUrl(image: Pick<ImageCandidate, 'art' | 'src'>): string {
  return `${buildApiUrl('/api/proxy/image')}?url=${encodeURIComponent(image.art)}`;
}
