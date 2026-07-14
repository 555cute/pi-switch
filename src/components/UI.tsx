export function Skeleton({
  width,
  height = 12,
  radius = 4,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
}) {
  return (
    <div
      className="skeleton"
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radius,
      }}
    />
  );
}

export function EmptyState({
  icon = "∅",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-desc">{description}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <span className="tooltip-wrap">
      {children}
      <span className="tooltip-bubble">{text}</span>
    </span>
  );
}

export function Tag({
  children,
  tone = "default",
  style,
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "info";
  style?: React.CSSProperties;
}) {
  return <span className={`tag tag-${tone}`} style={style}>{children}</span>;
}
