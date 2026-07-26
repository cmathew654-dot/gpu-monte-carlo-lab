import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdvisorLensNav,
  AdvisorLensTabs,
  lensForArrowKey,
} from './AdvisorLensNav.tsx';
import { useFrontierStore } from '../store/frontierStore';

const lenses = ['futures', 'frontier', 'gauntlet'];

function noop() {
  // Rendering semantics do not require event dispatch.
}

for (const lens of lenses) {
  const markup = renderToStaticMarkup(
    React.createElement(AdvisorLensTabs, {
      advisorLens: lens,
      setAdvisorLens: noop,
    }),
  );

  assert.match(markup, /aria-label="Advisor analysis lens"/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 3);
  assert.match(markup, />Simulated futures</);
  assert.match(markup, />Robustness frontier</);
  assert.match(markup, />Historical gauntlet</);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/tabindex="0"/g) ?? []).length, 1);
  assert.equal((markup.match(/tabindex="-1"/g) ?? []).length, 2);

  for (const id of lenses) {
    assert.match(markup, new RegExp('id="advisor-lens-' + id + '"'));
    assert.match(
      markup,
      new RegExp('aria-controls="advisor-lens-panel-' + id + '"'),
    );
  }
  assert.match(
    markup,
    new RegExp(
      'id="advisor-lens-' + lens + '"[^>]*aria-selected="true"',
    ),
  );
}

try {
  useFrontierStore.getState().setAdvisorLens('futures');
  const wrapperMarkup = renderToStaticMarkup(React.createElement(AdvisorLensNav));
  assert.match(
    wrapperMarkup,
    /id="advisor-lens-futures"[^>]*aria-selected="true"/,
  );

  assert.equal(lensForArrowKey('futures', 'ArrowLeft'), 'gauntlet');
  assert.equal(lensForArrowKey('futures', 'ArrowRight'), 'frontier');
  assert.equal(lensForArrowKey('frontier', 'ArrowLeft'), 'futures');
  assert.equal(lensForArrowKey('frontier', 'ArrowRight'), 'gauntlet');
  assert.equal(lensForArrowKey('gauntlet', 'ArrowLeft'), 'frontier');
  assert.equal(lensForArrowKey('gauntlet', 'ArrowRight'), 'futures');
  assert.equal(lensForArrowKey('gauntlet', 'Home'), 'futures');
  assert.equal(lensForArrowKey('futures', 'End'), 'gauntlet');
  assert.equal(lensForArrowKey('frontier', 'Enter'), 'frontier');
} finally {
  useFrontierStore.getState().setAdvisorLens('futures');
}
