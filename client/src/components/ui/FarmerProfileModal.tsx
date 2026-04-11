import { useForm, Controller } from 'react-hook-form';
import { useState, useRef, useEffect } from 'react';
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
import { STATES, DISTRICTS, INDIAN_LANGUAGES } from '~/utils/metaData';

// ── Searchable Select ────────────────────────────────────────────────────────

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className="relative mt-1">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-left focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50 ${
          value ? 'text-text-primary' : 'text-text-secondary'
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[300] mt-1 w-full rounded-md border border-border-heavy bg-surface-primary shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-border-heavy">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-border-heavy bg-surface-secondary px-2 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          {/* Options */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-secondary">No results found</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt}
                  onMouseDown={() => handleSelect(opt)}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-surface-active ${
                    value === opt ? 'bg-green-50 text-green-700 font-medium dark:bg-green-900/20 dark:text-green-400' : 'text-text-primary'
                  }`}
                >
                  {opt}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Form Types ───────────────────────────────────────────────────────────────

type FarmerProfileForm = {
  farmerName: string;
  age: number;
  gender: string;
  state: string;
  district: string;
  customDistrict: string;
  blockName: string;
  villageName: string;
  phoneNo: string;
  languagePreference: string;
  yearsOfExperience: number;
  cropsCultivated: string;
  primaryCrop: string;
  secondaryCrop: string;
  awarenessOfKCC: string;
  usesAgriApps: string;
  highestEducatedPerson: string;
  numberOfSmartphones: number;
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
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FarmerProfileForm>({ mode: 'onChange' });

  const selectedState = watch('state');
  const selectedDistrict = watch('district');

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

  const districtOptions = selectedState
    ? [...(DISTRICTS[selectedState] ?? []), 'Other']
    : ['Other'];

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => { onComplete(); },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (open && !isOpen) { onDecline(); return; }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: FarmerProfileForm) => {
    const resolvedDistrict =
      data.district === 'Other' ? data.customDistrict : data.district;

    const profile: IFarmerProfile = {
      ...data,
      district: resolvedDistrict,
      age: Number(data.age),
      yearsOfExperience: Number(data.yearsOfExperience),
      numberOfSmartphones: Number(data.numberOfSmartphones),
      cropsCultivated: data.cropsCultivated
        .split(',').map((c) => c.trim()).filter(Boolean),
      awarenessOfKCC: data.awarenessOfKCC === 'yes',
      usesAgriApps: data.usesAgriApps === 'yes',
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

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="w-11/12 max-w-2xl sm:w-3/4 md:w-2/3 lg:w-1/2 max-h-[90vh] flex flex-col overflow-y-hidden"
      >
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Farmer Profile Registration
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          {/* ── Notice — pinned above the scrollable area ── */}
          <p className="shrink-0 px-1 pb-3 text-sm font-medium text-red-500">
            * Please fill in all the details below to complete your registration.
          </p>

          <div className="flex-1 overflow-y-auto px-1 py-2">

            {/* ── Section 1: Demographic Details ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Demographic Details</h3>

              <div className={fieldClass}>
                <Label htmlFor="farmerName">Farmer Name</Label>
                <Input
                  id="farmerName"
                  placeholder="Enter full name"
                  className={inputClass}
                  {...register('farmerName', { required: 'Farmer name is required' })}
                />
                {errors.farmerName && <p className={errorClass}>{errors.farmerName.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="Age"
                    defaultValue={18}
                    min={18}
                    className={inputClass}
                    {...register('age', {
                      required: 'Age is required',
                      min: { value: 18, message: 'Must be at least 18' },
                      valueAsNumber: true,
                    })}
                  />
                  {errors.age && <p className={errorClass}>{errors.age.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label>Gender</Label>
                  <Controller
                    name="gender"
                    control={control}
                    rules={{ required: 'Gender is required' }}
                    render={({ field }) => (
                      <SearchableSelect
                        options={['Male', 'Female', 'Other']}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Select gender"
                      />
                    )}
                  />
                  {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
                </div>
              </div>

              {/* ── State → District → Block → Village ── */}
              <div className={fieldClass}>
                <Label>State</Label>
                <Controller
                  name="state"
                  control={control}
                  rules={{ required: 'State is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={STATES}
                      value={field.value ?? ''}
                      onChange={handleStateChange}
                      placeholder="Select state"
                    />
                  )}
                />
                {errors.state && <p className={errorClass}>{errors.state.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label>District</Label>
                <Controller
                  name="district"
                  control={control}
                  rules={{ required: 'District is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={districtOptions}
                      value={field.value ?? ''}
                      onChange={handleDistrictChange}
                      placeholder={selectedState ? 'Select district' : 'Select a state first'}
                      disabled={!selectedState}
                    />
                  )}
                />
                {errors.district && <p className={errorClass}>{errors.district.message}</p>}
              </div>

              {/* Custom district input – shown only when "Other" is selected */}
              {selectedDistrict === 'Other' && (
                <div className={fieldClass}>
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
                    <p className={errorClass}>{errors.customDistrict.message}</p>
                  )}
                </div>
              )}

              <div className={fieldClass}>
                <Label htmlFor="blockName">Block Name</Label>
                <Input
                  id="blockName"
                  placeholder="Enter block name"
                  className={inputClass}
                  {...register('blockName', { required: 'Block name is required' })}
                />
                {errors.blockName && <p className={errorClass}>{errors.blockName.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="villageName">Village Name</Label>
                <Input
                  id="villageName"
                  placeholder="Enter village name"
                  className={inputClass}
                  {...register('villageName', { required: 'Village name is required' })}
                />
                {errors.villageName && <p className={errorClass}>{errors.villageName.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="phoneNo">Phone No.</Label>
                <Input
                  id="phoneNo"
                  placeholder="Enter phone number"
                  className={inputClass}
                  {...register('phoneNo', {
                    required: 'Phone number is required',
                    pattern: { value: /^[0-9+\- ]{7,15}$/, message: 'Invalid phone number' },
                  })}
                />
                {errors.phoneNo && <p className={errorClass}>{errors.phoneNo.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label>Language Preference</Label>
                <Controller
                  name="languagePreference"
                  control={control}
                  rules={{ required: 'Language preference is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={INDIAN_LANGUAGES}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Select language"
                    />
                  )}
                />
                {errors.languagePreference && (
                  <p className={errorClass}>{errors.languagePreference.message}</p>
                )}
              </div>
            </div>

            {/* ── Section 2: Agricultural Background ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Agricultural Background</h3>

              <div className={fieldClass}>
                <Label htmlFor="yearsOfExperience">Years of Experience in Agriculture</Label>
                <Input
                  id="yearsOfExperience"
                  type="number"
                  placeholder="Years"
                  defaultValue={0}
                  min={0}
                  className={inputClass}
                  {...register('yearsOfExperience', {
                    required: 'Years of experience is required',
                    min: { value: 0, message: 'Cannot be negative' },
                    valueAsNumber: true,
                  })}
                />
                {errors.yearsOfExperience && (
                  <p className={errorClass}>{errors.yearsOfExperience.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="cropsCultivated">Crops Cultivated</Label>
                <Input
                  id="cropsCultivated"
                  placeholder="e.g. Wheat, Rice, Maize (comma separated)"
                  className={inputClass}
                  {...register('cropsCultivated', { required: 'Crops cultivated is required' })}
                />
                {errors.cropsCultivated && (
                  <p className={errorClass}>{errors.cropsCultivated.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="primaryCrop">Primary Crop</Label>
                  <Input
                    id="primaryCrop"
                    placeholder="e.g. Wheat"
                    className={inputClass}
                    {...register('primaryCrop', { required: 'Primary crop is required' })}
                  />
                  {errors.primaryCrop && (
                    <p className={errorClass}>{errors.primaryCrop.message}</p>
                  )}
                </div>

                <div className={fieldClass}>
                  <Label htmlFor="secondaryCrop">Secondary Crop</Label>
                  <Input
                    id="secondaryCrop"
                    placeholder="e.g. Rice"
                    className={inputClass}
                    {...register('secondaryCrop', { required: 'Secondary crop is required' })}
                  />
                  {errors.secondaryCrop && (
                    <p className={errorClass}>{errors.secondaryCrop.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 3: Awareness & Digital Adoption ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Awareness & Digital Adoption</h3>

              <div className={fieldClass}>
                <Label>Awareness of Kisan Call Centre (KCC)</Label>
                <div className="mt-2 flex gap-6">
                  {['yes', 'no'].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                      <input
                        type="radio"
                        value={val}
                        className="accent-green-600"
                        {...register('awarenessOfKCC', { required: 'This field is required' })}
                      />
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </label>
                  ))}
                </div>
                {errors.awarenessOfKCC && (
                  <p className={errorClass}>{errors.awarenessOfKCC.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label>Usage of Any Agricultural Mobile Applications</Label>
                <div className="mt-2 flex gap-6">
                  {['yes', 'no'].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                      <input
                        type="radio"
                        value={val}
                        className="accent-green-600"
                        {...register('usesAgriApps', { required: 'This field is required' })}
                      />
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </label>
                  ))}
                </div>
                {errors.usesAgriApps && (
                  <p className={errorClass}>{errors.usesAgriApps.message}</p>
                )}
              </div>
            </div>

            {/* ── Section 4: Socio-Economic Indicator ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Socio-Economic Indicator</h3>

              <div className={fieldClass}>
                <Label>Highest Educated Person in the Family</Label>
                <Controller
                  name="highestEducatedPerson"
                  control={control}
                  rules={{ required: 'This field is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={['Under Graduate', 'Graduate', 'Post Graduate']}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Select education level"
                    />
                  )}
                />
                {errors.highestEducatedPerson && (
                  <p className={errorClass}>{errors.highestEducatedPerson.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="numberOfSmartphones">No. of Smart Phones in the Family</Label>
                <Input
                  id="numberOfSmartphones"
                  type="number"
                  placeholder="Number of smartphones"
                  defaultValue={0}
                  min={0}
                  className={inputClass}
                  {...register('numberOfSmartphones', {
                    required: 'This field is required',
                    min: { value: 0, message: 'Cannot be negative' },
                    valueAsNumber: true,
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
              Reset
            </button>
            <button
              type="submit"
              disabled={!isValid || saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              {saveMutation.isLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerProfileModal;