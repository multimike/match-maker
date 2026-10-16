// Small building blocks: segmented choices, a stepper, dialogs and their parts, form fields and a
// confirm prompt.
//
// Every dialog has the same anatomy: a head with the title (and a close button), a body that
// scrolls, and a foot pinned to the bottom with the dialog's own buttons: Cancel and the main
// action, or Done. Things that can't be undone sit at the end of the body in a section of their
// own, never next to Done. On a phone a dialog is a sheet from the bottom of the screen.

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
  children?: ReactNode;
  /** The dialog's own buttons, pinned to the bottom: Cancel and the main action, or Done. */
  footer?: ReactNode;
  /** One line under the title. */
  lead?: ReactNode;
  /** Above the title, centred: a player's avatar on a sheet. */
  media?: ReactNode;
  /** 'form' (the default), 'sheet' (about one player) or 'alert' (a question the buttons answer). */
  variant?: 'form' | 'sheet' | 'alert';
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** A modal on the native <dialog>: Esc, the close button and a tap outside close it. */
export function Dialog({ open, onClose, title, children, footer, lead, media, variant = 'form' }: DialogProps) {
  const t = useStrings();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const alert = variant === 'alert';
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Opening focuses the first button: the close button, or Cancel in an alert. React's
      // autoFocus can't reach into a closed dialog, so a field to start in has data-autofocus.
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${variant}`}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={alert && children ? bodyId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-frame">
          <header className="dialog-head">
            {media}
            <h2 className="dialog-title" id={titleId}>
              {title}
            </h2>
            {lead && <p className="dialog-lead">{lead}</p>}
            {!alert && (
              <button type="button" className="dialog-close" aria-label={t.close} title={t.close} onClick={onClose}>
                <CloseIcon />
              </button>
            )}
          </header>
          {children && (
            <div className="dialog-body" id={bodyId}>
              {children}
            </div>
          )}
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** A titled group in a dialog, with a line above it when it follows another. */
export function Section({ title, hint, danger, children }: { title: string; hint?: ReactNode; danger?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`dialog-section${danger ? ' dialog-section--danger' : ''}`} aria-labelledby={id}>
      <h3 className="dialog-section-title" id={id}>
        {title}
      </h3>
      {hint && <p className="dialog-section-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** A setting: what it is on the left, the control on the right; stacked when the dialog is narrow. */
export function SettingRow({ label, hint, htmlFor, children }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        {htmlFor ? (
          <label className="setting-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="setting-label">{label}</span>
        )}
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/** A form field: the label, then what to know, then the control. */
export function Field({ label, hint, htmlFor, children }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {hint && <span className="field-hint">{hint}</span>}
      {children}
    </div>
  );
}

/** Copies text, and says so on the button. */
export function CopyButton({ text, label, className = 'button button--quiet' }: { text: string; label: string; className?: string }) {
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [text]);
  return (
    <button type="button" className={className} onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
      {copied ? t.copied : label}
    </button>
  );
}

/** A question before acting: the title asks it, the message says what happens, `ok` does it. */
interface Ask {
  title: string;
  message?: string;
  ok: string;
  /** For actions that throw something away (the default): the OK button is red. */
  danger?: boolean;
}

type Confirm = (ask: Ask) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

/** Provides useConfirm(): a styled replacement for window.confirm. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useStrings();
  const [ask, setAsk] = useState<(Ask & { resolve: (yes: boolean) => void }) | null>(null);
  const confirm = useCallback<Confirm>((question) => new Promise((resolve) => setAsk({ ...question, resolve })), []);
  const answer = (yes: boolean) => {
    ask?.resolve(yes);
    setAsk(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={ask !== null}
        onClose={() => answer(false)}
        title={ask?.title ?? ''}
        variant="alert"
        footer={
          // Cancel comes first and has the focus, so Enter never throws anything away by mistake.
          <>
            <button type="button" className="button button--quiet" onClick={() => answer(false)}>
              {t.cancel}
            </button>
            <button type="button" className={`button ${ask?.danger === false ? 'button--primary' : 'button--danger'}`} onClick={() => answer(true)}>
              {ask?.ok}
            </button>
          </>
        }
      >
        {ask?.message && <p className="confirm-message">{ask.message}</p>}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
