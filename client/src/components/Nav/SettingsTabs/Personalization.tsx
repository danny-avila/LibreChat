import { useState, useEffect, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { Switch, useToastContext } from '@librechat/client';
import { useGetUserQuery, useUpdateMemoryPreferencesMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface PersonalizationProps {
  hasMemoryOptOut: boolean;
  hasAnyPersonalizationFeature: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function Personalization({
  hasMemoryOptOut,
  hasAnyPersonalizationFeature,
  onOpenChange,
}: PersonalizationProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const setHideSidePanel = useSetRecoilState(store.hideSidePanel);
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_preferences_updated'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      // Revert the toggle on error
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  // Initialize state from user data
  useEffect(() => {
    if (user?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(user.personalization.memories);
    }
  }, [user?.personalization?.memories]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const handleOpenMemorySidebar = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      
      // Close the settings dialog
      onOpenChange?.(false);
      
      // Show the side panel
      setHideSidePanel(false);
      localStorage.setItem('hideSidePanel', 'false');
      localStorage.setItem('fullPanelCollapse', 'false');
      localStorage.setItem('side:active-panel', 'memories');
      
      // Dispatch custom event to activate memories panel
      setTimeout(() => {
        const event = new CustomEvent('sidepanel:activate', {
          detail: { panelId: 'memories' },
        });
        window.dispatchEvent(event);
      }, 100);
    },
    [setHideSidePanel, onOpenChange],
  );

  if (!hasAnyPersonalizationFeature) {
    return (
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="text-text-secondary">{localize('com_ui_no_personalization_available')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      {/* Memory Settings Section */}
      {hasMemoryOptOut && (
        <>
          <div className="border-b border-border-medium pb-3">
            <div className="text-base font-semibold">{localize('com_ui_memory')}</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div id="reference-saved-memories-label" className="flex items-center gap-2">
                {localize('com_ui_reference_saved_memories')}
              </div>
              <div
                id="reference-saved-memories-description"
                className="mt-1 text-xs text-text-secondary"
              >
                {localize('com_ui_memory_sidebar_description_part1')}{' '}
                <button
                  type="button"
                  onClick={handleOpenMemorySidebar}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleOpenMemorySidebar(e);
                    }
                  }}
                  className="inline text-text-link underline hover:text-text-link-hover focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-border-heavy"
                  aria-label={localize('com_ui_open_memory_sidebar')}
                >
                  {localize('com_ui_memories').toLowerCase()}
                </button>
                {' '}{localize('com_ui_memory_sidebar_description_part2')}
              </div>
            </div>
            <Switch
              checked={referenceSavedMemories}
              onCheckedChange={handleMemoryToggle}
              disabled={updateMemoryPreferencesMutation.isLoading}
              aria-labelledby="reference-saved-memories-label"
              aria-describedby="reference-saved-memories-description"
            />
          </div>
        </>
      )}
    </div>
  );
}
