import * as React from 'react';
import { type AdvisorLens, useFrontierStore } from '../store/frontierStore';

const ADVISOR_LENSES: readonly AdvisorLens[] = [
  'futures',
  'models',
  'frontier',
  'gauntlet',
];

const LENS_LABELS: Record<AdvisorLens, string> = {
  futures: 'Simulated futures',
  models: 'Model math',
  frontier: 'Robustness frontier',
  gauntlet: 'Historical gauntlet',
};

function isLensNavigationKey(key: string): boolean {
  return (
    key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === 'Home'
    || key === 'End'
  );
}

// Pure keyboard mapping is exported for direct, deterministic tests.
// eslint-disable-next-line react-refresh/only-export-components
export function lensForArrowKey(current: AdvisorLens, key: string): AdvisorLens {
  const index = ADVISOR_LENSES.indexOf(current);
  if (key === 'ArrowLeft') {
    return ADVISOR_LENSES[(index - 1 + ADVISOR_LENSES.length) % ADVISOR_LENSES.length];
  }
  if (key === 'ArrowRight') {
    return ADVISOR_LENSES[(index + 1) % ADVISOR_LENSES.length];
  }
  if (key === 'Home') return 'futures';
  if (key === 'End') return 'gauntlet';
  return current;
}

export interface AdvisorLensTabsProps {
  advisorLens: AdvisorLens;
  setAdvisorLens: (advisorLens: AdvisorLens) => void;
}

export function AdvisorLensTabs({
  advisorLens,
  setAdvisorLens,
}: AdvisorLensTabsProps) {
  const tabRefs = React.useRef<Record<AdvisorLens, HTMLButtonElement | null>>({
    futures: null,
    models: null,
    frontier: null,
    gauntlet: null,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isLensNavigationKey(event.key)) return;
    event.preventDefault();
    const next = lensForArrowKey(advisorLens, event.key);
    setAdvisorLens(next);
    queueMicrotask(() => {
      tabRefs.current[next]?.focus();
    });
  };

  return (
    <div role="tablist" aria-label="Advisor analysis lens" className="advisor-lens-nav">
      {ADVISOR_LENSES.map((lens) => (
        <button
          key={lens}
          ref={(node) => {
            tabRefs.current[lens] = node;
          }}
          type="button"
          role="tab"
          id={'advisor-lens-' + lens}
          aria-controls={'advisor-lens-panel-' + lens}
          aria-selected={advisorLens === lens}
          tabIndex={advisorLens === lens ? 0 : -1}
          className="advisor-lens-nav__tab"
          onClick={() => setAdvisorLens(lens)}
          onKeyDown={onKeyDown}
        >
          {LENS_LABELS[lens]}
        </button>
      ))}
    </div>
  );
}

export function AdvisorLensNav() {
  const advisorLens = useFrontierStore((state) => state.advisorLens);
  const setAdvisorLens = useFrontierStore((state) => state.setAdvisorLens);
  return (
    <AdvisorLensTabs
      advisorLens={advisorLens}
      setAdvisorLens={setAdvisorLens}
    />
  );
}
