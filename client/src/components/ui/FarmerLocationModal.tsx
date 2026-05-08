/* eslint-disable i18next/no-literal-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useForm, Controller } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Label, Input } from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import useGeolocation from '~/hooks/useGeolocation';
import { STATES, DISTRICTS, INDIAN_LANGUAGES } from '~/utils/metaData';
import SearchableSelect from './SearchableSelect';

type FarmerLocationForm = Partial<IFarmerProfile> & { 
  landhold?: string; 
  age?: string; 
  yearsOfExperience?: string; 
  numberOfSmartphones?: string;
  customDistrict?: string;
};

const FarmerLocationModal = ({
  open,
  onOpenChange,
  onComplete,
  missingFields = [],
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
  missingFields?: string[];
}) => {
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    unregister,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<FarmerLocationForm>({ 
    mode: 'onChange',
    shouldUnregister: true 
  });

  useEffect(() => {
    const allFields: (keyof FarmerLocationForm)[] = [
      'farmerName', 'age', 'gender', 'villageName', 'blockName', 'district', 'state', 'phoneNo', 
      'languagePreference', 'yearsOfExperience', 'highestEducatedPerson', 'numberOfSmartphones', 
      'primaryCrop', 'secondaryCrop', 'cropsCultivated', 'landhold', 'awarenessOfKCC', 'usesAgriApps', 'customDistrict'
    ];
    
    const fieldsToUnregister = allFields.filter(f => !missingFields.includes(f as string));
    
    fieldsToUnregister.forEach(f => {
       unregister(f);
       clearErrors(f);
    });
  }, [missingFields, unregister, clearErrors]);

  const watchedState = watch('state');
  const selectedState = watchedState;
  const selectedDistrict = watch('district');

  const matchedStateKey = selectedState 
    ? Object.keys(DISTRICTS).find(k => k.toLowerCase() === selectedState.toLowerCase())
    : undefined;

  const districtOptions = matchedStateKey
    ? [...(DISTRICTS[matchedStateKey] ?? []), 'Other']
    : ['Other'];

  const handleStateChange = (val: string) => {
    setValue('state', val, { shouldValidate: true });
    setValue('district', '', { shouldValidate: false });
    setValue('customDistrict', '', { shouldValidate: false });
  };

  const handleDistrictChange = (val: string) => {
    setValue('district', val, { shouldValidate: true });
    if (val !== 'Other') {
      setValue('customDistrict', '', { shouldValidate: false });
    }
  };

  const { isLocating, locationError, getLocation } = useGeolocation({
    onSuccess: (latitude, longitude) => {
      setValue('location.latitude', latitude, { shouldValidate: true });
      setValue('location.longitude', longitude, { shouldValidate: true });
    },
  });

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      setSubmitError('');
      onComplete();
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      setSubmitError('Failed to save profile. Please try again.');
    }
  });

  const onFormError = (formErrors: any) => {
    console.error('Form validation failed:', formErrors);
  };

  const onSubmit = (data: FarmerLocationForm) => {
    const profilePayload: IFarmerProfile = {};
    
    missingFields.forEach((field) => {
      if (field === 'location' && data.location?.latitude && data.location?.longitude) {
        profilePayload.location = {
          latitude: Number(data.location.latitude),
          longitude: Number(data.location.longitude),
        };
      } else if (['landhold', 'age', 'yearsOfExperience', 'numberOfSmartphones'].includes(field)) {
        if (data[field as keyof FarmerLocationForm]) {
           profilePayload[field as keyof IFarmerProfile] = Number(data[field as keyof FarmerLocationForm]) as any;
        }
      } else if (['awarenessOfKCC', 'usesAgriApps'].includes(field)) {
         if (data[field as keyof FarmerLocationForm]) {
             profilePayload[field as keyof IFarmerProfile] = (data[field as keyof FarmerLocationForm] === 'yes') as any;
         }
      } else if (field === 'district') {
         profilePayload.district = data.district === 'Other' ? data.customDistrict : data.district;
      } else if (field === 'cropsCultivated' && data.cropsCultivated) {
         profilePayload.cropsCultivated = (data.cropsCultivated as any).split(',').map((c: string) => c.trim()).filter(Boolean);
      } else {
        if (data[field as keyof FarmerLocationForm]) {
          profilePayload[field as keyof IFarmerProfile] = data[field as keyof FarmerLocationForm] as any;
        }
      }
    });
    
    saveMutation.mutate(profilePayload);
  };

  const fieldClass = 'mb-4';
  const inputClass = 'mt-1 block w-full rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500';
  const integerRegex = /^\d+$/;
  const decimalRegex = /^\d+(\.\d+)?$/;

  const isLocationMissing = missingFields.includes('location');
  const otherMissingFields = missingFields.filter(f => f !== 'location');

  const fieldConfig: Record<string, { label: string, type: string, placeholder?: string, options?: string[] }> = {
    farmerName: { label: 'Farmer Name', type: 'text', placeholder: 'e.g. John Doe' },
    age: { label: 'Age', type: 'number', placeholder: 'e.g. 45' },
    gender: { label: 'Gender', type: 'searchable-select', options: ['Male', 'Female', 'Other'] },
    state: { label: 'State', type: 'searchable-select', options: STATES },
    district: { label: 'District', type: 'searchable-select', options: districtOptions },
    villageName: { label: 'Village Name', type: 'text', placeholder: 'e.g. Kothrud' },
    blockName: { label: 'Block Name', type: 'text', placeholder: 'e.g. Haveli' },
    phoneNo: { label: 'Phone Number', type: 'text', placeholder: 'e.g. 9876543210' },
    languagePreference: { label: 'Language Preference', type: 'searchable-select', options: INDIAN_LANGUAGES },
    yearsOfExperience: { label: 'Years of Farming Experience', type: 'number', placeholder: 'e.g. 20' },
    highestEducatedPerson: { label: 'Highest Educated Person in Family', type: 'searchable-select', options: ['Under Graduate', 'Graduate', 'Post Graduate'] },
    numberOfSmartphones: { label: 'Number of Smartphones in Family', type: 'number', placeholder: 'e.g. 2' },
    primaryCrop: { label: 'Primary Crop', type: 'text', placeholder: 'e.g. Wheat' },
    secondaryCrop: { label: 'Secondary Crop', type: 'text', placeholder: 'e.g. Rice' },
    cropsCultivated: { label: 'Crops Cultivated (comma separated)', type: 'text', placeholder: 'e.g. Wheat, Rice' },
    landhold: { label: 'Total Agricultural Landholding (Acres)', type: 'number', placeholder: 'e.g. 5' },
    awarenessOfKCC: { label: 'Awareness of Kisan Call Centre (KCC)', type: 'radio' },
    usesAgriApps: { label: 'Usage of Any Agricultural Mobile Applications', type: 'radio' },
  };

  const getValidationRules = (field: string, label: string) => {
    if (field === 'phoneNo') {
      return {
        required: `${label} is required`,
        pattern: {
          value: /^\d{10}$/,
          message: 'Phone number must be exactly 10 digits',
        },
      };
    }

    if (field === 'age') {
      return {
        required: `${label} is required`,
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return 'Age must be an integer';
          }
          const numeric = Number(normalized);
          if (numeric < 16 || numeric > 100) {
            return 'Age must be between 16 and 100';
          }
          return true;
        },
      };
    }

    if (field === 'yearsOfExperience') {
      return {
        required: `${label} is required`,
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return 'Years of experience must be an integer';
          }
          const numeric = Number(normalized);
          if (numeric < 0 || numeric > 70) {
            return 'Years of experience must be between 0 and 70';
          }
          return true;
        },
      };
    }

    if (field === 'numberOfSmartphones') {
      return {
        required: `${label} is required`,
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return 'Number of smartphones must be an integer';
          }
          const numeric = Number(normalized);
          if (numeric < 1 || numeric > 20) {
            return 'Number of smartphones must be between 1 and 20';
          }
          return true;
        },
      };
    }

    if (field === 'landhold') {
      return {
        required: `${label} is required`,
        validate: (value: string) =>
          decimalRegex.test(String(value ?? '').trim()) ||
          'Landholding must be a valid number (decimals allowed)',
      };
    }

    return { required: `${label} is required` };
  };

  const isFormValid = () => {
    return missingFields.every(field => {
       if (field === 'location') {
          return !!watch('location.latitude') && !!watch('location.longitude');
       }
       if (field === 'district' && watch('district') === 'Other') {
          return !!watch('customDistrict');
       }
       return !!watch(field as any);
    });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent showCloseButton={true} className="flex w-11/12 max-w-md flex-col sm:w-full overflow-y-auto max-h-[90vh]">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Complete Your Profile
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="mt-4 flex flex-col">
          <p className="mb-4 text-sm text-text-secondary">
            We noticed you haven't shared some details with us yet. Please provide them below.
          </p>

          {otherMissingFields.map((field) => {
            const config = fieldConfig[field];
            if (!config) return null;
            
            if (config.type === 'searchable-select') {
              return (
                <div key={field} className={fieldClass}>
                  <Label>{config.label}</Label>
                  <Controller
                    name={field as any}
                    control={control}
                    rules={{ required: `${config.label} is required` }}
                    render={({ field: controllerField }) => (
                      <SearchableSelect
                        options={field === 'district' ? districtOptions : config.options || []}
                        value={controllerField.value ?? ''}
                        onChange={
                          field === 'state' 
                            ? handleStateChange 
                            : field === 'district'
                            ? handleDistrictChange
                            : controllerField.onChange
                        }
                        placeholder={`Select ${config.label}`}
                        disabled={field === 'district' && !selectedState}
                      />
                    )}
                  />
                  {errors[field as keyof FarmerLocationForm] && (
                    <p className="mt-1 text-xs text-red-500">{(errors[field as keyof FarmerLocationForm] as any)?.message}</p>
                  )}
                  {/* Custom District Input */}
                  {field === 'district' && selectedDistrict === 'Other' && (
                    <div className="mt-4">
                      <Label htmlFor="customDistrict">Enter Your District</Label>
                      <Input
                        id="customDistrict"
                        placeholder="Type your district name"
                        className={inputClass}
                        {...register('customDistrict', {
                          required: 'Please enter your district name',
                        })}
                      />
                      {errors.customDistrict && (
                        <p className="mt-1 text-xs text-red-500">{errors.customDistrict.message}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (config.type === 'radio') {
              return (
                <div key={field} className={fieldClass}>
                  <Label>{config.label}</Label>
                  <div className="mt-2 flex gap-6">
                    {['yes', 'no'].map((val) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                        <input
                          type="radio"
                          value={val}
                          className="accent-green-600"
                          {...register(field as any, { required: 'This field is required' })}
                        />
                        {val.charAt(0).toUpperCase() + val.slice(1)}
                      </label>
                    ))}
                  </div>
                  {errors[field as keyof FarmerLocationForm] && (
                    <p className="mt-1 text-xs text-red-500">{(errors[field as keyof FarmerLocationForm] as any)?.message}</p>
                  )}
                </div>
              );
            }
            
            return (
              <div key={field} className={fieldClass}>
                <Label htmlFor={field}>{config.label}</Label>
                <Input
                  id={field}
                  type={field === 'phoneNo' ? 'tel' : config.type}
                  inputMode={field === 'phoneNo' ? 'numeric' : undefined}
                  maxLength={field === 'phoneNo' ? 10 : undefined}
                  min={field === 'age' ? 16 : field === 'yearsOfExperience' ? 0 : field === 'numberOfSmartphones' ? 1 : undefined}
                  max={field === 'age' ? 100 : field === 'yearsOfExperience' ? 70 : field === 'numberOfSmartphones' ? 20 : undefined}
                  step={field === 'landhold' ? 'any' : field === 'age' || field === 'yearsOfExperience' || field === 'numberOfSmartphones' ? 1 : undefined}
                  placeholder={config.placeholder}
                  className={inputClass}
                  {...register(field as any, getValidationRules(field, config.label))}
                />
                {errors[field as keyof FarmerLocationForm] && (
                  <p className="mt-1 text-xs text-red-500">{(errors[field as keyof FarmerLocationForm] as any)?.message}</p>
                )}
              </div>
            );
          })}

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
                onClick={getLocation}
                disabled={isLocating}
                className="inline-flex w-fit items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLocating ? 'Locating...' : 'Get Location'}
              </button>
              {watch('location.latitude') && watch('location.longitude') && (
                <span className="text-sm font-medium text-green-600 dark:text-green-500">
                  ✓ Location Captured Successfully
                </span>
              )}
              {locationError && <span className="text-sm text-red-500">{locationError}</span>}
            </div>
          </div>
            </>
          )}

          {Object.keys(errors).length > 0 && (
            <div className="mt-2 text-sm text-red-500">
              Please fix the errors before submitting.
            </div>
          )}
          {submitError && (
            <div className="mt-2 text-sm text-red-500">{submitError}</div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-border-heavy pt-4">
            <button
              type="submit"
              disabled={saveMutation.isLoading || !isFormValid()}
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
