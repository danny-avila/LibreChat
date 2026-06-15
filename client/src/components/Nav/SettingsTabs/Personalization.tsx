import { useState, useEffect } from 'react';
import { Switch, Input, useToastContext } from '@librechat/client';
import type { TUserLocation } from 'librechat-data-provider';
import {
  useGetUserQuery,
  useGetStartupConfig,
  useUpdateUserLocationMutation,
  useUpdateMemoryPreferencesMutation,
} from '~/data-provider';
import { reverseGeocode, getCurrentPosition } from '~/utils/geocode';
import { useLocalize } from '~/hooks';

interface PersonalizationProps {
  hasMemoryOptOut: boolean;
  hasLocationSharing: boolean;
  hasAnyPersonalizationFeature: boolean;
}

export default function Personalization({
  hasMemoryOptOut,
  hasLocationSharing,
  hasAnyPersonalizationFeature,
}: PersonalizationProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [detecting, setDetecting] = useState(false);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  const updateLocationMutation = useUpdateUserLocationMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
    },
  });

  useEffect(() => {
    if (user?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(user.personalization.memories);
    }
  }, [user?.personalization?.memories]);

  useEffect(() => {
    const loc = user?.personalization?.location;
    if (loc) {
      setLocationEnabled(loc.enabled ?? false);
      setManualLocation(loc.manual ?? '');
    }
  }, [user?.personalization?.location]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const persistLocation = (payload: TUserLocation) => updateLocationMutation.mutate(payload);

  const handleLocationToggle = (checked: boolean) => {
    setLocationEnabled(checked);
    persistLocation({ enabled: checked, source: 'manual', manual: manualLocation || undefined });
  };

  const handleManualBlur = () => {
    if (!locationEnabled && !manualLocation) {
      return;
    }
    persistLocation({
      enabled: locationEnabled,
      source: 'manual',
      manual: manualLocation || undefined,
    });
  };

  const handleUseDeviceLocation = async () => {
    setDetecting(true);
    try {
      const position = await getCurrentPosition();
      const resolved = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude,
        startupConfig?.location?.geocoder?.endpoint,
      );
      setLocationEnabled(true);
      persistLocation({
        enabled: true,
        source: 'auto',
        place: resolved.place,
        coordinates: resolved.coordinates,
        timezone: resolved.timezone,
      });
    } catch (error) {
      const denied =
        typeof GeolocationPositionError !== 'undefined' &&
        error instanceof GeolocationPositionError &&
        error.code === error.PERMISSION_DENIED;
      showToast({
        message: localize(
          denied ? 'com_ui_location_permission_denied' : 'com_ui_location_unavailable',
        ),
        status: 'warning',
      });
    } finally {
      setDetecting(false);
    }
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

      {hasLocationSharing && (
        <>
          <div className="border-b border-border-medium pb-3 pt-2">
            <div className="text-base font-semibold">{localize('com_ui_location')}</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div id="share-location-label" className="flex items-center gap-2">
                {localize('com_ui_share_location_with_agents')}
              </div>
              <div id="share-location-description" className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_share_location_with_agents_description')}
              </div>
            </div>
            <Switch
              checked={locationEnabled}
              onCheckedChange={handleLocationToggle}
              disabled={updateLocationMutation.isLoading}
              aria-labelledby="share-location-label"
              aria-describedby="share-location-description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="manual-location-input" className="text-xs text-text-secondary">
              {localize('com_ui_set_location_manually')}
            </label>
            <Input
              id="manual-location-input"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              onBlur={handleManualBlur}
              aria-label={localize('com_ui_set_location_manually')}
              className="flex h-10 w-full px-3 py-2"
            />
            <button
              type="button"
              onClick={handleUseDeviceLocation}
              disabled={detecting}
              className="self-start rounded-md border border-border-medium px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover disabled:opacity-50"
            >
              {detecting
                ? localize('com_ui_location_detecting')
                : localize('com_ui_use_device_location')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
