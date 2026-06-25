import { memo, useMemo, useState } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { Button, Input, Spinner, useToastContext } from '@librechat/client';
import type { ExtractedMemory } from 'librechat-data-provider';
import { useGetStartupConfig, useCreateMemoryMutation } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';

const DEFAULT_MEMORY_KEYS = [
  'preferences',
  'work_info',
  'personal_info',
  'skills',
  'interests',
  'context',
  'brand_context',
];

/**
 * "Save to memory?" banner rendered after the latest assistant message when the
 * model emits a hidden `<memory>` block (parsed via `extractMemory`). The value
 * and category are prefilled from the model but editable; Save creates a memory
 * entry. Renders nothing if the user lacks MEMORIES create access.
 */
const SaveMemoryBanner = memo(function SaveMemoryBanner({ memory }: { memory: ExtractedMemory }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const validKeys = useMemo(() => {
    const keys = startupConfig?.memory?.validKeys;
    if (keys && keys.length > 0) {
      return keys;
    }
    return DEFAULT_MEMORY_KEYS;
  }, [startupConfig?.memory?.validKeys]);

  const [key, setKey] = useState(() =>
    validKeys.includes(memory.key) ? memory.key : validKeys[0],
  );
  const [value, setValue] = useState(memory.value);
  const [dismissed, setDismissed] = useState(false);

  const { mutate: createMemory, isLoading } = useCreateMemoryMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_saved_to_memory'), status: 'success' });
      setDismissed(true);
    },
    onError: () => {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    },
  });

  if (!hasCreateAccess || dismissed) {
    return null;
  }

  const handleSave = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }
    createMemory({ key, value: trimmedValue });
  };

  return (
    <div
      role="group"
      aria-label={localize('com_ui_save_to_memory_prompt')}
      className="mt-3 flex flex-col gap-2 rounded-xl border border-border-medium bg-surface-secondary p-3"
    >
      <p className="text-sm font-medium text-text-primary">
        {localize('com_ui_save_to_memory_prompt')}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={localize('com_ui_value')}
          className="flex-1"
        />
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label={localize('com_ui_category')}
          className="rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
        >
          {validKeys.map((validKey) => (
            <option key={validKey} value={validKey}>
              {validKey}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDismissed(true)}
          aria-label={localize('com_ui_dismiss')}
        >
          {localize('com_ui_dismiss')}
        </Button>
        <Button
          type="button"
          variant="submit"
          onClick={handleSave}
          disabled={isLoading || !value.trim()}
          className="text-white"
          aria-label={localize('com_ui_save')}
        >
          {isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
});

export default SaveMemoryBanner;
