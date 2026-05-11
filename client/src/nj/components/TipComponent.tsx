import uswdsIcons from '@uswds/uswds/img/sprite.svg';
import { X } from 'lucide-react';
import React from 'react';
import { useRecoilState } from 'recoil';
import { atomWithLocalStorage } from '~/store/utils';

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
  const [showComplexBanner, setShowComplexBanner] = useRecoilState(
    atomWithLocalStorage(stateKey, true),
  );

  if (!showComplexBanner) return null;

  return (
    <div className="mx-3 mb-4 rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="flex items-start gap-2">
        <svg
          className="usa-icon usa-icon--size-2 mt-0.5 flex-shrink-0 text-jersey-blue"
          aria-hidden="true"
          focusable="false"
          role="img"
        >
          <use href={`${uswdsIcons}#lightbulb_outline`} />
        </svg>
        <div className="flex-grow">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowComplexBanner(false)}
          className="flex-shrink-0 text-text-tertiary hover:text-text-secondary"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
