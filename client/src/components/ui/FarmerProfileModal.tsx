import { useForm, Controller } from 'react-hook-form';
import STATE_DISTRICTS from '~/data/stateDistricts';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';

type FarmerProfileForm = {
  farmerName: string;
  age: number;
  gender: string;
  villageName: string;
  blockName: string;
  district: string;
  state: string;
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

const INDIAN_LANGUAGES = [
  'English',
  'অসমীয়া',     // Assamese
  'বাংলা',       // Bengali
  'बोड़ो',       // Bodo
  'डोगरी',       // Dogri
  'ગુજરાતી',     // Gujarati
  'हिन्दी',       // Hindi
  'ಕನ್ನಡ',       // Kannada
  'कॉशुर / كٲشُر', // Kashmiri (Devanagari / Perso-Arabic)
  'कोंकणी',      // Konkani
  'मैथिली',      // Maithili
  'മലയാളം',     // Malayalam
  'মৈতৈলোন্ / Manipuri', // Manipuri (Meitei Mayek also exists)
  'मराठी',       // Marathi
  'नेपाली',       // Nepali
  'ଓଡ଼ିଆ',      // Odia
  'ਪੰਜਾਬੀ',      // Punjabi
  'संस्कृतम्',    // Sanskrit
  'ᱥᱟᱱᱛᱟᱲᱤ',    // Santali (Ol Chiki)
  'सिन्धी / سنڌي', // Sindhi (Devanagari / Arabic)
  'தமிழ்',       // Tamil
  'తెలుగు',       // Telugu
  'اردو',        // Urdu
];

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

  const selectedState = watch('state') ?? '';

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (open && !isOpen) {
      onDecline();
      return;
    }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: FarmerProfileForm) => {
    const profile: IFarmerProfile = {
      ...data,
      age: Number(data.age),
      yearsOfExperience: Number(data.yearsOfExperience),
      numberOfSmartphones: Number(data.numberOfSmartphones),
      cropsCultivated: data.cropsCultivated
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
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
      <OGDialogContent showCloseButton={false} className="w-11/12 max-w-2xl sm:w-3/4 md:w-2/3 lg:w-1/2 max-h-[90vh] flex flex-col overflow-y-hidden">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            Farmer Profile Registration
          </OGDialogTitle>
          <p className="text-base font-medium text-red-500">
            * Please fill in all the details below to complete your registration.
          </p>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-1 py-2">
            {/* Section 1: Demographic Details */}
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
                    defaultValue={0}
                    min={0}
                    className={inputClass}
                    {...register('age', {
                      required: 'Age is required',
                      min: { value: 0, message: 'Age cannot be negative' },
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent className="z-[200] max-h-60 overflow-y-auto bg-surface-primary">
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label>State</Label>
                  <Controller
                    name="state"
                    control={control}
                    rules={{ required: 'State is required' }}
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setValue('district', '');
                        }}
                        value={field.value}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent className="z-[200] max-h-60 overflow-y-auto bg-surface-primary">
                          {Object.keys(STATE_DISTRICTS).map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!selectedState}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue
                            placeholder={selectedState ? 'Select district' : 'Select state first'}
                          />
                        </SelectTrigger>
                        <SelectContent className="z-[200] max-h-60 overflow-y-auto bg-surface-primary">
                          {(selectedState ? (STATE_DISTRICTS[selectedState] ?? []) : []).map(
                            (d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.district && <p className={errorClass}>{errors.district.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="blockName">Block</Label>
                  <Input
                    id="blockName"
                    placeholder="Enter block name"
                    className={inputClass}
                    {...register('blockName', { required: 'Block name is required' })}
                  />
                  {errors.blockName && <p className={errorClass}>{errors.blockName.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label htmlFor="villageName">Village</Label>
                  <Input
                    id="villageName"
                    placeholder="Enter village name"
                    className={inputClass}
                    {...register('villageName', { required: 'Village name is required' })}
                  />
                  {errors.villageName && <p className={errorClass}>{errors.villageName.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="phoneNo">Phone No.</Label>
                  <Input
                    id="phoneNo"
                    placeholder="Enter phone number"
                    className={inputClass}
                    {...register('phoneNo', {
                      required: 'Phone number is required',
                      pattern: { value: /^[0-9+\- ]{7,10}$/, message: 'Invalid phone number' },
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="z-[200] max-h-60 overflow-y-auto bg-surface-primary">
                          {INDIAN_LANGUAGES.map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.languagePreference && (
                    <p className={errorClass}>{errors.languagePreference.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Agricultural Background */}
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
                    min: { value: 0, message: 'Years cannot be negative' },
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

            {/* Section 3: Awareness & Digital Adoption */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Awareness & Digital Adoption</h3>

              <div className={fieldClass}>
                <Label>Awareness of Kisan Call Centre (KCC)</Label>
                <div className="mt-2 flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                    <input
                      type="radio"
                      value="yes"
                      className="accent-green-600"
                      {...register('awarenessOfKCC', { required: 'This field is required' })}
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                    <input
                      type="radio"
                      value="no"
                      className="accent-green-600"
                      {...register('awarenessOfKCC', { required: 'This field is required' })}
                    />
                    No
                  </label>
                </div>
                {errors.awarenessOfKCC && (
                  <p className={errorClass}>{errors.awarenessOfKCC.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label>Usage of Any Agricultural Mobile Applications</Label>
                <div className="mt-2 flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                    <input
                      type="radio"
                      value="yes"
                      className="accent-green-600"
                      {...register('usesAgriApps', { required: 'This field is required' })}
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                    <input
                      type="radio"
                      value="no"
                      className="accent-green-600"
                      {...register('usesAgriApps', { required: 'This field is required' })}
                    />
                    No
                  </label>
                </div>
                {errors.usesAgriApps && (
                  <p className={errorClass}>{errors.usesAgriApps.message}</p>
                )}
              </div>
            </div>

            {/* Section 4: Socio-Economic Indicator */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>Socio-Economic Indicator</h3>

              <div className={fieldClass}>
                <Label>Highest Educated Person in the Family</Label>
                <Controller
                  name="highestEducatedPerson"
                  control={control}
                  rules={{ required: 'This field is required' }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Select education level" />
                      </SelectTrigger>
                      <SelectContent className="z-[200] max-h-60 overflow-y-auto bg-surface-primary">
                        <SelectItem value="UnderGraduate">Under Graduate</SelectItem>
                        <SelectItem value="Graduate">Graduate</SelectItem>
                        <SelectItem value="PostGraduate">Post Graduate</SelectItem>
                      </SelectContent>
                    </Select>
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

          {/* Footer */}
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
