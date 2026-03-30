import type { CollageBuildResult } from '@starter/domain';
import { buildAlternateCandidates, composeCollage } from '@starter/domain';

interface FaceApi {
  nets: {
    tinyFaceDetector: {
      loadFromUri: (uri: string) => Promise<void>;
    };
  };
  detectAllFaces: (
    img: HTMLImageElement,
    options: unknown,
  ) => Promise<Array<{ box: { x: number; y: number; width: number; height: number } }>>;
  TinyFaceDetectorOptions: new (options: { inputSize: number; scoreThreshold: number }) => unknown;
}

declare global {
  interface Window {
    faceapi?: FaceApi;
  }
}

let modelLoaded = false;

async function loadFaceDetector(): Promise<boolean> {
  if (modelLoaded) return true;
  if (typeof window === 'undefined' || !window.faceapi) return false;

  try {
    await window.faceapi.nets.tinyFaceDetector.loadFromUri(
      'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/',
    );
    modelLoaded = true;
    return true;
  } catch {
    return false;
  }
}

async function analyzePhoto(url: string, isPhotoType: boolean): Promise<{ penalty: number; focalPoint?: [number, number] }> {
  if (typeof window === 'undefined' || !window.faceapi) {
    return { penalty: 0 };
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      setTimeout(() => reject(new Error('Timed out loading image')), 4000);
      img.src = url;
    });

    const detections = await window.faceapi.detectAllFaces(
      img,
      new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }),
    );

    if (detections.length === 0) return { penalty: isPhotoType ? -15 : 0 };

    const face = detections[0]?.box;
    if (!face) return { penalty: 0 };

    const faceCenterX = ((face.x + (face.width / 2)) / img.width) * 100;
    const faceCenterY = ((face.y + (face.height / 2)) / img.height) * 100;
    const focalPoint: [number, number] | undefined = Number.isFinite(faceCenterX) && Number.isFinite(faceCenterY)
      ? [
          Math.max(20, Math.min(80, faceCenterX)),
          Math.max(18, Math.min(45, faceCenterY)),
        ]
      : undefined;

    const withFocalPoint = (penalty: number): { penalty: number; focalPoint?: [number, number] } =>
      focalPoint ? { penalty, focalPoint } : { penalty };

    if (face.y < img.height * 0.03) return withFocalPoint(-15);
    if (face.y + face.height > img.height * 0.97) return withFocalPoint(-10);
    if (face.x < img.width * 0.03 || face.x + face.width > img.width * 0.97) return withFocalPoint(-8);
    return withFocalPoint(5);
  } catch {
    return { penalty: 0 };
  }
}

export async function enhanceCollageWithFaceDetection(
  result: CollageBuildResult,
): Promise<CollageBuildResult> {
  const ready = await loadFaceDetector();
  if (!ready) return result;

  const updatedPool = result.candidatePool.map((image) => ({ ...image }));
  const photoCandidates = updatedPool
    .filter((image) => image.type === 'photo')
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 8);

  await Promise.all(
    photoCandidates.map(async (image) => {
      const analysis = await analyzePhoto(image.art, true);
      image.score = Math.max(0, (image.score ?? 0) + analysis.penalty);
      if (analysis.penalty < -10) {
        image.tags = [...(image.tags ?? []), 'bad-crop'];
      }
      if (analysis.focalPoint) {
        image.focalPoint = analysis.focalPoint;
      }
    }),
  );

  const selectedImages = composeCollage(updatedPool, result.artist.albumFilter, result.selectedImages.length);
  return {
    ...result,
    candidatePool: updatedPool,
    selectedImages,
    alternateCandidates: buildAlternateCandidates(updatedPool, selectedImages),
  };
}
