export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBanner({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-banner">
      <span>{error}</span>
      {onRetry ? (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
