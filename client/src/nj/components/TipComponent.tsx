import React from 'react';
import { X } from 'lucide-react';
import uswdsIcons from '@uswds/uswds/img/sprite.svg';
import { useLocalStorage } from '~/hooks';

/**
 * Shows a small, dismissable tip.
 *
 * @param title the title
 * @param description the description
 * @param stateKey a unique key for tracking dismissal state
 */
export default function TipComponent({
  title,
  description,
  stateKey,
}: {
  title: string;
  description: string;
  stateKey: string;
}) {
  const [showComplexBanner, setShowComplexBanner] = useLocalStorage(stateKey, true);

  if (!showComplexBanner) return null;

  return (
    <div className="mx-3 mb-4 rounded-lg border border-border-light bg-white p-3">
      <div className="flex items-start gap-2">
        <svg
          className="usa-icon tip-component-icon mt-0.5 flex-shrink-0"
          aria-hidden="true"
          focusable="false"
          role="img"
        >
          <defs>
            <linearGradient id="tipIconGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7EC8E3" />
              <stop offset="100%" stopColor="#1A6FA8" />
            </linearGradient>
            <mask id="tipIconMask">
              <use
                href={`${uswdsIcons}#lightbulb_outline`}
                style={{ fill: 'white', color: 'white' }}
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#tipIconGradient)" mask="url(#tipIconMask)" />
        </svg>
        <p className="flex-grow text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={() => setShowComplexBanner(false)}
          className="flex-shrink-0 text-text-tertiary hover:text-text-secondary"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </div>
  );
}
