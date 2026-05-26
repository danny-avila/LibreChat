import { useCallback, useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import { useForm, Controller } from 'react-hook-form';
import useGeolocation from '~/hooks/useGeolocation';
import { SearchableSelect, SearchableMultiSelect } from '~/components/ui';
import { LangSelector } from '~/components/Nav/SettingsTabs/General/General';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Input,
  Label,
} from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { STATES, DISTRICTS, BLOCKS, VILLAGES, CROPS, KVKS } from '~/utils/metaData';

// ── Form Types ───────────────────────────────────────────────────────────────

type FarmerProfileForm = {
  farmerName: string;
  age: number;
  gender: string;
  state: string;
  district: string;
  customDistrict: string;
  blockName: string;
  customBlock: string;
  villageName: string;
  customVillage: string;
  nearestKVK: string;
  phoneNo: string;
  languagePreference: string;
  yearsOfExperience: number;
  primaryCrop: string;
  secondaryCrop: string;
  awarenessOfKCC: string;
  usesAgriApps: string;
  highestEducatedPerson: string;
  numberOfSmartphones: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  landhold: string;
};

// ── Component ────────────────────────────────────────────────────────────────

const FarmerProfileModal = ({
  open,
  onOpenChange,
  onComplete,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
  onDecline: () => void;
}) => {
  const localize = useLocalize();
  const [langcode, setLangcode] = useRecoilState(store.lang);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FarmerProfileForm>({ mode: 'onChange' });

  const { isLocating, locationError, getLocation } = useGeolocation({
    onSuccess: (latitude, longitude) => {
      setValue('location.latitude', latitude, { shouldValidate: true });
      setValue('location.longitude', longitude, { shouldValidate: true });
    },
  });

  const selectedState = watch('state');
  const selectedDistrict = watch('district');
  const selectedBlock = watch('blockName');
  const selectedVillage = watch('villageName');
  const selectedPrimaryCrop = watch('primaryCrop');
  const selectedSecondaryCrop = watch('secondaryCrop');
  const selectedLanguagePreference = watch('languagePreference');
  const otherOption = localize('com_farmer_option_other');

  const changeLang = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });
      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
      return userLang;
    },
    [setLangcode],
  );

  useEffect(() => {
    if (!selectedLanguagePreference) {
      setValue('languagePreference', langcode, { shouldValidate: true });
    }
  }, [langcode, selectedLanguagePreference, setValue]);

  const handleStateChange = (val: string) => {
    setValue('state', val, { shouldValidate: true });
    setValue('district', '', { shouldValidate: false });
    setValue('customDistrict', '', { shouldValidate: false });
    setValue('blockName', '', { shouldValidate: false });
    setValue('villageName', '', { shouldValidate: false });
    setValue('nearestKVK', '', { shouldValidate: false });
  };

  const handleDistrictChange = (val: string) => {
    setValue('district', val, { shouldValidate: true });
    if (val !== otherOption) {
      setValue('customDistrict', '', { shouldValidate: false });
    }
    setValue('blockName', '', { shouldValidate: false });
    setValue('villageName', '', { shouldValidate: false });
    setValue('nearestKVK', '', { shouldValidate: false });
  };

  const handleBlockChange = (val: string) => {
    setValue('blockName', val, { shouldValidate: true });
    setValue('villageName', '', { shouldValidate: false });
  };

  const districtOptions = selectedState
    ? [...(DISTRICTS[selectedState] ?? []), otherOption]
    : [otherOption];

  const blockOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? [...(BLOCKS[selectedDistrict] ?? []), otherOption]
      : [otherOption];

  const villageOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? [...(VILLAGES[selectedDistrict] ?? []), otherOption]
      : [otherOption];

  const kvkOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? Array.isArray(KVKS[selectedDistrict])
        ? KVKS[selectedDistrict]
        : Array.isArray((KVKS as any).Other)
          ? (KVKS as any).Other
          : []
      : [];

  const selectedPrimaryCropList = selectedPrimaryCrop
    ? selectedPrimaryCrop
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean)
    : [];
  const selectedSecondaryCropList = selectedSecondaryCrop
    ? selectedSecondaryCrop
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean)
    : [];

  const removePrimaryCrop = (cropToRemove: string) => {
    const updated = selectedPrimaryCropList.filter((crop) => crop !== cropToRemove);
    setValue('primaryCrop', updated.join(', '), { shouldValidate: true });
  };

  const removeSecondaryCrop = (cropToRemove: string) => {
    const updated = selectedSecondaryCropList.filter((crop) => crop !== cropToRemove);
    setValue('secondaryCrop', updated.join(', '), { shouldValidate: true });
  };

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const detectDevice = (): string => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os x/i.test(ua)) return 'MacOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  };

  const onSubmit = (data: FarmerProfileForm) => {
    const resolvedDistrict = data.district === otherOption ? data.customDistrict : data.district;
    const resolvedBlock = data.blockName === otherOption ? data.customBlock : data.blockName;
    const resolvedVillage = data.villageName === otherOption ? data.customVillage : data.villageName;
    const primaryCrops = (data.primaryCrop ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const secondaryCrops = (data.secondaryCrop ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const profile: IFarmerProfile = {
      ...data,
      district: resolvedDistrict,
      blockName: resolvedBlock,
      villageName: resolvedVillage,
      age: Number(data.age),
      yearsOfExperience: Number(data.yearsOfExperience),
      numberOfSmartphones: Number(data.numberOfSmartphones),
      cropsCultivated: Array.from(new Set([...primaryCrops, ...secondaryCrops])),
      awarenessOfKCC: data.awarenessOfKCC === 'yes',
      usesAgriApps: data.usesAgriApps === 'yes',
      landhold: data.landhold ? Number(data.landhold) : undefined,
      platform: detectDevice(),
      location:
        data.location?.latitude && data.location?.longitude
          ? {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          }
          : undefined,
    };
    saveMutation.mutate(profile);
  };

  const inputClass =
    'mt-1 block w-full rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500';
  const errorClass = 'mt-1 text-xs text-red-500';
  const sectionClass = 'mb-6';
  const sectionTitleClass =
    'mb-3 text-base font-semibold text-text-primary border-b border-border-heavy pb-1';
  const fieldClass = 'mb-4';
  const decimalRegex = /^\d+(\.\d+)?$/;
  const genderOptions = [
    localize('com_farmer_option_male'),
    localize('com_farmer_option_female'),
    localize('com_farmer_option_other'),
  ];
  const educationOptions = [
    localize('com_farmer_option_under_graduate'),
    localize('com_farmer_option_graduate'),
    localize('com_farmer_option_post_graduate'),
  ];
  const yesLabel = localize('com_ui_yes');
  const noLabel = localize('com_ui_no');
  const yesNoOptions = [
    { label: yesLabel, value: 'yes' },
    { label: noLabel, value: 'no' },
  ];

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[90vh] w-11/12 max-w-2xl flex-col overflow-y-hidden sm:w-3/4 md:w-2/3 lg:w-1/2"
      >
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            {localize('com_farmer_profile_registration')}
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" {...register('location.latitude')} />
          <input type="hidden" {...register('location.longitude')} />

          {/* ── Notice — pinned above the scrollable area ── */}
          <p className="shrink-0 px-1 pb-3 text-sm font-medium text-red-500">
            {localize('com_farmer_profile_fill_all_required')}
          </p>

          <div className="flex-1 overflow-y-auto px-1 py-2">
            <div className={fieldClass}>
              <Controller
                name="languagePreference"
                control={control}
                rules={{ required: localize('com_farmer_validation_language_required') }}
                render={({ field }) => (
                  <LangSelector
                    langcode={(field.value as string) ?? langcode}
                    onChange={(value) => {
                      const resolvedLang = changeLang(value);
                      field.onChange(resolvedLang);
                    }}
                    portal={false}
                  />
                )}
              />
              {errors.languagePreference && (
                <p className={errorClass}>{errors.languagePreference.message}</p>
              )}
            </div>
            {/* ── Section 1: Demographic Details ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_demographic_details')}</h3>

              <div className={fieldClass}>
                <Label htmlFor="farmerName">{localize('com_farmer_label_farmer_name')}</Label>
                <Input
                  id="farmerName"
                  placeholder={localize('com_farmer_placeholder_full_name')}
                  className={inputClass}
                  {...register('farmerName', {
                    required: localize('com_farmer_validation_farmer_name_required'),
                  })}
                />
                {errors.farmerName && <p className={errorClass}>{errors.farmerName.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="age">{localize('com_farmer_label_age')}</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder={localize('com_farmer_placeholder_age')}
                    defaultValue={16}
                    min={16}
                    max={100}
                    step={1}
                    className={inputClass}
                    {...register('age', {
                      required: localize('com_farmer_validation_age_required'),
                      valueAsNumber: true,
                      validate: {
                        isInteger: (value) =>
                          Number.isInteger(value) ||
                          localize('com_farmer_validation_age_integer'),
                        inRange: (value) =>
                          (value >= 16 && value <= 100) ||
                          localize('com_farmer_validation_age_range'),
                      },
                    })}
                  />
                  {errors.age && <p className={errorClass}>{errors.age.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label>{localize('com_farmer_label_gender')}</Label>
                  <Controller
                    name="gender"
                    control={control}
                    rules={{ required: localize('com_farmer_validation_gender_required') }}
                    render={({ field }) => (
                      <SearchableSelect
                        options={genderOptions}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={localize('com_farmer_placeholder_select_gender')}
                      />
                    )}
                  />
                  {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
                </div>
              </div>

              {/* ── Location ── */}
              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_current_location')}</Label>
                <div className="mb-3 mt-2 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
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
                    <div className="ml-3 text-sm text-blue-700 dark:text-blue-400">
                      <p>
                        {localize('com_farmer_helper_location_capture')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={getLocation}
                    disabled={isLocating}
                    className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
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

              {/* ── State → District → Block → Village ── */}
              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_state')}</Label>
                <Controller
                  name="state"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_state_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={STATES}
                      value={field.value ?? ''}
                      onChange={handleStateChange}
                      placeholder={localize('com_farmer_placeholder_select_state')}
                    />
                  )}
                />
                {errors.state && <p className={errorClass}>{errors.state.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_district')}</Label>
                <Controller
                  name="district"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_district_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={districtOptions}
                      value={field.value ?? ''}
                      onChange={handleDistrictChange}
                      placeholder={
                        selectedState
                          ? localize('com_farmer_placeholder_select_district')
                          : localize('com_farmer_placeholder_select_state_first')
                      }
                      disabled={!selectedState}
                    />
                  )}
                />
                {errors.district && <p className={errorClass}>{errors.district.message}</p>}
              </div>

              {/* Custom district input – shown only when "Other" is selected */}
              {selectedDistrict === otherOption && (
                <div className={fieldClass}>
                  <Label htmlFor="customDistrict">{localize('com_farmer_label_custom_district')}</Label>
                  <Input
                    id="customDistrict"
                    placeholder={localize('com_farmer_placeholder_custom_district')}
                    className={inputClass}
                    {...register('customDistrict', {
                      required: localize('com_farmer_validation_custom_district_required'),
                    })}
                  />
                  {errors.customDistrict && (
                    <p className={errorClass}>{errors.customDistrict.message}</p>
                  )}
                </div>
              )}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_block_name')}</Label>
                <Controller
                  name="blockName"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_block_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={blockOptions}
                      value={field.value ?? ''}
                      onChange={handleBlockChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_block')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />
                {errors.blockName && <p className={errorClass}>{errors.blockName.message}</p>}
              </div>

              {selectedBlock === otherOption && (
                <div className={fieldClass}>
                  <Label htmlFor="customBlock">{localize('com_farmer_label_custom_block')}</Label>
                  <Input
                    id="customBlock"
                    placeholder={localize('com_farmer_placeholder_custom_block')}
                    className={inputClass}
                    {...register('customBlock', {
                      required: localize('com_farmer_validation_custom_block_required'),
                    })}
                  />
                  {errors.customBlock && <p className={errorClass}>{errors.customBlock.message}</p>}
                </div>
              )}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_village_name')}</Label>
                <Controller
                  name="villageName"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_village_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={villageOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_village')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />
                {errors.villageName && <p className={errorClass}>{errors.villageName.message}</p>}
              </div>

              {selectedBlock === otherOption || selectedVillage === otherOption ? (
                <div className={fieldClass}>
                  <Label htmlFor="customVillage">{localize('com_farmer_label_custom_village')}</Label>
                  <Input
                    id="customVillage"
                    placeholder={localize('com_farmer_placeholder_custom_village')}
                    className={inputClass}
                    {...register('customVillage', {
                      required: localize('com_farmer_validation_custom_village_required'),
                    })}
                  />
                  {errors.customVillage && (
                    <p className={errorClass}>{errors.customVillage.message}</p>
                  )}
                </div>
              ) : null}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_nearest_kvk')}</Label>

                <Controller
                  name="nearestKVK"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_nearest_kvk_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={kvkOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_nearest_kvk')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />

                {errors.nearestKVK && (
                  <p className={errorClass}>
                    {errors.nearestKVK.message}
                  </p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="phoneNo">{localize('com_farmer_label_phone_number')}</Label>
                <Input
                  id="phoneNo"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={localize('com_farmer_placeholder_phone_number')}
                  className={inputClass}
                  {...register('phoneNo', {
                    required: localize('com_farmer_validation_phone_required'),
                    pattern: {
                      value: /^\d{10}$/,
                      message: localize('com_farmer_validation_phone_exact_10'),
                    },
                  })}
                />
                {errors.phoneNo && <p className={errorClass}>{errors.phoneNo.message}</p>}
              </div>
            </div>

            {/* ── Section 2: Agricultural Background ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_agricultural_background')}</h3>

              <div className={fieldClass}>
                <Label htmlFor="yearsOfExperience">{localize('com_farmer_label_years_experience')}</Label>
                <Input
                  id="yearsOfExperience"
                  type="number"
                  placeholder={localize('com_farmer_placeholder_years')}
                  defaultValue={0}
                  min={0}
                  max={70}
                  step={1}
                  className={inputClass}
                  {...register('yearsOfExperience', {
                    required: localize('com_farmer_validation_experience_required'),
                    valueAsNumber: true,
                    validate: {
                      isInteger: (value) =>
                        Number.isInteger(value) ||
                        localize('com_farmer_validation_experience_integer'),
                      inRange: (value) =>
                        (value >= 0 && value <= 70) ||
                        localize('com_farmer_validation_experience_range'),
                    },
                  })}
                />
                {errors.yearsOfExperience && (
                  <p className={errorClass}>{errors.yearsOfExperience.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="landhold">{localize('com_farmer_label_landholding')}</Label>
                <Input
                  id="landhold"
                  type="text"
                  inputMode="decimal"
                  placeholder={localize('com_farmer_placeholder_landholding')}
                  className={inputClass}
                  {...register('landhold', {
                    required: localize('com_farmer_validation_landholding_required'),
                    validate: (value) => {
                      const normalized = String(value ?? '').trim();
                      return decimalRegex.test(normalized) ||
                        localize('com_farmer_validation_landholding_valid');
                    },
                  })}
                />
                {errors.landhold && (
                  <p className={errorClass}>{errors.landhold.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="primaryCrop">{localize('com_farmer_label_primary_crop')}</Label>
                  <SearchableMultiSelect
                    options={CROPS}
                    value={selectedPrimaryCropList}
                    onChange={(selected) =>
                      setValue('primaryCrop', selected.join(', '), { shouldValidate: true })
                    }
                    placeholder={localize('com_ui_select_options')}
                  />
                  {selectedPrimaryCropList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPrimaryCropList.map((crop) => (
                        <span
                          key={crop}
                          className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        >
                          {crop}
                          <button
                            type="button"
                            onClick={() => removePrimaryCrop(crop)}
                            className="rounded-full p-0.5 text-green-800 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-800/40"
                            aria-label={`Remove ${crop}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="hidden"
                    {...register('primaryCrop', {
                      required: localize('com_farmer_validation_primary_crop_required'),
                    })}
                  />
                  {errors.primaryCrop && <p className={errorClass}>{errors.primaryCrop.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label htmlFor="secondaryCrop">{localize('com_farmer_label_secondary_crop')}</Label>
                  <SearchableMultiSelect
                    options={CROPS}
                    value={selectedSecondaryCropList}
                    onChange={(selected) =>
                      setValue('secondaryCrop', selected.join(', '), { shouldValidate: true })
                    }
                    placeholder={localize('com_ui_select_options')}
                  />
                  {selectedSecondaryCropList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedSecondaryCropList.map((crop) => (
                        <span
                          key={crop}
                          className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        >
                          {crop}
                          <button
                            type="button"
                            onClick={() => removeSecondaryCrop(crop)}
                            className="rounded-full p-0.5 text-green-800 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-800/40"
                            aria-label={`Remove ${crop}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="hidden"
                    {...register('secondaryCrop', {
                      required: localize('com_farmer_validation_secondary_crop_required'),
                    })}
                  />
                  {errors.secondaryCrop && (
                    <p className={errorClass}>{errors.secondaryCrop.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 3: Awareness & Digital Adoption ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_awareness_section')}</h3>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_awareness_kcc')}</Label>
                <div className="mt-2 flex gap-6">
                  {yesNoOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="radio"
                        value={option.value}
                        className="accent-green-600"
                        {...register('awarenessOfKCC', {
                          required: localize('com_farmer_validation_field_required'),
                        })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {errors.awarenessOfKCC && (
                  <p className={errorClass}>{errors.awarenessOfKCC.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_usage_agri_apps')}</Label>
                <div className="mt-2 flex gap-6">
                  {yesNoOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="radio"
                        value={option.value}
                        className="accent-green-600"
                        {...register('usesAgriApps', {
                          required: localize('com_farmer_validation_field_required'),
                        })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {errors.usesAgriApps && <p className={errorClass}>{errors.usesAgriApps.message}</p>}
              </div>
            </div>

            {/* ── Section 4: Socio-Economic Indicator ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_socio_economic')}</h3>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_highest_educated')}</Label>
                <Controller
                  name="highestEducatedPerson"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_field_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={educationOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={localize('com_farmer_placeholder_select_education_level')}
                    />
                  )}
                />
                {errors.highestEducatedPerson && (
                  <p className={errorClass}>{errors.highestEducatedPerson.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="numberOfSmartphones">{localize('com_farmer_label_smartphone_count')}</Label>
                <Input
                  id="numberOfSmartphones"
                  type="number"
                  placeholder={localize('com_farmer_placeholder_smartphone_count')}
                  defaultValue={0}
                  min={0}
                  max={20}
                  step={1}
                  className={inputClass}
                  {...register('numberOfSmartphones', {
                    required: localize('com_farmer_validation_smartphones_required'),
                    valueAsNumber: true,
                    validate: {
                      isInteger: (value) =>
                        Number.isInteger(value) ||
                        localize('com_farmer_validation_smartphones_integer'),
                      inRange: (value) =>
                        (value >= 0 && value <= 20) ||
                        localize('com_farmer_validation_smartphones_range'),
                    },
                  })}
                />
                {errors.numberOfSmartphones && (
                  <p className={errorClass}>{errors.numberOfSmartphones.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-2 flex shrink-0 justify-end gap-2 border-t border-border-heavy px-1 pt-4">
            <button
              type="button"
              onClick={() => reset()}
              disabled={saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localize('com_ui_reset')}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              {saveMutation.isLoading ? `${localize('com_ui_submit')}...` : localize('com_ui_submit')}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerProfileModal;

