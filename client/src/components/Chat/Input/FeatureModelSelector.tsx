import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { FEATURES } from '../featureConfig';
import store from '~/store';

export default function FeatureModelSelector() {
  const activeFeature = useRecoilValue(store.activeFeature);
  const [activePreset, setActivePreset] = useRecoilState(store.activeStylePreset);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset dropdown when feature changes
  useEffect(() => {
    setIsOpen(false);
  }, [activeFeature]);

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  if (!activeFeature || !FEATURES[activeFeature]) {
    return null;
  }

  const { stylePresets, color, icon: FeatureIcon } = FEATURES[activeFeature];

  if (!stylePresets.length) {
    return null;
  }

  const nonAutoPresets = stylePresets.filter((p) => p.value !== 'auto');
  const selectedModel = nonAutoPresets.find((p) => p.value === activePreset);
  const isAutoMode = !activePreset;

  // Single preset — show a static label, no dropdown
  if (nonAutoPresets.length === 1 && stylePresets.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <div className="flex h-8 items-center gap-1.5 rounded-full border border-border-light bg-surface-secondary px-3 text-xs font-medium text-text-primary">
          <FeatureIcon size={14} style={{ color: `var(--feature-${color}-icon)` }} />
          <span>{nonAutoPresets[0].label}</span>
        </div>
      </div>
    );
  }

  const displayLabel = selectedModel ? selectedModel.label : '$gz Decides';

  return (
    <div className="flex items-center gap-1.5 px-3 pt-2">
      {/* Model dropdown trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 max-w-[50vw] items-center gap-1.5 rounded-full border border-border-light bg-surface-secondary px-3 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        <FeatureIcon size={14} style={{ color: `var(--feature-${color}-icon)` }} />
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu — portaled to body to avoid overflow clipping */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[200px] overflow-hidden rounded-xl border border-border-light bg-surface-primary-alt shadow-lg"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {/* $gz Decides option */}
          <button
            type="button"
            onClick={() => {
              setActivePreset(null);
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-surface-hover"
          >
            <Sparkles size={14} className="shrink-0 text-text-secondary" />
            <span className={`flex-1 font-medium ${isAutoMode ? 'text-text-primary' : 'text-text-secondary'}`}>
              $gz Decides
            </span>
            {isAutoMode && (
              <Check size={14} style={{ color: `var(--feature-${color}-icon)` }} />
            )}
          </button>

          {/* Divider */}
          <div className="mx-2 border-t border-border-light" />

          {/* Model options */}
          {nonAutoPresets.map(({ label, value }) => {
            const isSelected = activePreset === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setActivePreset(value);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-surface-hover"
              >
                <FeatureIcon size={14} className="shrink-0" style={{ color: `var(--feature-${color}-icon)` }} />
                <span className={`flex-1 font-medium ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {label}
                </span>
                {isSelected && (
                  <Check size={14} style={{ color: `var(--feature-${color}-icon)` }} />
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
