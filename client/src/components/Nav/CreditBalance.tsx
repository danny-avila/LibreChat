const CURRENT = 12450;
const TOTAL = 50000;

export default function CreditBalance() {
  const percent = Math.round((CURRENT / TOTAL) * 100);

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border-light px-3 py-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text-secondary">{'Credits'}</span>
        <span className="font-medium text-text-primary">
          {CURRENT.toLocaleString()} / {TOTAL.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className="h-full rounded-full bg-text-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
