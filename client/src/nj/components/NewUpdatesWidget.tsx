/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { AnimatePresence, motion } from 'framer-motion';
import { newUpdatesWidgetDismissed } from '~/nj/store/landing';
import { logEvent } from '~/nj/analytics/logEvent';
import icons from '@uswds/uswds/img/sprite.svg';

interface IconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

function Icon({ name, className = 'usa-icon--size-3', style }: IconProps) {
  return (
    <svg
      className={`usa-icon ${className}`}
      style={style}
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      <use href={`${icons}#${name}`} />
    </svg>
  );
}

interface CollapsedWidgetProps {
  onExpand: () => void;
}

function CollapsedWidget({ onExpand }: CollapsedWidgetProps) {
  const handleExpand = () => {
    logEvent('update_widget_expand');
    onExpand();
  };

  return (
    <motion.button
      key="collapsed"
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0.9 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      onClick={handleExpand}
      className="hover:bg-text-primary/90 flex items-center gap-2 rounded-full bg-text-primary px-4 py-2 text-sm font-medium text-surface-primary shadow-lg"
    >
      <Icon name="notifications" style={{ color: '#FFBE2E' }} />
      <span>New updates</span>
      <Icon name="expand_more" />
    </motion.button>
  );
}

interface ExpandedWidgetProps {
  onClose: () => void;
  onDismiss: () => void;
}

function ExpandedWidget({ onClose, onDismiss }: ExpandedWidgetProps) {
  const handleLinkClick = () => {
    logEvent('update_widget_click_link');
  };

  const handleDismiss = () => {
    logEvent('update_widget_dismiss');
    onDismiss();
  };

  return (
    <motion.div
      key="expanded"
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0.9 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="w-80 rounded-2xl bg-text-primary p-6 text-surface-primary shadow-xl"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon name="notifications" style={{ color: '#FFBE2E' }} />
          <h3 className="text-base font-semibold">New update</h3>
        </div>
        <button
          onClick={onClose}
          className="hover:text-surface-primary/80 text-surface-primary"
          aria-label="Close"
        >
          <div className="rotate-180">
            <Icon name="expand_more" />
          </div>
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-3 text-sm">
          The new updates widget is live! Here&apos;s a link to the Guide Page to prove
          functionality.
        </p>
        <Link
          to={{ pathname: '/nj/guide' }}
          onClick={handleLinkClick}
          className="inline-flex items-center gap-1 text-sm underline hover:decoration-2"
        >
          Guide Page
        </Link>
      </div>

      <button
        onClick={handleDismiss}
        className="hover:bg-surface-primary/10 w-full rounded border-2 border-surface-primary bg-transparent py-2 text-sm font-medium text-surface-primary"
      >
        Dismiss
      </button>
    </motion.div>
  );
}

export default function NewUpdatesWidget() {
  const [dismissed, setDismissed] = useRecoilState(newUpdatesWidgetDismissed);
  const [expanded, setExpanded] = useState(false);

  if (import.meta.env.VITE_DISPLAY_UPDATE_WIDGET !== 'true' || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    setExpanded(false);
  };

  const toggleExpanded = () => {
    setExpanded((prevExpanded) => !prevExpanded);
  };

  return (
    <div className="fixed right-4 top-2 z-20">
      <AnimatePresence initial={false} mode="wait">
        {!expanded ? (
          <CollapsedWidget onExpand={toggleExpanded} />
        ) : (
          <ExpandedWidget onClose={toggleExpanded} onDismiss={handleDismiss} />
        )}
      </AnimatePresence>
    </div>
  );
}
