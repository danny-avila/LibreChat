import { useState, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import { EModelEndpoint, AuthType } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TModelSpec, TConversation, TEndpointsConfig } from 'librechat-data-provider';
import { useDefaultConvo, useNewConvo } from '~/hooks';
import { getConvoSwitchLogic } from '~/utils';
import { useChatContext } from '~/Providers';
import MenuButton from './MenuButton';
import ModelSpecs from './ModelSpecs';
import store from '~/store';

const data: TModelSpec[] = [
  {
    name: 'commander_01',
    label: 'Commander in Chief',
    description:
      'Salute your president, soldier! Salute your president, soldier! Salute your president, soldier!',
    iconURL: 'https://i.kym-cdn.com/entries/icons/facebook/000/017/252/2f0.jpg',
    preset: {
      endpoint: 'Ollama',
      greeting: 'My fellow Americans,',
      // 'endpointType': EModelEndpoint.custom,
      frequency_penalty: 0,
      // 'imageDetail': 'auto',
      model: 'command-r',
      presence_penalty: 0,
      promptPrefix: null,
      resendFiles: false,
      temperature: 0.8,
      top_p: 0.5,
    },
    authType: AuthType.SYSTEM_PROVIDED,
  },
  {
    name: 'vision_pro',
    label: 'Vision Pro',
    description:
      'Salute your president, soldier! Salute your president, soldier! Salute your president, soldier!',
    // iconURL: 'https://i.ytimg.com/vi/SaneSRqePVY/maxresdefault.jpg',
    iconURL: EModelEndpoint.openAI, // Allow using project-included icons
    preset: {
      chatGptLabel: 'Vision Helper',
      greeting: 'What\'s up!!',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4-turbo',
      promptPrefix:
        'Examine images closely to understand its style, colors, composition, and other elements. Then, craft a detailed prompt to that closely resemble the original. Your focus is on accuracy in replicating the style, colors, techniques, and details of the original image in written form. Your prompt must be excruciatingly detailed as it will be given to an image generating AI for image generation. \n',
      temperature: 0.8,
      top_p: 1,
    },
    authType: AuthType.SYSTEM_PROVIDED,
  },
];

export default function ModelSpecsMenu() {
  const modularChat = useRecoilValue(store.modularChat);
  const [selectedSpec, setSelectedSpec] = useState<string | undefined>();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const getDefaultConversation = useDefaultConvo();
  const { conversation } = useChatContext();
  const { newConversation } = useNewConvo();
  // const { data } = useGetSpecs();

  const onSelectSpec = (spec: TModelSpec) => {
    const { preset } = spec;
    preset.iconURL = spec.iconURL;
    const { endpoint: newEndpoint } = preset;
    if (!newEndpoint) {
      return;
    }

    setSelectedSpec(spec.name);

    const {
      shouldSwitch,
      isNewModular,
      isCurrentModular,
      isExistingConversation,
      newEndpointType,
      template,
    } = getConvoSwitchLogic({
      newEndpoint,
      modularChat,
      conversation,
      endpointsConfig,
    });

    if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
      template.endpointType = newEndpointType as EModelEndpoint | undefined;

      const currentConvo = getDefaultConversation({
        /* target endpointType is necessary to avoid endpoint mixing */
        conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
        preset: template,
      });

      /* We don't reset the latest message, only when changing settings mid-converstion */
      newConversation({ template: currentConvo, preset, keepLatestMessage: true });
      return;
    }

    newConversation({ template: { ...(template as Partial<TConversation>) }, preset });
  };

  console.log(selectedSpec);
  const selected = useMemo(() => {
    const spec = data.find((spec) => spec.name === selectedSpec);
    if (!spec) {
      return data[0];
    }
    return spec;
  }, [selectedSpec]);

  return (
    <Root>
      <MenuButton primaryText={selected?.label ?? ''} selected={selected} />
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: '0px',
            top: '0px',
            transform: 'translate3d(268px, 50px, 0px)',
            minWidth: 'max-content',
            zIndex: 'auto',
          }}
        >
          <Content
            side="bottom"
            align="start"
            className="models-scrollbar mt-2 max-h-[65vh] min-w-[340px] max-w-xs overflow-y-auto rounded-lg border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white lg:max-h-[75vh]"
          >
            <ModelSpecs
              specs={data}
              selected={selected}
              setSelected={onSelectSpec}
              endpointsConfig={endpointsConfig}
            />
          </Content>
        </div>
      </Portal>
    </Root>
  );
}
