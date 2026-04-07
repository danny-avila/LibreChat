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
      className="w-[340px] rounded-2xl bg-text-primary pb-5 pl-3 pr-3 pt-3 text-surface-primary"
      style={{ boxShadow: '0 0 0 2px #000, 0 0 0 4px #fff' }}
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon name="notifications" style={{ color: '#FFBE2E' }} />
          <h3 className="text-base font-semibold">New updates</h3>
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

      <div className="mb-5 pl-5">
        <p className="mb-3 text-sm">
          Please check out the latest updates at the new Release Notes page!
        </p>
        <Link
          to={{ pathname: '/nj/release-notes' }}
          onClick={handleLinkClick}
          className="inline-flex items-center gap-1 text-sm underline hover:decoration-2"
        >
          Release Notes
        </Link>
      </div>

      <div className="pl-5 pr-5">
        <button
          onClick={handleDismiss}
          className="hover:bg-surface-primary/10 w-full rounded border-2 border-surface-primary bg-transparent py-2 text-sm font-medium text-surface-primary"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}

export default function NewUpdatesWidget() {
  const [dismissed, setDismissed] = useRecoilState(newUpdatesWidgetDismissed);
  const [expanded, setExpanded] = useState(false);

  if (dismissed) {
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
