import React, { memo } from 'react';
import { ImageIcon } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function ImageGeneration() {
  const localize = useLocalize();
  const { imageGeneration: imageGenerationData } = useBadgeRowContext();
  const { toggleState: imageGeneration, debouncedChange, isPinned } = imageGenerationData;

  return (
    (isPinned || imageGeneration === true) && (
      <CheckboxButton
        className="max-w-fit"
        checked={imageGeneration}
        setValue={debouncedChange}
        label={localize('com_ui_image_gen')}
        isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
        icon={<ImageIcon className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(ImageGeneration);
