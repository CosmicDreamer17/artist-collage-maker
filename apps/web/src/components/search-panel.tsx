'use client';

import { ARTIST_THEMES, DEFAULT_THEME, QUICK_PICKS } from '../lib/constants.js';

interface SearchPanelProps {
  artistInput: string;
  hasResults: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArtistInputChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent) => void;
  onQuickPick: (name: string) => void;
}

export function SearchPanel({
  artistInput,
  hasResults,
  inputRef,
  onArtistInputChange,
  onSubmit,
  onQuickPick,
}: SearchPanelProps) {
  return (
    <div className="search-panel">
      <div className="brand">
        <div className="brand-deco">🎀</div>
        <h1>Artist <em>Collage</em></h1>
        <p>Search any artist, build a printable poster, and keep editing without losing your work.</p>
      </div>
      <form className="search-form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={artistInput}
          onChange={(event) => onArtistInputChange(event.target.value)}
          placeholder="Sabrina Carpenter, Ariana Grande Positions ..."
          autoComplete="off"
          autoFocus
        />
        <button type="submit">Make It ✨</button>
      </form>

      {!hasResults ? (
        <div className="quick-picks">
          <div className="quick-picks-label">or pick one</div>
          <div className="quick-picks-grid">
            {QUICK_PICKS.map((name) => (
              <button key={name} type="button" className="quick-pick-btn" onClick={() => onQuickPick(name)}>
                <span className="qp-emoji">{ARTIST_THEMES[name.toLowerCase()]?.emoji || DEFAULT_THEME.emoji}</span> {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
