import { useState, useEffect } from 'react';
import { Input, Button, Switch, useToastContext } from '@librechat/client';
import {
  useGetUserQuery,
  useUpdateMemoryPreferencesMutation,
  useUpdatePersonalizationMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

interface PersonalizationProps {
  hasMemoryOptOut: boolean;
  hasAnyPersonalizationFeature: boolean;
}

const MAX_DISPLAY_NAME_LENGTH = 100;

export default function Personalization({
  hasMemoryOptOut,
  hasAnyPersonalizationFeature,
}: PersonalizationProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [savedDisplayName, setSavedDisplayName] = useState('');

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
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  const updatePersonalizationMutation = useUpdatePersonalizationMutation({
    onSuccess: (data) => {
      const nextDisplayName = data.personalization.displayName ?? '';
      setSavedDisplayName(nextDisplayName);
      setDisplayName(nextDisplayName);
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
    },
  });

  useEffect(() => {
    if (user?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(user.personalization.memories);
    }
  }, [user?.personalization?.memories]);

  useEffect(() => {
    const nextDisplayName = user?.personalization?.displayName ?? '';
    setSavedDisplayName(nextDisplayName);
    setDisplayName(nextDisplayName);
  }, [user?.personalization?.displayName]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const trimmedDisplayName = displayName.trim();
  const isDisplayNameTooLong = trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH;
  const isDisplayNameChanged = trimmedDisplayName !== savedDisplayName;

  const handleSaveDisplayName = () => {
    if (isDisplayNameTooLong || !isDisplayNameChanged) {
      return;
    }
    updatePersonalizationMutation.mutate({
      displayName: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
    });
  };

  if (!hasAnyPersonalizationFeature) {
    return (
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="text-text-secondary">{localize('com_ui_no_personalization_available')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="text-base font-semibold">{localize('com_ui_how_to_address')}</div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="personalization-display-name" className="text-sm">
          {localize('com_ui_how_to_address_label')}
        </label>
        <div className="text-xs text-text-secondary">
          {localize('com_ui_how_to_address_description')}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="personalization-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder={localize('com_ui_how_to_address_placeholder')}
            className="h-10"
          />
          <Button
            onClick={handleSaveDisplayName}
            disabled={
              updatePersonalizationMutation.isLoading ||
              isDisplayNameTooLong ||
              !isDisplayNameChanged
            }
          >
            {localize('com_ui_save')}
          </Button>
        </div>
        {isDisplayNameTooLong && (
          <div className="text-xs text-red-500">{localize('com_ui_how_to_address_max_length')}</div>
        )}
      </div>
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
                {localize('com_ui_reference_saved_memories_description')}
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
