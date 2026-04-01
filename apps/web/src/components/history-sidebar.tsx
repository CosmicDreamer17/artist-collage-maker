'use client';

import type { ImageCandidate } from '@starter/domain';
import type { SavedCollageRecord } from '../lib/constants.js';

interface HistorySidebarProps {
  activeCollageId: string | null;
  savedCollages: SavedCollageRecord[];
  renderImageUrl: (image: Pick<ImageCandidate, 'art' | 'src'>) => string;
  onSavedCollageClick: (item: SavedCollageRecord) => void;
  onDeleteCollage: (id: string) => void;
  onClearHistory: () => void;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HistorySidebar({
  activeCollageId,
  savedCollages,
  renderImageUrl,
  onSavedCollageClick,
  onDeleteCollage,
  onClearHistory,
}: HistorySidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Collage<span>.</span></h2>
        <p>poster maker</p>
      </div>
      <div className="history-label">Saved Collages</div>
      <div className="history-subcopy">Auto-saved in this browser so edits do not disappear.</div>
      <div className="history-list">
        {savedCollages.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className={`history-item ${activeCollageId === item.id ? 'active' : ''}`}
            onClick={() => onSavedCollageClick(item)}
            onKeyDown={(event) => { if (event.key === 'Enter') onSavedCollageClick(item); }}
          >
            <img
              className="history-thumb"
              src={item.result.selectedImages[0] ? renderImageUrl(item.result.selectedImages[0]) : item.thumb}
              alt=""
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
            />
            <span className="history-copy">
              <span className="history-name">{item.title}</span>
              <span className="history-meta">
                {item.mode === 'copy' ? 'Saved copy' : 'Autosaved'} · {formatUpdatedAt(item.updatedAt)}
              </span>
            </span>
            <button
              type="button"
              className="history-delete"
              title="Remove from history"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteCollage(item.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="history-clear">
        <button onClick={onClearHistory}>Clear Saved Collages</button>
      </div>
    </aside>
  );
}
