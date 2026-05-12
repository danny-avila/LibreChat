/* eslint-disable i18next/no-literal-string */
import JurisdictionPicker from '~/components/CodeCan/JurisdictionPicker';

export default function Location() {
  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="text-base font-semibold">Building code location</div>
        <div className="mt-1 text-xs text-text-secondary">
          New conversations will be answered from the building code for the location you choose
          here. Existing conversations stay on the code they started with.
        </div>
      </div>
      <JurisdictionPicker hideHeader />
    </div>
  );
}
