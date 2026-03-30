'use client';

import type { ImageCandidate } from '@starter/domain';

interface CandidatesPanelProps {
  candidates: ImageCandidate[];
  hasSwapTarget: boolean;
  selectedTargetLabel: string | null;
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
  onSwapCandidate: (image: ImageCandidate) => void;
}

export function CandidatesPanel({
  candidates,
  hasSwapTarget,
  selectedTargetLabel,
  renderImageUrl,
  onSwapCandidate,
}: CandidatesPanelProps) {
  return (
    <div className={`candidates-panel ${candidates.length > 0 ? 'active' : ''}`}>
      <div className="candidates-label">
        {hasSwapTarget ? 'Pick a replacement' : 'Choose a picture to change'}
        <span>{candidates.length}</span>
      </div>
      <div className={`candidates-helper ${hasSwapTarget ? 'active' : ''}`}>
        {hasSwapTarget
          ? `Replacing: ${selectedTargetLabel ?? 'selected image'}`
          : 'Tap a collage picture first, then tap one of these replacements.'}
      </div>
      <div className="candidates-grid">
        {candidates.map((image, index) => (
          <div key={`${image.art}-${index}`} className="candidate-item">
            <img
              className="candidate-thumb"
              src={renderImageUrl(image)}
              alt={image.label}
              loading="lazy"
              title={`Score: ${image.score ?? 0} | ${image.tags?.join(', ') ?? image.type ?? 'image'}`}
              onClick={() => onSwapCandidate(image)}
            />
            <div className="candidate-score">{image.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
