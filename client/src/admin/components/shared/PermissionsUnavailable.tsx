import { useLocalize } from '~/admin/hooks';

export function PermissionsUnavailable() {
  const localize = useLocalize();
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-xl font-semibold text-(--cui-color-title-default)">
        {localize('com_admin_perm_unavailable_title')}
      </h2>
      <p className="max-w-md text-center text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_perm_unavailable_desc')}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 cursor-pointer rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-4 py-2 text-sm font-medium text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover)"
      >
        {localize('com_admin_ui_reload')}
      </button>
    </div>
  );
}
