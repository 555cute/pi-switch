interface Point {
  label: string;
  /** Primary series (e.g. tokens) */
  value: number;
  /** Secondary series (e.g. cost) */
  secondary?: number;
}

interface Props {
  points: Point[];
  /** Show second series as line (e.g. cost) on right axis */
  secondary?: boolean;
  height?: number;
  emptyText?: string;
}

/**
 * Dual-axis line+area chart.
 * - left axis: tokens (area + line, gradient)
 * - right axis (optional): cost (line)
 *
 * Pure SVG, no deps. Adapts to width via viewBox + 100% width.
 */
export function LineChart({
  points,
  secondary = true,
  height = 260,
  emptyText = "暂无数据",
}: Props) {
  if (points.length === 0) {
    return (
      <div className="empty-inline" style={{ height }}>
        {emptyText}
      </div>
    );
  }

  const W = 1200;
  const H = 280;
  const padL = 64;
  const padR = 64;
  const padT = 24;
  const padB = 56;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = points.map((p) => p.value);
  const secondaryValues = points.map((p) => p.secondary ?? 0);
  const maxV = Math.max(1, ...values);
  const maxS = Math.max(1, ...secondaryValues);

  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const xAt = (i: number) => padL + i * stepX;
  const yV = (v: number) => padT + innerH - (v / maxV) * innerH;
  const yS = (v: number) => padT + innerH - (v / maxS) * innerH;

  const lineV = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yV(p.value).toFixed(2)}`)
    .join(" ");
  const areaV =
    `M${xAt(0).toFixed(2)},${(padT + innerH).toFixed(2)} ` +
    points
      .map((p, i) => `L${xAt(i).toFixed(2)},${yV(p.value).toFixed(2)}`)
      .join(" ") +
    ` L${xAt(points.length - 1).toFixed(2)},${(padT + innerH).toFixed(2)} Z`;

  const lineS = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yS(p.secondary ?? 0).toFixed(2)}`,
    )
    .join(" ");

  // axis ticks
  const niceMax = niceCeil(maxV);
  const niceMaxS = niceCeil(maxS);

  const leftTicks = 4;
  const rightTicks = 4;
  const yTicksL = Array.from({ length: leftTicks + 1 }, (_, i) => niceMax * (i / leftTicks));
  const yTicksR = Array.from(
    { length: rightTicks + 1 },
    (_, i) => niceMaxS * (i / rightTicks),
  );

  // x labels — pick ~7 max
  const labelStride = Math.max(1, Math.ceil(points.length / 7));
  const xLabels = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % labelStride === 0 || i === points.length - 1);

  return (
    <div className="line-chart-wrap" style={{ height }}>
      <svg
        className="line-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="使用趋势"
      >
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y grid */}
        {yTicksL.map((t, i) => {
          const y = padT + innerH - (t / niceMax) * innerH;
          return (
            <g key={`gl${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="rgba(0,0,0,0.05)"
                strokeDasharray="2 4"
              />
              <text
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted-2)"
              >
                {formatTokens(t)}
              </text>
            </g>
          );
        })}

        {/* right axis labels (cost) */}
        {secondary
          ? yTicksR.map((t, i) => {
              const y = padT + innerH - (t / niceMaxS) * innerH;
              return (
                <text
                  key={`gr${i}`}
                  x={W - padR + 10}
                  y={y + 4}
                  textAnchor="start"
                  fontSize="11"
                  fill="var(--muted-2)"
                >
                  ${t.toFixed(t < 1 ? 2 : 0)}
                </text>
              );
            })
          : null}

        {/* x axis labels */}
        {xLabels.map(({ p, i }) => (
          <text
            key={`xl${i}`}
            x={xAt(i)}
            y={H - padB + 22}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted-2)"
          >
            {p.label}
          </text>
        ))}

        {/* area + line: primary */}
        <path d={areaV} fill="url(#lc-area)" />
        <path
          d={lineV}
          fill="none"
          stroke="#7c5cff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* secondary line: cost */}
        {secondary ? (
          <path
            d={lineS}
            fill="none"
            stroke="#34c759"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* primary points */}
        {points.map((p, i) =>
          p.value > 0 ? (
            <circle
              key={`pv${i}`}
              cx={xAt(i)}
              cy={yV(p.value)}
              r="3"
              fill="#fff"
              stroke="#7c5cff"
              strokeWidth="1.6"
            />
          ) : null,
        )}

        {/* secondary points */}
        {secondary
          ? points.map((p, i) =>
              (p.secondary ?? 0) > 0 ? (
                <circle
                  key={`ps${i}`}
                  cx={xAt(i)}
                  cy={yS(p.secondary ?? 0)}
                  r="2.5"
                  fill="#34c759"
                />
              ) : null,
            )
          : null}
      </svg>

      <div className="line-chart-legend">
        <span className="legend-dot" style={{ background: "#7c5cff" }} />
        <span>Tokens</span>
        {secondary ? (
          <>
            <span
              className="legend-dot"
              style={{ background: "#34c759" }}
            />
            <span>费用 ($)</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const r = n / pow;
  let nice: number;
  if (r <= 1) nice = 1;
  else if (r <= 2) nice = 2;
  else if (r <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "k";
  return String(Math.round(v));
}
