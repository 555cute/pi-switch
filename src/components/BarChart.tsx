interface BarItem {
  label: string;
  value: number;
  secondary?: string;
}

export function BarChart({
  items,
  maxBars = 14,
  emptyText = "No data yet",
}: {
  items: BarItem[];
  maxBars?: number;
  emptyText?: string;
}) {
  const slice = items.slice(-maxBars);
  const max = Math.max(...slice.map((i) => i.value), 1);

  if (slice.length === 0) {
    return <div className="empty-inline">{emptyText}</div>;
  }

  return (
    <div className="bar-chart">
      {slice.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label" title={item.label}>
            {item.label}
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
          <div className="bar-value">
            {item.secondary ?? item.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
