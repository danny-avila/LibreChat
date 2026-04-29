/* eslint-disable i18next/no-literal-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Label } from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

type FarmerLocationForm = {
  location?: {
    latitude: number;
    longitude: number;
  };
};

const FarmerLocationModal = ({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const { user } = useAuthContext();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isValid },
  } = useForm<FarmerLocationForm>({ mode: 'onChange' });

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const onSubmit = (data: FarmerLocationForm) => {
    const profilePayload: IFarmerProfile = {
      location:
        data.location?.latitude && data.location?.longitude
          ? {
              latitude: Number(data.location.latitude),
              longitude: Number(data.location.longitude),
            }
          : undefined,
    };
    saveMutation.mutate(profilePayload);
  };

  const fieldClass = 'mb-4';

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent showCloseButton={true} className="flex w-11/12 max-w-md flex-col sm:w-full">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Register Home Location
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col">
          <input type="hidden" {...register('location.latitude', { required: true })} />
          <input type="hidden" {...register('location.longitude', { required: true })} />

          <p className="mb-4 text-sm text-text-secondary">
            We noticed you haven't shared your location with us yet. Please capture it below.
          </p>

          <div className="mb-4 rounded-md border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/10">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-400 dark:text-blue-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Important</h3>
                <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                  <p>
                    Please ensure you are currently located at your home before capturing your
                    location to ensure accurate profile registration.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={fieldClass}>
            <Label>Current Location</Label>
            <div className="mt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsLocating(true);
                  setLocationError('');
                  if (!navigator.geolocation) {
                    setLocationError('Geolocation is not supported by your browser');
                    setIsLocating(false);
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setValue('location.latitude', position.coords.latitude, {
                        shouldValidate: true,
                      });
                      setValue('location.longitude', position.coords.longitude, {
                        shouldValidate: true,
                      });
                      setIsLocating(false);
                    },
                    (error) => {
                      setLocationError('Unable to retrieve your location');
                      setIsLocating(false);
                    },
                  );
                }}
                disabled={isLocating}
                className="inline-flex w-fit items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLocating ? 'Locating...' : 'Get Location'}
              </button>
              {watch('location.latitude') && watch('location.longitude') && (
                <span className="text-sm font-medium text-green-600 dark:text-green-500">
                  ✓ Location Captured Succesfully
                </span>
              )}
              {locationError && <span className="text-sm text-red-500">{locationError}</span>}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-border-heavy pt-4">
            <button
              type="submit"
              disabled={!isValid || saveMutation.isLoading}
              className="hover:bg-surface-active-hover inline-flex items-center justify-center rounded-lg bg-surface-active px-6 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isLoading ? 'Saving...' : 'Save Location'}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerLocationModal;
