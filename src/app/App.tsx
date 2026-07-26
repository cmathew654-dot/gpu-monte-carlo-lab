/**
 * App.tsx — single-page app shell (spec §4.1 task 1, §4.6 task 5).
 *
 * Dark-first "terminal for advisors": pure black canvas, white Inter UI,
 * monospace data labels. The full-viewport canvas is the stage; ControlPanel
 * (left rail) and StatCards (right rail) float over it with pointer-events
 * discipline (panels interactive, canvas receives drag elsewhere).
 * Presentation mode ('p') hides the chrome and enlarges the key stats.
 */
import { useEffect } from 'react';
import { CanvasRoot } from '../scene/CanvasRoot';
import { playhead, uCursorX } from '../scene/playhead';
import { AdvisorLensNav } from '../ui/AdvisorLensNav';
import { CapabilityBadge } from '../ui/CapabilityBadge';
import { ClientHud } from '../ui/ClientHud';
import { ControlPanel } from '../ui/ControlPanel';
import { CpuFallbackView } from '../ui/CpuFallbackView';
import { GauntletDriver, GauntletPanel } from '../ui/GauntletPanel';
import { PlayheadHud } from '../ui/PlayheadHud';
import { PresentationOverlay } from '../ui/PresentationOverlay';
import { ReadThisCaption } from '../ui/ReadThisCaption';
import { RobustnessFrontierPanel } from '../ui/RobustnessFrontierPanel';
import { StatCards } from '../ui/StatCards';
import { SwrButton } from '../ui/SwrButton';
import { useFrontierStore } from '../store/frontierStore';
import { useSimStore } from '../store/simStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable
  );
}

export default function App() {
  const mode = useSimStore((s) => s.mode);
  const presentation = useSimStore((s) => s.presentation);
  const togglePresentation = useSimStore((s) => s.togglePresentation);
  const setPresentation = useSimStore((s) => s.setPresentation);
  const viewMode = useSimStore((s) => s.viewMode);
  const toggleViewMode = useSimStore((s) => s.toggleViewMode);
  const advisorLens = useFrontierStore((s) => s.advisorLens);
  const showFutures = viewMode === 'advisor' && advisorLens === 'futures';
  const showFrontier = viewMode === 'advisor' && advisorLens === 'frontier';
  const showGauntlet = viewMode === 'advisor' && advisorLens === 'gauntlet';
  const showLegacyAdvisorData = showFutures || showGauntlet;

  // 'p' toggles presentation mode; 'a' toggles client ↔ advisor (viz4);
  // Escape exits presentation. Ignored while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePresentation();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        toggleViewMode();
      } else if (e.key === 'Escape' && useSimStore.getState().presentation) {
        setPresentation(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePresentation, setPresentation, toggleViewMode]);

  // Entering client mode unmounts YearCursor (the ONLY writer of the
  // shared uCursorX uniform). Pin the cursor to the horizon so a frozen
  // mid-sweep value can't dim the ember rain / hero thread ahead of it.
  useEffect(() => {
    if (viewMode === 'client') {
      playhead.xNorm = 1;
      uCursorX.value = 1;
    }
  }, [viewMode]);

  return (
    <div className="app-shell">
      {/* Advisor chrome (terminal header) — hidden in the client view;
          the client HUD carries its own badge + advisor-mode hint. */}
      {viewMode === 'advisor' && (
        <header className="app-header">
          <div className="app-header__brand">
            <h1 className="app-title">GPU Monte Carlo Lab</h1>
            <span className="app-subtitle">
              retirement simulator · <strong>ADVISOR VIEW</strong>
            </span>
          </div>
          {!presentation && <AdvisorLensNav />}
          <div className="app-header__actions">
            <CapabilityBadge mode={mode} />
            <button
              type="button"
              className="btn btn--secondary app-header__present"
              onClick={togglePresentation}
              aria-pressed={presentation}
              aria-label="Toggle presentation mode"
              title="Presentation mode (P)"
            >
              PRESENT <kbd className="kbd" aria-hidden="true">P</kbd>
            </button>
            {/* v5.1: the way BACK to the client mountain must be as visible
                as the way in — advisor mode read as "the old build" without it. */}
            <button
              type="button"
              className="btn btn--primary app-header__client"
              onClick={toggleViewMode}
              aria-label="Switch to client view"
              title="Client view (A)"
            >
              CLIENT VIEW <kbd className="kbd" aria-hidden="true">A</kbd>
            </button>
          </div>
        </header>
      )}

      <main className="app-viewport">
        <CanvasRoot />
        {/* viz2 — year-cursor scrub HUD + dismissable reading caption
            (advisor-only: the cursor plane is hidden in the client view). */}
        {showFutures && (
          <>
            <PlayheadHud />
            <ReadThisCaption />
          </>
        )}
      </main>

      {/* W2-B: deterministic replay runs from committedParams only. The
          panel is a DOM sibling of the canvas so every scene fact has an
          accessible client/advisor representation. */}
      <GauntletDriver />

      {presentation ? (
        <PresentationOverlay />
      ) : viewMode === 'client' ? (
        /* viz4 — narrative sentence + two sliders; replaces the rails. */
        <ClientHud />
      ) : (
        <>
          <ControlPanel />
          <section
            id="advisor-lens-panel-futures"
            role="tabpanel"
            aria-labelledby="advisor-lens-futures"
            className="advisor-lens-panel"
            hidden={advisorLens !== 'futures'}
          >
            {showFutures && showLegacyAdvisorData && (
              <>
                <StatCards />
                {/* Integrator — on-demand safe-withdrawal search (GPU mode). */}
                <SwrButton />
              </>
            )}
          </section>
          <section
            id="advisor-lens-panel-frontier"
            role="tabpanel"
            aria-labelledby="advisor-lens-frontier"
            className="advisor-lens-panel"
            hidden={advisorLens !== 'frontier'}
          >
            {showFrontier && <RobustnessFrontierPanel />}
          </section>
          <section
            id="advisor-lens-panel-gauntlet"
            role="tabpanel"
            aria-labelledby="advisor-lens-gauntlet"
            className="advisor-lens-panel"
            hidden={advisorLens !== 'gauntlet'}
          >
            {showGauntlet && showLegacyAdvisorData && (
              <>
                <StatCards />
                {/* Integrator — on-demand safe-withdrawal search (GPU mode). */}
                <SwrButton />
                <GauntletPanel />
              </>
            )}
          </section>
        </>
      )}
      <CpuFallbackView />
    </div>
  );
}
