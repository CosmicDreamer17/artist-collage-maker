'use client';

import type { HistoryItem } from '../lib/constants.js';

interface HistorySidebarProps {
  artistInput: string;
  history: HistoryItem[];
  onHistoryClick: (item: HistoryItem) => void;
  onClearHistory: () => void;
}

export function HistorySidebar({
  artistInput,
  history,
  onHistoryClick,
  onClearHistory,
}: HistorySidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Collage<span>.</span></h2>
        <p>poster maker</p>
      </div>
      <div className="history-label">Recent Artists</div>
      <div className="history-list">
        {history.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className={`history-item ${(artistInput.toLowerCase() === (item.query ?? item.name).toLowerCase()) ? 'active' : ''}`}
            onClick={() => onHistoryClick(item)}
          >
            <img
              className="history-thumb"
              src={item.thumb}
              alt=""
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
            />
            <span className="history-name">{item.name}</span>
          </div>
        ))}
      </div>
      <div className="history-clear">
        <button onClick={onClearHistory}>Clear History</button>
      </div>
    </aside>
  );
}
