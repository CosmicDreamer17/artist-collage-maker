import {
  DiscogsPhotoGateway,
  DrizzleImageRepository,
  DrizzleQualitySignalRepository,
  ITunesGateway,
  OpenversePhotoGateway,
  SerperPhotoGateway,
  WikimediaPhotoGateway,
} from '@starter/infra';
import { handle } from 'hono/vercel';
import { createApp } from './index.js';

const { app } = createApp({
  imageRepository: new DrizzleImageRepository(),
  signalRepository: new DrizzleQualitySignalRepository(),
  artistSearchGateway: new ITunesGateway(),
  artistCatalogGateway: new ITunesGateway(),
  photoGateways: [new WikimediaPhotoGateway(), new OpenversePhotoGateway(), new DiscogsPhotoGateway(), new SerperPhotoGateway()],
});

export default handle(app);
