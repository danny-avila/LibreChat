import { EModelEndpoint, openAICompatibleEndpointName } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import InputWithLabel from './InputWithLabel';

const CustomEndpoint = ({
  endpoint,
  userProvideURL,
}: {
  endpoint: EModelEndpoint | string;
  userProvideURL?: boolean | null;
}) => {
  const { control } = useFormContext();
  const endpointLabel =
    endpoint === openAICompatibleEndpointName ? openAICompatibleEndpointName : endpoint;
  return (
    <form className="flex-wrap">
      <Controller
        name="apiKey"
        control={control}
        render={({ field }) => (
          <InputWithLabel
            id="apiKey"
            {...field}
            label={`${endpointLabel} API Key`}
            labelClassName="mb-1"
            inputClassName="mb-2"
            secret
          />
        )}
      />
      {userProvideURL && (
        <Controller
          name="baseURL"
          control={control}
          render={({ field }) => (
            <InputWithLabel
              id="baseURL"
              {...field}
              label={`${endpointLabel} API Base URL (/v1)`}
              labelClassName="mb-1"
            />
          )}
        />
      )}
    </form>
  );
};

export default CustomEndpoint;
