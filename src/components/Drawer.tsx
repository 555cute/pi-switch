export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-card"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="drawer-header">
            <h3>{title}</h3>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
