import { useRecoilState } from 'recoil';
import { Briefcase, X } from 'lucide-react';
import store from '~/store';

export default function BklMatterChips() {
  const [matters, setMatters] = useRecoilState(store.referenceBklMatters);
  if (!matters || matters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pb-1 pt-2">
      {matters.map((m) => (
        <div
          key={m.matter_uid}
          className="group relative inline-flex max-w-48 items-center gap-2 rounded-2xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary"
          title={`참조 사건 · matter_uid=${m.matter_uid}`}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-secondary">
            <Briefcase className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{m.label || m.matter_uid}</div>
            {m.sub && <div className="truncate text-[11px] text-text-tertiary">{m.sub}</div>}
          </div>
          <button
            type="button"
            onClick={() =>
              setMatters((prev) => prev.filter((item) => item.matter_uid !== m.matter_uid))
            }
            aria-label={`${m.label || m.matter_uid} 참조 제거`}
            className="absolute right-1 top-1 rounded-full bg-surface-secondary p-0.5 opacity-80 transition hover:bg-surface-primary hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
