import { useEffect, useState } from "react";

type Toast = { id: number; type: "ok" | "err" | "info"; text: string };

let counter = 0;
const listeners = new Set<(t: Toast) => void>();
let queue: Toast[] = [];

let prefs = {
  toastNotifications: true,
  errorToasts: true,
};

export function setToastPrefs(next: {
  toastNotifications?: boolean;
  errorToasts?: boolean;
}) {
  prefs = { ...prefs, ...next };
}

export function toast(text: string, type: "ok" | "err" | "info" = "ok") {
  if (type === "err" && !prefs.errorToasts) return;
  if (type !== "err" && !prefs.toastNotifications) return;
  const t: Toast = { id: ++counter, type, text };
  queue.push(t);
  for (const l of listeners) l(t);
  setTimeout(() => {
    queue = queue.filter((x) => x.id !== t.id);
  }, 3000);
}

export function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((q) => [...q, t]);
      setTimeout(() => setItems((q) => q.filter((x) => x.id !== t.id)), 2800);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <div className="toast-stack">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === "ok" ? "✓ " : t.type === "err" ? "⚠ " : "ⓘ "}
          {t.text}
        </div>
      ))}
    </div>
  );
}
