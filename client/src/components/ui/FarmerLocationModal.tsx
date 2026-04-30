/* eslint-disable i18next/no-literal-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Label, Input } from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

type FarmerLocationForm = {
  location?: {
    latitude: number;
    longitude: number;
  };
  landhold?: string;
};

const FarmerLocationModal = ({
  open,
  onOpenChange,
  onComplete,
  isLocationMissing = false,
  isLandholdMissing = false,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
  isLocationMissing?: boolean;
  isLandholdMissing?: boolean;
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const { user } = useAuthContext();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    unregister,
    formState: { errors },
  } = useForm<FarmerLocationForm>({ 
    mode: 'onChange',
    shouldUnregister: true 
  });

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      onComplete();
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      setLocationError('Failed to save profile. Please try again.');
    }
  });

  useEffect(() => {
    if (!isLocationMissing) {
      unregister('location.latitude');
      unregister('location.longitude');
    }
    if (!isLandholdMissing) {
      unregister('landhold');
    }
  }, [isLocationMissing, isLandholdMissing, unregister]);

  const onFormError = (formErrors: any) => {
    console.error('Form validation failed:', formErrors);
  };

  const onSubmit = (data: FarmerLocationForm) => {
    const profilePayload: IFarmerProfile = {};
    
    if (isLocationMissing && data.location?.latitude && data.location?.longitude) {
      profilePayload.location = {
        latitude: Number(data.location.latitude),
        longitude: Number(data.location.longitude),
      };
    }
    
    if (isLandholdMissing && data.landhold) {
      profilePayload.landhold = Number(data.landhold);
    }
    
    saveMutation.mutate(profilePayload);
  };

  const fieldClass = 'mb-4';
  const inputClass = 'mt-1 block w-full rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent showCloseButton={true} className="flex w-11/12 max-w-md flex-col sm:w-full">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Complete Your Profile
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="mt-4 flex flex-col">
          <p className="mb-4 text-sm text-text-secondary">
            We noticed you haven't shared some details with us yet. Please provide them below.
          </p>

          {isLocationMissing && (
            <>
              <input type="hidden" {...register('location.latitude')} />
              <input type="hidden" {...register('location.longitude')} />
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
            </>
          )}

          {isLandholdMissing && (
            <div className={fieldClass}>
              <Label htmlFor="landhold">Total Agricultural Landholding (Specify your total farm size in Acres)</Label>
              <Input
                id="landhold"
                placeholder="e.g. 5"
                className={inputClass}
                {...register('landhold', { required: 'Landholding is required' })}
              />
            </div>
          )}

          {Object.keys(errors).length > 0 && (
            <div className="mt-2 text-sm text-red-500">
              Please fix the errors before submitting.
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-border-heavy pt-4">
            <button
              type="submit"
              disabled={
                saveMutation.isLoading ||
                (isLocationMissing && (!watch('location.latitude') || !watch('location.longitude'))) ||
                (isLandholdMissing && !watch('landhold'))
              }
              className="hover:bg-surface-active-hover inline-flex items-center justify-center rounded-lg bg-surface-active px-6 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isLoading ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerLocationModal;
