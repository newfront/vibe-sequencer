"use client";

import { useState, type ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  active?: boolean;
};

const VARIANTS: Record<string, string> = {
  default:
    "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border-neutral-700",
  primary: "bg-sky-500 text-neutral-950 hover:bg-sky-400 border-sky-400",
  ghost:
    "bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border-transparent",
  danger:
    "bg-neutral-800 text-rose-300 hover:bg-rose-900/60 border-neutral-700",
};

export function Button({
  variant = "default",
  active = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-sky-400 bg-sky-500/20 text-sky-200 hover:bg-sky-500/25"
          : VARIANTS[variant],
        className,
      )}
    />
  );
}

/** Square button for icon-only controls, so hit areas stay consistent. */
export function IconButton({
  className,
  ...props
}: ButtonProps & { title: string }) {
  return <Button {...props} className={cx("w-7 px-0", className)} />;
}

export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "text-[10px] font-semibold tracking-wider text-neutral-500 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

const CONTROL =
  "h-7 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200 " +
  "focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none";

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, className)} />;
}

export function NumberInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="numeric"
      {...props}
      className={cx(CONTROL, "tabular w-16", className)}
    />
  );
}

/**
 * Numeric input that only reports a value on blur or Enter.
 *
 * Committing on every keystroke would let clamping fight the typist — the
 * moment you clear the field to type "90" it would snap to the minimum.
 */
export function CommitNumber({
  value,
  onCommit,
  min,
  max,
  step = 1,
  className,
  title,
  label,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  title?: string;
  label: string;
}) {
  // While focused the field owns its text; otherwise it simply shows the prop,
  // so there is no state to keep in sync.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);

  const commit = () => {
    setDraft(null);
    const parsed = Number(text);
    if (text.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed);
  };

  return (
    <NumberInput
      value={text}
      min={min}
      max={max}
      step={step}
      title={title}
      aria-label={label}
      className={className}
      onFocus={() => setDraft(String(value))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Keep global transport shortcuts from firing while typing.
        event.stopPropagation();
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(CONTROL, "cursor-pointer appearance-none pr-6", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'><path d='M1 1l4 4 4-4' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.5rem center",
      }}
    />
  );
}

export function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-neutral-800" />;
}

// -- icons -----------------------------------------------------------------
// Inline so the app ships no icon dependency.

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "currentColor",
  "aria-hidden": true,
} as const;

export function PlayIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 2.6a.8.8 0 0 1 1.22-.68l7 4.72a.8.8 0 0 1 0 1.33l-7 4.72A.8.8 0 0 1 4.5 12.4z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="2.5" width="3" height="11" rx="1" />
      <rect x="9" y="2.5" width="3" height="11" rx="1" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  );
}

export function RewindIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="2" height="10" rx="1" />
      <path d="M13 4.1v7.8a.7.7 0 0 1-1.08.6L6.4 8.6a.7.7 0 0 1 0-1.2l5.52-3.9A.7.7 0 0 1 13 4.1z" />
    </svg>
  );
}

export function LoopIcon() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M4.5 5.5h7a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 8a2.5 2.5 0 0 1 2.5-2.5z"
        strokeLinejoin="round"
      />
      <path d="M6 3.6 4.2 5.5 6 7.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      {...iconProps}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M6 4H9.5A4 4 0 0 1 9.5 12H5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.6 2 5.2 4l2.4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path
        d="M3.5 5h9M6.5 5V3.6h3V5M5 5l.6 8h4.8L11 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" />
      <path d="M10.5 3.5H4a.5.5 0 0 0-.5.5v6.5" strokeLinecap="round" />
    </svg>
  );
}
