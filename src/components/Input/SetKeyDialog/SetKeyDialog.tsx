import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { EModelEndpoint, alternateName } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TDialogProps } from '~/common';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { RevokeKeysButton } from '~/components/Nav';
import { Dialog, Dropdown } from '~/components/ui';
import { useUserKey, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import CustomConfig from './CustomEndpoint';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import HelpText from './HelpText';

const endpointComponents = {
  [EModelEndpoint.google]: GoogleConfig,
  [EModelEndpoint.openAI]: OpenAIConfig,
  [EModelEndpoint.custom]: CustomConfig,
  [EModelEndpoint.azureOpenAI]: OpenAIConfig,
  [EModelEndpoint.gptPlugins]: OpenAIConfig,
  default: OtherConfig,
};

const EXPIRY = {
  THIRTY_MINUTES: { display: 'in 30 minutes', value: 30 * 60 * 1000 },
  TWO_HOURS: { display: 'in 2 hours', value: 2 * 60 * 60 * 1000 },
  TWELVE_HOURS: { display: 'in 12 hours', value: 12 * 60 * 60 * 1000 },
  ONE_DAY: { display: 'in 1 day', value: 24 * 60 * 60 * 1000 },
  ONE_WEEK: { display: 'in 7 days', value: 7 * 24 * 60 * 60 * 1000 },
  ONE_MONTH: { display: 'in 30 days', value: 30 * 24 * 60 * 60 * 1000 },
};

const SetKeyDialog = ({
  open,
  onOpenChange,
  endpoint,
  endpointType,
  userProvideURL,
}: Pick<TDialogProps, 'open' | 'onOpenChange'> & {
  endpoint: EModelEndpoint | string;
  endpointType?: EModelEndpoint;
  userProvideURL?: boolean | null;
}) => {
  const methods = useForm({
    defaultValues: {
      apiKey: '',
      baseURL: '',
      // TODO: allow endpoint definitions from user
      // name: '',
      // TODO: add custom endpoint models defined by user
      // models: '',
    },
  });

  const [userKey, setUserKey] = useState('');
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [expiresAtLabel, setExpiresAtLabel] = useState(EXPIRY.TWELVE_HOURS.display);
  const { getExpiry, saveUserKey } = useUserKey(endpoint);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const expirationOptions = Object.values(EXPIRY);

  const handleExpirationChange = (label: string) => {
    setExpiresAtLabel(label);
  };

  const submit = () => {
    const selectedOption = expirationOptions.find((option) => option.display === expiresAtLabel);
    const expiresAt = Date.now() + (selectedOption ? selectedOption.value : 0);

    const saveKey = (key: string) => {
      saveUserKey(key, expiresAt);
      onOpenChange(false);
    };

    if (endpoint === EModelEndpoint.custom || endpointType === EModelEndpoint.custom) {
      // TODO: handle other user provided options besides baseURL and apiKey
      methods.handleSubmit((data) => {
        const emptyValues = Object.keys(data).filter((key) => {
          if (key === 'baseURL' && !userProvideURL) {
            return false;
          }
          return data[key] === '';
        });

        if (emptyValues.length > 0) {
          showToast({
            message: 'The following fields are required: ' + emptyValues.join(', '),
            status: 'error',
          });
          onOpenChange(true);
        } else {
          saveKey(JSON.stringify(data));
          methods.reset();
        }
      })();
      return;
    }

    saveKey(userKey);
    setUserKey('');
  };

  const EndpointComponent =
    endpointComponents[endpointType ?? endpoint] ?? endpointComponents['default'];
  const expiryTime = getExpiry();
  const config = endpointsConfig?.[endpoint];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`${localize('com_endpoint_config_key_for')} ${alternateName[endpoint] ?? endpoint}`}
        className="w-full max-w-[650px] sm:w-3/4 md:w-3/4 lg:w-3/4"
        main={
          <div className="grid w-full items-center gap-2">
            <small className="text-red-600">
              {`${localize('com_endpoint_config_key_encryption')} ${
                !expiryTime
                  ? localize('com_endpoint_config_key_expiry')
                  : `${new Date(expiryTime).toLocaleString()}`
              }`}
            </small>
            <Dropdown
              label="Expires "
              value={expiresAtLabel}
              onChange={handleExpirationChange}
              options={expirationOptions.map((option) => option.display)}
              width={185}
            />
            <FormProvider {...methods}>
              <EndpointComponent
                userKey={userKey}
                setUserKey={setUserKey}
                endpoint={
                  endpoint === EModelEndpoint.gptPlugins && config?.azure
                    ? EModelEndpoint.azureOpenAI
                    : endpoint
                }
                userProvideURL={userProvideURL}
              />
            </FormProvider>
            <HelpText endpoint={endpoint} />
          </div>
        }
        selection={{
          selectHandler: submit,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: localize('com_ui_submit'),
        }}
        leftButtons={
          <RevokeKeysButton endpoint={endpoint} showText={false} disabled={!expiryTime} />
        }
      />
    </Dialog>
  );
};

export default SetKeyDialog;
