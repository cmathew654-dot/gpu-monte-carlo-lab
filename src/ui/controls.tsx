/**
 * controls.tsx — shared 2D control primitives (spec §4.6).
 * SegmentedControl (radiogroup, arrow-key nav) and ParamSlider (native
 * range input: focusable, arrow-key adjustable, screen-reader friendly).
 */
import { useId, useRef, type KeyboardEvent } from 'react';

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  ariaLabel: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((o) => o.value === value);
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = enabled[(idx + delta + enabled.length) % enabled.length];
    onChange(next.value);
    // Move DOM focus to the newly selected segment.
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[data-segment]',
    );
    buttons?.forEach((b) => {
      if (b.dataset.segment === String(next.value)) b.focus();
    });
  };

  return (
    <div
      ref={groupRef}
      className="segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            data-segment={String(opt.value)}
            className={`segmented__btn${checked ? ' segmented__btn--active' : ''}`}
            role="radio"
            aria-checked={checked}
            disabled={opt.disabled}
            title={opt.title}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParamSlider
// ---------------------------------------------------------------------------

export interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Formats the current value for the readout + aria-valuetext. */
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
}

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled = false,
  hint,
}: ParamSliderProps) {
  const id = useId();
  const text = format(value);
  return (
    <div className={`param-slider${disabled ? ' param-slider--disabled' : ''}`}>
      <div className="param-slider__row">
        <label className="param-slider__label" htmlFor={id}>
          {label}
        </label>
        <output className="param-slider__value data-label" htmlFor={id}>
          {text}
        </output>
      </div>
      <input
        id={id}
        className="param-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={text}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      />
      {hint ? <div className="param-slider__hint">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelSection — rail section with an uppercase mono heading.
// ---------------------------------------------------------------------------

export function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">{title}</h2>
      {children}
    </section>
  );
}
