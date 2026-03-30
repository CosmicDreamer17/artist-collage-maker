'use client';

import Script from 'next/script';
import { CollageApp } from '../components/collage-app.js';

export default function Home() {
  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/dist/face-api.js" strategy="lazyOnload" />
      <CollageApp />
    </>
  );
}
