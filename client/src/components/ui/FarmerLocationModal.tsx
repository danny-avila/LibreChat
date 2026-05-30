/* eslint-disable @typescript-eslint/no-unused-vars */
import { useForm, Controller } from 'react-hook-form';
import { useState, useEffect, useMemo } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
  Input,
} from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import useGeolocation from '~/hooks/useGeolocation';
import { useLocalize } from '~/hooks';
import { STATES, DISTRICTS, INDIAN_LANGUAGES, CROPS, KVKS } from '~/utils/metaData';
import SearchableSelect from './SearchableSelect';
import SearchableMultiSelect from './SearchableMultiSelect';

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
  initialData,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
  missingFields?: string[];
  initialData?: Partial<IFarmerProfile>;
}) => {
  const localize = useLocalize();
  const [submitError, setSubmitError] = useState('');
  const effectiveMissingFields = useMemo(
    () => missingFields.filter((field) => field !== 'cropsCultivated'),
    [missingFields],
  );

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    control,
    unregister,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<FarmerLocationForm>({
    mode: 'onChange',
    shouldUnregister: true,
    defaultValues: initialData,
  });

  useEffect(() => {
    const allFields: (keyof FarmerLocationForm)[] = [
      'farmerName',
      'age',
      'gender',
      'villageName',
      'blockName',
      'district',
      'state',
      'phoneNo',
      'languagePreference',
      'yearsOfExperience',
      'highestEducatedPerson',
      'numberOfSmartphones',
      'primaryCrop',
      'secondaryCrop',
      'landhold',
      'awarenessOfKCC',
      'usesAgriApps',
      'customDistrict',
      'nearestKVK',
    ];

    const fieldsToUnregister = allFields.filter((f) => !effectiveMissingFields.includes(f as string));

    fieldsToUnregister.forEach((f) => {
      unregister(f);
      clearErrors(f);
    });
  }, [effectiveMissingFields, unregister, clearErrors]);

  const watchedState = watch('state') || initialData?.state;
  const selectedState = watchedState;
  const watchedDistrict = watch('district') || initialData?.district;
  const selectedDistrict = watchedDistrict;
  const selectedCropsRaw = watch('cropsCultivated');
  const selectedCropsList = selectedCropsRaw
    ? String(selectedCropsRaw)
      .split(',')
      .map((crop) => crop.trim())
      .filter(Boolean)
    : [];

  const updateCropsCultivated = (selected: string[]) => {
    setValue('cropsCultivated', selected.join(', '), { shouldValidate: true });

    const primaryCrop = getValues('primaryCrop');
    const secondaryCrop = getValues('secondaryCrop');

    if (primaryCrop && !selected.includes(primaryCrop)) {
      setValue('primaryCrop', '', { shouldValidate: true });
    }
    if (secondaryCrop && !selected.includes(secondaryCrop)) {
      setValue('secondaryCrop', '', { shouldValidate: true });
    }
  };

  const removeSelectedCrop = (cropToRemove: string) => {
    updateCropsCultivated(selectedCropsList.filter((crop) => crop !== cropToRemove));
  };

  const matchedStateKey = selectedState
    ? Object.keys(DISTRICTS).find((k) => k.toLowerCase() === selectedState.toLowerCase())
    : undefined;

  const districtOptions = matchedStateKey
    ? [...(DISTRICTS[matchedStateKey] ?? []), localize('com_farmer_option_other')]
    : [localize('com_farmer_option_other')];

  const kvkOptions = useMemo(() => {
    if (!selectedDistrict) {
      return [];
    }

    // 1. Direct match
    if (KVKS[selectedDistrict]) {
      return KVKS[selectedDistrict];
    }

    // 2. Case-insensitive and normalized match
    const normalizedSearch = selectedDistrict.toLowerCase().replace(/\s*\(.*\)/, '').trim();
    const kvkKeys = Object.keys(KVKS);

    // Try finding a key that contains the normalized district name or vice-versa
    const matchedKey = kvkKeys.find((key) => {
      const normalizedKey = key.toLowerCase().replace(/\s*\(.*\)/, '').trim();
      return (
        normalizedKey === normalizedSearch ||
        normalizedKey.includes(normalizedSearch) ||
        normalizedSearch.includes(normalizedKey)
      );
    });

    if (matchedKey) {
      return KVKS[matchedKey];
    }

    return (KVKS as any).Other || [];
  }, [selectedDistrict]);

  const handleStateChange = (val: string) => {
    setValue('state', val, { shouldValidate: true });
    setValue('district', '', { shouldValidate: false });
    setValue('customDistrict', '', { shouldValidate: false });
    setValue('nearestKVK' as any, '', { shouldValidate: false });
  };

  const handleDistrictChange = (val: string) => {
    setValue('district', val, { shouldValidate: true });
    if (val !== localize('com_farmer_option_other')) {
      setValue('customDistrict', '', { shouldValidate: false });
    }
    setValue('nearestKVK' as any, '', { shouldValidate: false });
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
      setSubmitError(localize('com_farmer_error_save_profile'));
    },
  });

  const onFormError = (formErrors: any) => {
    console.error('Form validation failed:', formErrors);
  };

  const onSubmit = (data: FarmerLocationForm) => {
    const profilePayload: IFarmerProfile = {};

    effectiveMissingFields.forEach((field) => {
      if (field === 'location' && data.location?.latitude && data.location?.longitude) {
        profilePayload.location = {
          latitude: Number(data.location.latitude),
          longitude: Number(data.location.longitude),
        };
      } else if (['landhold', 'age', 'yearsOfExperience', 'numberOfSmartphones'].includes(field)) {
        if (data[field as keyof FarmerLocationForm]) {
          profilePayload[field as keyof IFarmerProfile] = Number(
            data[field as keyof FarmerLocationForm],
          ) as any;
        }
      } else if (['awarenessOfKCC', 'usesAgriApps'].includes(field)) {
        if (data[field as keyof FarmerLocationForm]) {
          profilePayload[field as keyof IFarmerProfile] = (data[
            field as keyof FarmerLocationForm
          ] === 'yes') as any;
        }
      } else if (field === 'district') {
        profilePayload.district =
          data.district === localize('com_farmer_option_other')
            ? data.customDistrict
            : data.district;
      } else {
        if (data[field as keyof FarmerLocationForm]) {
          profilePayload[field as keyof IFarmerProfile] = data[
            field as keyof FarmerLocationForm
          ] as any;
        }
      }
    });

    saveMutation.mutate(profilePayload);
  };

  const fieldClass = 'mb-4';
  const inputClass =
    'mt-1 block w-full rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500';
  const integerRegex = /^\d+$/;
  const decimalRegex = /^\d+(\.\d+)?$/;

  const isLocationMissing = effectiveMissingFields.includes('location');
  const otherMissingFields = effectiveMissingFields.filter((f) => f !== 'location');
  const shouldShowCloseButton = isLocationMissing && otherMissingFields.length === 0;
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !shouldShowCloseButton) {
      return;
    }
    onOpenChange(isOpen);
  };

  const fieldConfig: Record<
    string,
    {
      label: string;
      type: string;
      placeholder?: string;
      options?: string[];
      selectPlaceholder?: string;
    }
  > = {
    farmerName: {
      label: localize('com_farmer_label_farmer_name'),
      type: 'text',
      placeholder: localize('com_farmer_placeholder_full_name'),
    },
    age: {
      label: localize('com_farmer_label_age'),
      type: 'number',
      placeholder: localize('com_farmer_placeholder_age'),
    },
    gender: {
      label: localize('com_farmer_label_gender'),
      type: 'searchable-select',
      options: [
        localize('com_farmer_option_male'),
        localize('com_farmer_option_female'),
        localize('com_farmer_option_other'),
      ],
      selectPlaceholder: localize('com_farmer_placeholder_select_gender'),
    },
    state: {
      label: localize('com_farmer_label_state'),
      type: 'searchable-select',
      options: STATES,
      selectPlaceholder: localize('com_farmer_placeholder_select_state'),
    },
    district: {
      label: localize('com_farmer_label_district'),
      type: 'searchable-select',
      options: districtOptions,
      selectPlaceholder: selectedState
        ? localize('com_farmer_placeholder_select_district')
        : localize('com_farmer_placeholder_select_state_first'),
    },
    villageName: {
      label: localize('com_farmer_label_village_name'),
      type: 'text',
      placeholder: localize('com_farmer_placeholder_village_example'),
    },
    blockName: {
      label: localize('com_farmer_label_block_name'),
      type: 'text',
      placeholder: localize('com_farmer_placeholder_block_example'),
    },
    phoneNo: {
      label: localize('com_farmer_label_phone_number'),
      type: 'text',
      placeholder: localize('com_farmer_placeholder_phone_number'),
    },
    languagePreference: {
      label: localize('com_nav_language'),
      type: 'searchable-select',
      options: INDIAN_LANGUAGES,
      selectPlaceholder: localize('com_ui_select'),
    },
    yearsOfExperience: {
      label: localize('com_farmer_label_years_experience_short'),
      type: 'number',
      placeholder: localize('com_farmer_placeholder_years'),
    },
    highestEducatedPerson: {
      label: localize('com_farmer_label_highest_educated'),
      type: 'searchable-select',
      options: [
        localize('com_farmer_option_under_graduate'),
        localize('com_farmer_option_graduate'),
        localize('com_farmer_option_post_graduate'),
      ],
      selectPlaceholder: localize('com_farmer_placeholder_select_education_level'),
    },
    numberOfSmartphones: {
      label: localize('com_farmer_label_smartphone_count_short'),
      type: 'number',
      placeholder: localize('com_farmer_placeholder_smartphone_count'),
    },
    primaryCrop: {
      label: localize('com_farmer_label_primary_crop'),
      type: 'searchable-multi-select',
      options: CROPS,
      selectPlaceholder: localize('com_ui_select_options'),
    },
    secondaryCrop: {
      label: localize('com_farmer_label_secondary_crop'),
      type: 'searchable-multi-select',
      options: CROPS,
      selectPlaceholder: localize('com_ui_select_options'),
    },
    landhold: {
      label: localize('com_farmer_label_landholding'),
      type: 'text',
      placeholder: localize('com_farmer_placeholder_landholding'),
    },
    awarenessOfKCC: { label: localize('com_farmer_label_awareness_kcc'), type: 'radio' },
    usesAgriApps: { label: localize('com_farmer_label_usage_agri_apps'), type: 'radio' },
    nearestKVK: {
      label: localize('com_farmer_label_nearest_kvk'),
      type: 'searchable-select',
      options: kvkOptions,
      disabled: !selectedDistrict,
      selectPlaceholder: !selectedDistrict
        ? localize('com_farmer_placeholder_select_district_first')
        : localize('com_farmer_placeholder_select_nearest_kvk'),
    },
  };

  const getValidationRules = (field: string, label: string) => {
    if (field === 'phoneNo') {
      return {
        required: localize('com_farmer_validation_required_generic', { 0: label }),
        pattern: {
          value: /^\d{10}$/,
          message: localize('com_farmer_validation_phone_exact_10'),
        },
      };
    }

    if (field === 'age') {
      return {
        required: localize('com_farmer_validation_required_generic', { 0: label }),
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return localize('com_farmer_validation_age_integer');
          }
          const numeric = Number(normalized);
          if (numeric < 16 || numeric > 100) {
            return localize('com_farmer_validation_age_range');
          }
          return true;
        },
      };
    }

    if (field === 'yearsOfExperience') {
      return {
        required: localize('com_farmer_validation_required_generic', { 0: label }),
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return localize('com_farmer_validation_experience_integer');
          }
          const numeric = Number(normalized);
          if (numeric < 0 || numeric > 70) {
            return localize('com_farmer_validation_experience_range');
          }
          return true;
        },
      };
    }

    if (field === 'numberOfSmartphones') {
      return {
        required: localize('com_farmer_validation_required_generic', { 0: label }),
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          if (!integerRegex.test(normalized)) {
            return localize('com_farmer_validation_smartphones_integer');
          }
          const numeric = Number(normalized);
          if (numeric < 0 || numeric > 20) {
            return localize('com_farmer_validation_smartphones_range');
          }
          return true;
        },
      };
    }

    if (field === 'landhold') {
      return {
        required: localize('com_farmer_validation_required_generic', { 0: label }),
        validate: (value: string) => {
          const normalized = String(value ?? '').trim();
          return (
            decimalRegex.test(normalized) || localize('com_farmer_validation_landholding_valid')
          );
        },
      };
    }

    return { required: localize('com_farmer_validation_required_generic', { 0: label }) };
  };

  const getFieldLabel = (field: string) => {
    if (field === 'location') {
      return localize('com_farmer_label_current_location');
    }
    return fieldConfig[field]?.label ?? field;
  };

  const missingOrInvalidFields = effectiveMissingFields.flatMap((field) => {
    if (field === 'location') {
      const hasLocation =
        !!watch('location.latitude' as any) && !!watch('location.longitude' as any);
      return hasLocation ? [] : [getFieldLabel(field)];
    }

    if (
      field === 'district' &&
      String(watch('district' as any) ?? '') === localize('com_farmer_option_other')
    ) {
      const districtMissing = !watch('district' as any);
      const customDistrictMissing = !String(watch('customDistrict' as any) ?? '').trim();
      const districtInvalid = !!errors.district || !!errors.customDistrict;
      return districtMissing || customDistrictMissing || districtInvalid
        ? [getFieldLabel('district'), localize('com_farmer_label_custom_district')]
        : [];
    }

    const value = watch(field as any);
    const isMissing =
      typeof value === 'string'
        ? value.trim() === ''
        : value === undefined || value === null || value === '';
    const isInvalid = !!errors[field as keyof FarmerLocationForm];
    return isMissing || isInvalid ? [getFieldLabel(field)] : [];
  });

  const uniqueMissingOrInvalidFields = [...new Set(missingOrInvalidFields)];

  const isFormValid = () => {
    return uniqueMissingOrInvalidFields.length === 0;
  };

  const shouldShowDialog =
  open && ((otherMissingFields?.length ?? 0) > 0 || isLocationMissing)

  return (
    <OGDialog open={shouldShowDialog} onOpenChange={handleOpenChange}>
      <OGDialogContent
        showCloseButton={shouldShowCloseButton}
        onInteractOutside={(e) => {
          if (!shouldShowCloseButton) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (!shouldShowCloseButton) {
            e.preventDefault();
          }
        }}
        className="flex max-h-[90vh] w-11/12 max-w-md flex-col overflow-y-auto sm:w-full"
      >
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            {localize('com_farmer_complete_profile_title')}
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="mt-4 flex flex-col">
          <p className="mb-4 text-sm text-text-secondary">
            {localize('com_farmer_complete_profile_helper')}
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
                    rules={{
                      required: localize('com_farmer_validation_required_generic', {
                        0: config.label,
                      }),
                    }}
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
                        placeholder={
                          config.selectPlaceholder ?? `${localize('com_ui_select')} ${config.label}`
                        }
                        disabled={field === 'district' && !selectedState}
                      />
                    )}
                  />
                  {errors[field as keyof FarmerLocationForm] && (
                    <p className="mt-1 text-xs text-red-500">
                      {(errors[field as keyof FarmerLocationForm] as any)?.message}
                    </p>
                  )}
                  {/* Custom District Input */}
                  {field === 'district' &&
                    selectedDistrict === localize('com_farmer_option_other') && (
                      <div className="mt-4">
                        <Label htmlFor="customDistrict">
                          {localize('com_farmer_label_custom_district')}
                        </Label>
                        <Input
                          id="customDistrict"
                          placeholder={localize('com_farmer_placeholder_custom_district')}
                          className={inputClass}
                          {...register('customDistrict', {
                            required: localize('com_farmer_validation_custom_district_required'),
                          })}
                        />
                        {errors.customDistrict && (
                          <p className="mt-1 text-xs text-red-500">
                            {errors.customDistrict.message}
                          </p>
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
                      <label
                        key={val}
                        className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                      >
                        <input
                          type="radio"
                          value={val}
                          className="accent-green-600"
                          {...register(field as any, {
                            required: localize('com_farmer_validation_field_required'),
                          })}
                        />
                        {val === 'yes' ? localize('com_ui_yes') : localize('com_ui_no')}
                      </label>
                    ))}
                  </div>
                  {errors[field as keyof FarmerLocationForm] && (
                    <p className="mt-1 text-xs text-red-500">
                      {(errors[field as keyof FarmerLocationForm] as any)?.message}
                    </p>
                  )}
                </div>
              );
            }

            if (config.type === 'searchable-multi-select') {
              return (
                <div key={field} className={fieldClass}>
                  <Label>{config.label}</Label>
                  <Controller
                    name={field as any}
                    control={control}
                    rules={{
                      required: localize('com_farmer_validation_required_generic', {
                        0: config.label,
                      }),
                    }}
                    render={({ field: controllerField }) => {
                      const selectedValues = String(controllerField.value ?? '')
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean);

                      return (
                        <>
                          <SearchableMultiSelect
                            options={config.options || []}
                            value={selectedValues}
                            onChange={(selected) => controllerField.onChange(selected.join(', '))}
                            placeholder={
                              config.selectPlaceholder ?? localize('com_ui_select_options')
                            }
                          />
                          {selectedValues.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedValues.map((crop) => (
                                <span
                                  key={crop}
                                  className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                >
                                  {crop}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      controllerField.onChange(
                                        selectedValues.filter((value) => value !== crop).join(', '),
                                      )
                                    }
                                    className="rounded-full p-0.5 text-green-800 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-800/40"
                                    aria-label={`Remove ${crop}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    }}
                  />
                  {errors[field as keyof FarmerLocationForm] && (
                    <p className="mt-1 text-xs text-red-500">
                      {(errors[field as keyof FarmerLocationForm] as any)?.message}
                    </p>
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
                  inputMode={
                    field === 'phoneNo' ? 'numeric' : field === 'landhold' ? 'decimal' : undefined
                  }
                  maxLength={field === 'phoneNo' ? 10 : undefined}
                  min={
                    field === 'age'
                      ? 16
                      : field === 'yearsOfExperience'
                        ? 0
                        : field === 'numberOfSmartphones'
                          ? 0
                          : undefined
                  }
                  max={
                    field === 'age'
                      ? 100
                      : field === 'yearsOfExperience'
                        ? 70
                        : field === 'numberOfSmartphones'
                          ? 20
                          : undefined
                  }
                  step={
                    field === 'age' ||
                    field === 'yearsOfExperience' ||
                    field === 'numberOfSmartphones'
                      ? 1
                      : undefined
                  }
                  placeholder={config.placeholder}
                  className={inputClass}
                  {...register(field as any, getValidationRules(field, config.label))}
                />
                {errors[field as keyof FarmerLocationForm] && (
                  <p className="mt-1 text-xs text-red-500">
                    {(errors[field as keyof FarmerLocationForm] as any)?.message}
                  </p>
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
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      {localize('com_farmer_label_important')}
                    </h3>
                    <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                      <p>{localize('com_farmer_helper_location_capture')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_current_location')}</Label>
                <div className="mt-2 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={getLocation}
                    disabled={isLocating}
                    className="inline-flex w-fit items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLocating
                      ? localize('com_farmer_button_locating')
                      : localize('com_farmer_button_get_location')}
                  </button>
                  {watch('location.latitude') && watch('location.longitude') && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-500">
                      {localize('com_farmer_location_captured_success')}
                    </span>
                  )}
                  {locationError && <span className="text-sm text-red-500">{locationError}</span>}
                </div>
              </div>
            </>
          )}

          {submitError && <div className="mt-2 text-sm text-red-500">{submitError}</div>}

          <div className="mt-4 flex justify-end gap-2 border-t border-border-heavy pt-4">
            <button
              type="submit"
              disabled={saveMutation.isLoading || !isFormValid()}
              className="hover:bg-surface-active-hover inline-flex items-center justify-center rounded-lg bg-surface-active px-6 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isLoading ? `${localize('com_ui_save')}...` : localize('com_ui_save')}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerLocationModal;
