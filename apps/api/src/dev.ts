import { serve } from '@hono/node-server';
import {
  DiscogsPhotoGateway,
  DrizzleImageRepository,
  DrizzleQualitySignalRepository,
  ITunesGateway,
  OpenversePhotoGateway,
  WikimediaPhotoGateway,
} from '@starter/infra';
import { createApp } from './index.js';

const { app } = createApp({
  imageRepository: new DrizzleImageRepository(),
  signalRepository: new DrizzleQualitySignalRepository(),
  artistSearchGateway: new ITunesGateway(),
  artistCatalogGateway: new ITunesGateway(),
  photoGateways: [new WikimediaPhotoGateway(), new OpenversePhotoGateway(), new DiscogsPhotoGateway()],
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});
