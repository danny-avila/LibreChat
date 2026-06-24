import type { ComponentType } from 'react';
import {
  SiBox,
  SiDropbox,
  SiGmail,
  SiGooglecalendar,
  SiGoogledrive,
} from '@icons-pack/react-simple-icons';
import { Briefcase, LayoutGrid } from 'lucide-react';
import type { IntegrationProviderKey } from 'librechat-data-provider';
import { cn } from '~/utils';

type SimpleIconComponent = ComponentType<{
  className?: string;
  color?: string;
  size?: number | string;
  title?: string;
}>;

type LucideIconComponent = ComponentType<{ className?: string; size?: number }>;

const SIMPLE_ICONS: Partial<Record<IntegrationProviderKey, SimpleIconComponent>> = {
  'google-drive': SiGoogledrive,
  'google-mail': SiGmail,
  'google-calendar': SiGooglecalendar,
  dropbox: SiDropbox,
  box: SiBox,
};

const FALLBACK_ICONS: Partial<Record<IntegrationProviderKey, LucideIconComponent>> = {
  microsoft: LayoutGrid,
  clio: Briefcase,
};

interface IntegrationProviderIconProps {
  providerKey: IntegrationProviderKey;
  className?: string;
}

export function IntegrationProviderIcon({
  providerKey,
  className = 'size-4',
}: IntegrationProviderIconProps) {
  const SimpleIcon = SIMPLE_ICONS[providerKey];
  if (SimpleIcon) {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
      >
        <SimpleIcon color="default" size={16} className="h-full w-full" />
      </span>
    );
  }

  const FallbackIcon = FALLBACK_ICONS[providerKey];
  if (!FallbackIcon) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-text-secondary',
        className,
      )}
    >
      <FallbackIcon size={16} className="h-full w-full" />
    </span>
  );
}
