// import * as Checkbox from '@radix-ui/react-checkbox';
// import { CheckIcon } from '@radix-ui/react-icons';
import { useFormContext, Controller } from 'react-hook-form';
import InputWithLabel from './InputWithLabel';

const CustomConfig = () => {
  const { control } = useFormContext();

  return (
    <form>
      <Controller
        name="customEndpointName"
        control={control}
        render={({ field }) => (
          <InputWithLabel id="customEndpointName" {...field} label="Custom Endpoint Name" />
        )}
      />

      <Controller
        name="customBaseURL"
        control={control}
        render={({ field }) => (
          <InputWithLabel id="customBaseURL" {...field} label="Custom Base URL" />
        )}
      />

      <Controller
        name="customModels"
        control={control}
        render={({ field }) => (
          <InputWithLabel id="customModels" {...field} label="Custom Models" />
        )}
      />

      <Controller
        name="customApiKey"
        control={control}
        render={({ field }) => (
          <InputWithLabel id="customApiKey" {...field} label="Custom Endpoint API Key" />
        )}
      />
    </form>
  );
};

export default CustomConfig;
