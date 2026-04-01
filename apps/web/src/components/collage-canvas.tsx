'use client';

import type { ImageCandidate } from '@starter/domain';
import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { LAYOUT_SEQUENCE, type ArtistTheme } from '../lib/constants.js';

interface CollageCanvasProps {
  collageRef?: React.RefObject<HTMLDivElement | null>;
  artistName: string;
  subtitle: string;
  theme: ArtistTheme;
  images: ImageCandidate[];
  selectedTargetArt: string | null;
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
  onSelect: (image: ImageCandidate) => void;
  onAdjustTilePosition: (image: ImageCandidate, focalPoint: [number, number]) => void;
  onRemove: (image: ImageCandidate) => void;
}

export function CollageCanvas({
  collageRef,
  artistName,
  subtitle,
  theme,
  images,
  selectedTargetArt,
  renderImageUrl,
  onSelect,
  onAdjustTilePosition,
  onRemove,
}: CollageCanvasProps) {
  const dragStateRef = useRef<{
    art: string;
    pointerId: number;
    startX: number;
    startY: number;
    origin: [number, number];
  } | null>(null);
  const skipClickArtRef = useRef<string | null>(null);

  const getDefaultFocalPoint = (image: ImageCandidate): [number, number] => {
    if (image.focalPoint) {
      return image.focalPoint;
    }

    const tags = new Set(image.tags ?? []);
    if (image.type === 'photo' && (tags.has('portrait-ratio') || tags.has('tall'))) {
      return [50, 22];
    }

    if (image.type === 'photo') {
      return [50, 30];
    }

    return [50, 50];
  };

  const getImageStyle = (image: ImageCandidate): CSSProperties => {
    const [x, y] = getDefaultFocalPoint(image);
    return { objectPosition: `${x}% ${y}%` };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, image: ImageCandidate): void => {
    if (selectedTargetArt !== image.art) return;

    dragStateRef.current = {
      art: image.art,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: getDefaultFocalPoint(image),
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>, image: ImageCandidate): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.art !== image.art || dragState.pointerId !== event.pointerId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const deltaX = ((event.clientX - dragState.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - dragState.startY) / rect.height) * 100;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

    skipClickArtRef.current = image.art;
    onAdjustTilePosition(image, [dragState.origin[0] - deltaX, dragState.origin[1] - deltaY]);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  };

  const handleTileClick = (image: ImageCandidate): void => {
    if (skipClickArtRef.current === image.art) {
      skipClickArtRef.current = null;
      return;
    }

    onSelect(image);
  };

  return (
    <div className={`collage-wrapper ${images.length > 0 ? 'active' : ''}`}>
      <div ref={collageRef} className="collage" style={{ background: theme.collageBg }}>
        {theme.deco.map((emoji, index) => (
          <div key={`${emoji}-${index}`} className={`deco-corner deco-${['tl', 'tr', 'bl', 'br'][index]}`}>{emoji}</div>
        ))}
        <div className="collage-header">
          <div
            className="collage-artist-name"
            style={{
              fontSize:
                artistName.length <= 6
                  ? '60pt'
                  : artistName.length <= 10
                    ? '48pt'
                    : artistName.length <= 16
                      ? '38pt'
                      : artistName.length <= 24
                        ? '28pt'
                        : '22pt',
            }}
          >
            {artistName}
          </div>
          <div className="collage-script">{theme.script}</div>
          <div className="collage-subtitle">{subtitle}</div>
        </div>
        <div className="collage-divider"></div>
        <div className="collage-mosaic">
          {images.map((image, index) => (
            <div
              key={image.art}
              className={`mosaic-item ${LAYOUT_SEQUENCE[index % LAYOUT_SEQUENCE.length]} ${selectedTargetArt === image.art ? 'selected-target draggable-target' : ''}`}
              style={{ animationDelay: `${index * 0.04}s` }}
              onClick={() => handleTileClick(image)}
              onPointerDown={(event) => handlePointerDown(event, image)}
              onPointerMove={(event) => handlePointerMove(event, image)}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              title={selectedTargetArt === image.art ? 'Drag to reframe, or tap again to stop editing this image' : 'Tap to edit this image'}
            >
              <img
                src={renderImageUrl(image)}
                alt={image.label}
                loading={index < 6 ? 'eager' : 'lazy'}
                style={getImageStyle(image)}
                onError={(event) => { event.currentTarget.style.opacity = '0'; }}
              />
              <div className="tile-label">{image.label}</div>
              {selectedTargetArt === image.art ? <div className="tile-target-badge">Editing</div> : null}
              <button className="tile-remove" title="Remove this image" onClick={(event) => {
                event.stopPropagation();
                onRemove(image);
              }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="collage-footer">
          <span>Collage.</span><span>{artistName.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
