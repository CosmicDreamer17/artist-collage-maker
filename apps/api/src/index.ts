import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import {
  BuildCollageRequestSchema,
  BuildCollageResponseSchema,
  CreateQualitySignalSchema,
  HealthResponseSchema,
  ImageUrlSchema,
} from '@starter/domain';
import {
  BuildCollageUseCase,
  GetQualitySignalsUseCase,
  RecordSignalUseCase,
  SaveImagesUseCase,
  type ArtistCatalogGateway,
  type ArtistPhotoGateway,
  type ArtistSearchGateway,
  type ImageRepository,
  type QualitySignalRepository,
} from '@starter/application';
import { z } from 'zod';

export interface AppDependencies {
  imageRepository: ImageRepository;
  signalRepository: QualitySignalRepository;
  artistSearchGateway: ArtistSearchGateway;
  artistCatalogGateway: ArtistCatalogGateway;
  photoGateways: ArtistPhotoGateway[];
}

export function createApp(deps: AppDependencies) {
  const recordSignalUseCase = new RecordSignalUseCase(deps.signalRepository);
  const saveImagesUseCase = new SaveImagesUseCase(deps.imageRepository);
  const getQualitySignalsUseCase = new GetQualitySignalsUseCase(deps.signalRepository);
  const buildCollageUseCase = new BuildCollageUseCase({
    imageRepository: deps.imageRepository,
    signalRepository: deps.signalRepository,
    artistSearchGateway: deps.artistSearchGateway,
    artistCatalogGateway: deps.artistCatalogGateway,
    photoGateways: deps.photoGateways,
  });

  const app = new Hono().basePath('/api');

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  const routes = app
    .get('/health', (c) => c.json(HealthResponseSchema.parse({ ok: true, storage: 'sqlite' })))
    .post('/collage', zValidator('json', BuildCollageRequestSchema), async (c) => {
      const body = c.req.valid('json');
      const result = await buildCollageUseCase.execute(body.query, body.count);
      if (!result.success) {
        return c.json(
          BuildCollageResponseSchema.parse({
            ok: false,
            error: result.error,
            message: result.message,
          }),
          result.error === 'artist_not_found' || result.error === 'no_images_found' ? 404 : 502,
        );
      }

      return c.json(
        BuildCollageResponseSchema.parse({
          ok: true,
          data: result.data,
        }),
      );
    })
    .post('/signal', zValidator('json', CreateQualitySignalSchema), async (c) => {
      const data = c.req.valid('json');
      const result = await recordSignalUseCase.execute(data);
      if (!result.success) return c.json({ error: result.error }, 400);
      return c.json({ ok: true }, 201);
    })
    .post(
      '/images',
      zValidator(
        'json',
        z.object({
          artist: z.string().min(1),
          images: z.array(
            z.object({
              url: ImageUrlSchema,
              source: z.string().optional(),
              score: z.number().optional(),
            }),
          ),
        }),
      ),
      async (c) => {
        const { artist, images } = c.req.valid('json');
        await saveImagesUseCase.execute(
          images.map((image) => ({
            url: image.url,
            artist,
            source: image.source,
            score: image.score ?? 0,
          })),
        );
        return c.json({ ok: true, count: images.length });
      },
    )
    .get('/quality/:artist', async (c) => {
      const artist = c.req.param('artist');
      const signals = await getQualitySignalsUseCase.execute(artist);
      return c.json(signals);
    })
    .get('/proxy/discogs/artist', async (c) => {
      const query = c.req.query('q');
      if (!query) return c.json({ error: 'Missing q param' }, 400);
      const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=artist&per_page=5`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ArtistCollageMaker/1.0' },
      });
      const data = await response.json();
      return c.json(data);
    })
    .get('/proxy/discogs/images/:id', async (c) => {
      const id = c.req.param('id');
      const response = await fetch(`https://api.discogs.com/artists/${id}`, {
        headers: { 'User-Agent': 'ArtistCollageMaker/1.0' },
      });
      const data = await response.json();
      return c.json(data);
    })
    .get('/proxy/image', async (c) => {
      const url = c.req.query('url');
      if (!url) return c.text('Missing url', 400);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ArtistCollageMaker/1.0' },
      });
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      c.header('Content-Type', contentType);
      c.header('Cache-Control', 'public, max-age=86400');
      return c.body(buffer);
    });

  return { app, routes };
}

export type AppType = ReturnType<typeof createApp>['routes'];
