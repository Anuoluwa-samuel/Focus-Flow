type Bar = { label: string; value: number; valueLabel: string };

/**
 * Dependency-free bar chart. Values are printed as text and repeated in a screen-reader table,
 * so nothing relies on bar height or colour alone.
 */
export function ColumnChart({ title, bars, labelEvery = 1 }: { title: string; bars: Bar[]; labelEvery?: number }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <figure className="rounded-card border border-border bg-raised p-5 shadow-card">
      <figcaption className="mb-4 text-sm font-semibold">{title}</figcaption>
      <div aria-hidden="true" className="flex h-40 items-end gap-1">
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${b.label}: ${b.valueLabel}`}
          >
            <div
              className={b.value > 0 ? "rounded-t bg-accent" : "border-b border-border"}
              style={{ height: `${Math.max((b.value / max) * 100, b.value > 0 ? 3 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-1 text-[11px] text-muted">
        {bars.map((b, i) => (
          <span key={b.label} className="min-w-0 flex-1 overflow-hidden text-center">
            {i % labelEvery === 0 || i === bars.length - 1 ? b.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Focus time</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>{b.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function RowChart({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; value: number; valueLabel: string }[];
  empty?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <section aria-label={title} className="rounded-card border border-border bg-raised p-5 shadow-card">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty ?? "No data yet."}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-1">
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{r.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted">{r.valueLabel}</span>
              </div>
              <div aria-hidden="true" className="h-2 rounded-full bg-border">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-border bg-raised p-4 shadow-card">
      <dt className="text-xs font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">
        <span className="block text-2xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      </dd>
    </div>
  );
}
