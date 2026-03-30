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
        {hasSwapTarget ? 'Replacement tray' : 'Replacement tray'}
        <span>{candidates.length}</span>
      </div>
      <div className={`candidates-helper ${hasSwapTarget ? 'active' : ''}`}>
        {hasSwapTarget
          ? `Editing ${selectedTargetLabel ?? 'selected image'}. Drag it on the poster to reframe, or pick a replacement here.`
          : 'Tap a picture on the poster first. Then drag it to reframe or swap in one of these options.'}
      </div>
      <div className="candidates-grid">
        {candidates.map((image, index) => (
          <button
            key={`${image.art}-${index}`}
            type="button"
            className="candidate-item"
            onClick={() => onSwapCandidate(image)}
            title={`Score: ${image.score ?? 0} | ${image.tags?.join(', ') ?? image.type ?? 'image'}`}
          >
            <img
              className="candidate-thumb"
              src={renderImageUrl(image)}
              alt={image.label}
              loading="lazy"
            />
            <div className="candidate-score">{image.score}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
