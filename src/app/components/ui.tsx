// Small building blocks: segmented choices, a stepper, dialogs and a confirm prompt.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useStrings } from '../strings.ts';

interface Option<T> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string | number | boolean> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** One choice out of a few, as a row of buttons (radio buttons underneath). */
export function Segmented<T extends string | number | boolean>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${className ?? ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className="segment"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-button" aria-label="−1" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output className="stepper-value" aria-live="polite">{value}</output>
      <button type="button" className="stepper-button" aria-label="+1" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** A modal on the native <dialog>: Esc and a tap outside close it. */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Asks before acting. `danger` (the default) is for actions that throw something away. */
type Confirm = (message: string, ok: string, danger?: boolean) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

/** Provides useConfirm(): a styled replacement for window.confirm. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useStrings();
  const [ask, setAsk] = useState<{ message: string; ok: string; danger: boolean; resolve: (yes: boolean) => void } | null>(null);
  const confirm = useCallback<Confirm>((message, ok, danger = true) => new Promise((resolve) => setAsk({ message, ok, danger, resolve })), []);
  const answer = (yes: boolean) => {
    ask?.resolve(yes);
    setAsk(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={ask !== null} onClose={() => answer(false)} title={ask?.ok ?? ''} className="dialog--confirm">
        <p className="confirm-message">{ask?.message}</p>
        <div className="dialog-actions">
          <button type="button" className="button button--quiet" onClick={() => answer(false)}>
            {t.cancel}
          </button>
          <button type="button" className={`button ${ask?.danger === false ? 'button--primary' : 'button--danger'}`} autoFocus onClick={() => answer(true)}>
            {ask?.ok}
          </button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
