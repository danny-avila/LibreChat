/* eslint-disable i18next/no-literal-string */
import JurisdictionPicker from '~/components/CodeCan/JurisdictionPicker';

export default function Location() {
  return (
    <div className="flex flex-col gap-4 text-sm text-text-primary">
      <div className="relative overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-5 pl-6">
        <span
          aria-hidden="true"
          className="absolute left-0 top-5 h-10 w-[3px] rounded-r-sm bg-[var(--signal-amber)]"
        />
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--slate-500)]">
          Jurisdiction
        </div>
        <div className="mt-1 text-base font-semibold tracking-tight text-text-primary">
          Building code location
        </div>
        <div className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
          New conversations will be answered from the building code for the location you choose
          here. Existing conversations stay on the code they started with.
        </div>
      </div>
      <JurisdictionPicker hideHeader />
    </div>
  );
}
