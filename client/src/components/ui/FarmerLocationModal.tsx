import { useForm } from 'react-hook-form';
import { useState } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
} from '@librechat/client';
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
    onSuccess: () => { onComplete(); },
  });

  const onSubmit = (data: FarmerLocationForm) => {
    const profilePayload: IFarmerProfile = {
      ...(user?.farmerProfile ?? {}), // Retain existing info securely
      location: data.location?.latitude && data.location?.longitude 
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
      <OGDialogContent
        showCloseButton={true}
        className="w-11/12 max-w-md sm:w-full flex flex-col"
      >
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Update Missing Information
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col mt-4">
          <input type="hidden" {...register('location.latitude', { required: true })} />
          <input type="hidden" {...register('location.longitude', { required: true })} />
          
          <p className="text-sm text-text-secondary mb-4">
            We noticed you haven't shared your location with us yet. Please capture it below.
          </p>

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
                      setValue('location.latitude', position.coords.latitude, { shouldValidate: true });
                      setValue('location.longitude', position.coords.longitude, { shouldValidate: true });
                      setIsLocating(false);
                    },
                    (error) => {
                      setLocationError('Unable to retrieve your location');
                      setIsLocating(false);
                    }
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
              {locationError && (
                <span className="text-sm text-red-500">{locationError}</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-border-heavy pt-4">
            <button
              type="submit"
              disabled={!isValid || saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-surface-active px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-active-hover disabled:cursor-not-allowed disabled:opacity-50"
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
