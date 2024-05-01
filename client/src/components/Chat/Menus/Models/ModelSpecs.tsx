import type { FC } from 'react';
import { Close } from '@radix-ui/react-popover';
import { AuthType } from 'librechat-data-provider';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import MenuSeparator from '~/components/Chat/Menus/UI/MenuSeparator';
import ModelSpec from './ModelSpec';

const ModelSpecs: FC<{
  specs?: TModelSpec[];
  selected?: TModelSpec;
  setSelected?: (spec: TModelSpec) => void;
  endpointsConfig: TEndpointsConfig;
}> = ({ specs = [], selected, setSelected = () => ({}), endpointsConfig }) => {
  return (
    <>
      {specs &&
        specs.map((spec, i) => {
          if (!spec) {
            return null;
          }
          return (
            <Close asChild key={`spec-${spec.name}`}>
              <div key={`spec-${spec.name}`}>
                <ModelSpec
                  spec={spec}
                  title={spec.label}
                  key={`spec-item-${spec.name}`}
                  description={spec.description}
                  onClick={() => setSelected(spec)}
                  data-testid={`spec-item-${spec.name}`}
                  selected={selected?.name === spec.name}
                  userProvidesKey={spec.authType === AuthType.USER_PROVIDED}
                  endpointsConfig={endpointsConfig}
                />
                {i !== specs.length - 1 && <MenuSeparator />}
              </div>
            </Close>
          );
        })}
    </>
  );
};

export default ModelSpecs;
