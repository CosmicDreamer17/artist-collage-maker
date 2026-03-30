'use client';

import type { ImageCandidate } from '@starter/domain';
import type { CSSProperties } from 'react';
import { LAYOUT_SEQUENCE, type ArtistTheme } from '../lib/constants.js';

interface CollageCanvasProps {
  artistName: string;
  subtitle: string;
  theme: ArtistTheme;
  images: ImageCandidate[];
  selectedTargetArt: string | null;
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
  onSelect: (image: ImageCandidate) => void;
  onRemove: (image: ImageCandidate) => void;
}

export function CollageCanvas({
  artistName,
  subtitle,
  theme,
  images,
  selectedTargetArt,
  renderImageUrl,
  onSelect,
  onRemove,
}: CollageCanvasProps) {
  const getImageStyle = (image: ImageCandidate): CSSProperties => {
    if (image.focalPoint) {
      return { objectPosition: `${image.focalPoint[0]}% ${image.focalPoint[1]}%` };
    }

    const tags = new Set(image.tags ?? []);
    if (image.type === 'photo' && (tags.has('portrait-ratio') || tags.has('tall'))) {
      return { objectPosition: '50% 22%' };
    }

    if (image.type === 'photo') {
      return { objectPosition: '50% 30%' };
    }

    return { objectPosition: '50% 50%' };
  };

  return (
    <div className={`collage-wrapper ${images.length > 0 ? 'active' : ''}`}>
      <div className="collage" style={{ background: theme.collageBg }}>
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
              className={`mosaic-item ${LAYOUT_SEQUENCE[index % LAYOUT_SEQUENCE.length]} ${selectedTargetArt === image.art ? 'selected-target' : ''}`}
              style={{ animationDelay: `${index * 0.04}s` }}
              onClick={() => onSelect(image)}
              title={selectedTargetArt === image.art ? 'Tap again to stop replacing this image' : 'Tap to choose this image for replacement'}
            >
              <img src={renderImageUrl(image)} alt={image.label} loading={index < 6 ? 'eager' : 'lazy'} style={getImageStyle(image)} />
              <div className="tile-label">{image.label}</div>
              {selectedTargetArt === image.art ? <div className="tile-target-badge">Replacing</div> : null}
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
