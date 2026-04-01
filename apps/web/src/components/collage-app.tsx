'use client';

import { CandidatesPanel } from './candidates-panel.js';
import { CollageCanvas } from './collage-canvas.js';
import { HistorySidebar } from './history-sidebar.js';
import { SearchPanel } from './search-panel.js';
import { useCollageController } from '../hooks/use-collage-controller.js';

export function CollageApp() {
  const controller = useCollageController();
  const currentArtistName = controller.result?.artist.artistName ?? '';
  const alternateCandidates = controller.result?.alternateCandidates ?? [];
  const selectedImages = controller.result?.selectedImages ?? [];

  return (
    <>
      <div className="bg-decor">
        {controller.theme.floats.map((emoji, index) => (
          <span
            key={`${emoji}-${index}`}
            style={{
              left: `${(index * 17) % 95}%`,
              animationDelay: `${(index * 0.7) % 12}s`,
              animationDuration: `${10 + (index * 0.5) % 8}s`,
              fontSize: `${1 + (index * 0.2) % 1.5}rem`,
            }}
          >
            {emoji}
          </span>
        ))}
      </div>

      <div className="app-layout">
        <HistorySidebar
          activeCollageId={controller.activeCollageId}
          savedCollages={controller.savedCollages}
          renderImageUrl={controller.renderImageUrl}
          onSavedCollageClick={controller.handleSavedCollageClick}
          onDeleteCollage={controller.handleDeleteSavedCollage}
          onClearHistory={controller.handleClearSavedCollages}
        />

        <main className="main-content">
          <SearchPanel
            artistInput={controller.artistInput}
            hasResults={controller.hasResults}
            inputRef={controller.artistInputRef}
            onArtistInputChange={controller.setArtistInput}
            onSubmit={controller.handleSubmit}
            onQuickPick={controller.handleQuickPick}
          />

          <div className={`loader ${controller.loading ? 'active' : ''}`}>
            <div className="loader-spinner"></div>
            <p>{controller.loaderMsg}</p>
          </div>

          <div className={`error-msg ${controller.error ? 'active' : ''}`}>
            <h3>No Results Found</h3>
            <p>Try a different artist name or check spelling.</p>
          </div>

          <div className={`workspace-shell ${controller.hasResults ? 'active' : ''}`}>
            <div className="workspace-header">
              <div className={`save-status ${controller.saveState}`}>
                <div className="save-status-label">{controller.saveStatusLabel}</div>
                {controller.saveStatusDetail ? (
                  <p>{controller.saveStatusDetail}</p>
                ) : null}
              </div>

              <div className={`toolbar ${controller.hasResults ? 'active' : ''}`}>
                <button className="primary" onClick={() => window.print()}>Print Collage</button>
                <button onClick={controller.handleRefresh}>Refresh Layout</button>
                <button
                  onClick={() => {
                    controller.artistInputRef.current?.focus();
                    controller.artistInputRef.current?.select();
                  }}
                >
                  New Search
                </button>
              </div>
            </div>

            <div className="editor-layout">
              <div className="editor-main">
                <CollageCanvas
                  artistName={currentArtistName}
                  subtitle={controller.collageSubtitle}
                  theme={controller.theme}
                  images={selectedImages}
                  selectedTargetArt={controller.selectedSwapTargetArt}
                  renderImageUrl={controller.renderImageUrl}
                  onSelect={controller.handleSelectTile}
                  onAdjustTilePosition={controller.handleAdjustTilePosition}
                  onRemove={controller.handleRemoveTile}
                />
              </div>

              <aside className="editor-sidebar">
                <div className="editor-guide">
                  <div className="editor-guide-title">Edit Your Poster</div>
                  <p>Tap a picture on the poster, drag it until the crop feels right, then swap in a better option if you want.</p>
                </div>

                <CandidatesPanel
                  candidates={alternateCandidates}
                  hasSwapTarget={Boolean(controller.selectedSwapTargetArt)}
                  selectedTargetLabel={controller.selectedSwapTargetLabel}
                  renderImageUrl={controller.renderImageUrl}
                  onSwapCandidate={controller.handleSwapCandidate}
                />
              </aside>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
