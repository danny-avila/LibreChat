import * as Tabs from '@radix-ui/react-tabs';
import React, { useCallback, useEffect, useState } from 'react';
import {
  useGetStartupConfig,
  usePreferenceQuery,
  useUpdatePreferenceMutation,
} from 'librechat-data-provider/react-query';
import {
  useLocalize,
  useLocalStorage,
} from '~/hooks';
import { Dropdown } from '~/components/ui';
import { Spinner } from '~/components/svg';
//import store from '~/store';

export const SDProfileSelector = ({
  sdprofile,
  onChange,
}: {
  sdprofile: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  // Create an array of options for the Dropdown
  const { data: config } = useGetStartupConfig();
  const sdConfig = config?.tools?.stableDiffusion;
  let sdProfileOptions = [];
  if (sdConfig) {
    sdProfileOptions = sdConfig.map(obj => {
      return {
        value: obj.name,
        display: obj.name
      };
    });
  } else {
    sdProfileOptions = [
      { value: 'Default', display: localize('com_nav_sd_default') },
    ];
  }

  return (
    <div className="flex items-center justify-between">
      <div> {localize('com_nav_sd_profile')} </div>
      <Dropdown value={sdprofile} onChange={onChange} options={sdProfileOptions} />
    </div>
  );
};

export default function StableDiffusion() {
  const { data: sdProfilePref, isLoading } = usePreferenceQuery('sdProfile');
  const [selectedSDProfile, setSelectedSDProfile] = React.useState(sdProfilePref || 'Default');

  useEffect(() => {
    if (sdProfilePref) setSelectedSDProfile(sdProfilePref);
  }, [sdProfilePref, isLoading]);

  const updatePreference = useUpdatePreferenceMutation();
  const changeSDProfile = useCallback(
    (value: string) => {
      setSelectedSDProfile(value);
      console.log('callback',value);
      updatePreference.mutate({
        name: 'sdProfile',
        value: value,
      });
    },
    [updatePreference],
  );

  return (
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          {isLoading ? (
            <Spinner className="opacity-0" />
          ) : (
            <SDProfileSelector sdprofile={selectedSDProfile} onChange={changeSDProfile} />
          )}
        </div>
      </div>
  );
}
