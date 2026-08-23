import { memo } from 'react';
import type { ProviderId } from 'librechat-data-provider';
import type { NamedExoticComponent } from 'react';
import type { JSX } from 'react/jsx-runtime';
import { getProviderIconDef } from './registry';
import { ProviderIcon } from './Icon';
import { cn } from '../../utils';

export interface ProviderAvatarProps {
  provider?: ProviderId | null;
  model?: string | null;
  size?: number;
  className?: string;
}

const artScale = 5 / 9;

function ProviderAvatarComponent({
  provider,
  model,
  size = 30,
  className,
}: ProviderAvatarProps): JSX.Element {
  const def = getProviderIconDef(provider, model);
  const hasBrand = typeof def.brandColor === 'string' && def.brandColor.length > 0;

  return (
    <span
      title={def.label}
      style={{ background: hasBrand ? def.brandColor : 'transparent', width: size, height: size }}
      className={cn(
        'relative flex items-center justify-center rounded-sm p-1',
        hasBrand ? 'text-white' : 'text-text-primary',
        className,
      )}
    >
      <ProviderIcon provider={provider} model={model} size={size * artScale} />
    </span>
  );
}

export const ProviderAvatar: NamedExoticComponent<ProviderAvatarProps> =
  memo(ProviderAvatarComponent);
