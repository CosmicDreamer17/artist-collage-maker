import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCandidateApiOrigins } from '../../../lib/backend-origin.js';

function shouldRetryWithAnotherOrigin(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/html');
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const search = request.nextUrl.search;
  const currentPort = request.nextUrl.port || null;
  const origins = getCandidateApiOrigins(currentPort);
  const requestBody = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  let lastNetworkError: unknown;

  for (const origin of origins) {
    const url = `${origin}/api/${path.join('/')}${search}`;

    try {
      const init: RequestInit = {
        method: request.method,
        headers: new Headers(request.headers),
        redirect: 'manual',
      };
      if (requestBody !== undefined) {
        init.body = requestBody;
      }

      const response = await fetch(url, {
        ...init,
      });

      if (shouldRetryWithAnotherOrigin(response)) {
        continue;
      }

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error: unknown) {
      lastNetworkError = error;
    }
  }

  const message = lastNetworkError instanceof Error
    ? lastNetworkError.message
    : 'Unable to reach the API service.';

  return NextResponse.json(
    {
      ok: false,
      error: 'upstream_error',
      message,
    },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
