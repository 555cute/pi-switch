interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: "cyan" | "violet" | "amber" | "emerald" | "rose";
}

/** Kept for secondary pages; Dashboard uses custom cards matching mockup. */
export function StatCard({ label, value, hint }: Props) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}
