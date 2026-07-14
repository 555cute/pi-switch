import { useEffect, useRef, useState } from "react";

/* ---- Toggle (iOS style) ---- */

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

/* ---- Slider with value pill ---- */

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  formatter,
  width = 200,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  formatter?: (v: number) => string;
  width?: number;
}) {
  const display = formatter ? formatter(value) : `${value}${suffix}`;
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width }}
      />
      <span className="slider-pill">{display}</span>
    </div>
  );
}

/* ---- Number stepper (compact + / -) ---- */

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  width = 90,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  width?: number;
}) {
  return (
    <div className="stepper" style={{ width }}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="减少"
      >
        −
      </button>
      <input
        className="stepper-input"
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

/* ---- Segmented control (inline) ---- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; icon?: string }[];
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`seg-btn ${value === o.v ? "active" : ""}`}
          onClick={() => onChange(o.v)}
        >
          {o.icon ? <span style={{ marginRight: 4 }}>{o.icon}</span> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Setting row (label + control, in a card) ---- */

export function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <div className="setting-row-label">{label}</div>
        {description ? (
          <div className="setting-row-desc">{description}</div>
        ) : null}
      </div>
      <div className="setting-row-control">{control}</div>
    </div>
  );
}

/* ---- Setting card (groups related rows) ---- */

export function SettingCard({
  title,
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="setting-card">
      {title ? <div className="setting-card-title">{title}</div> : null}
      <div className="setting-card-body">{children}</div>
      {footer ? <div className="setting-card-footer">{footer}</div> : null}
    </section>
  );
}

/* ---- Shortcut recorder (live key capture) ---- */

export function ShortcutInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!recording) return;
    ref.current?.focus();
  }, [recording]);

  return (
    <input
      ref={ref}
      className={`input shortcut-input ${recording ? "recording" : ""}`}
      value={recording ? "按组合键…" : value}
      readOnly
      placeholder="点击录制"
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        e.preventDefault();
        if (e.key === "Escape") {
          setRecording(false);
          ref.current?.blur();
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          onChange("");
          setRecording(false);
          ref.current?.blur();
          return;
        }
        const parts: string[] = [];
        if (e.ctrlKey) parts.push("CmdOrCtrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        const k = e.key;
        if (!["Control", "Alt", "Shift", "Meta"].includes(k)) {
          parts.push(k.length === 1 ? k.toUpperCase() : k);
          onChange(parts.join("+"));
          setRecording(false);
          ref.current?.blur();
        }
      }}
      onClick={(e) => e.currentTarget.select()}
    />
  );
}
