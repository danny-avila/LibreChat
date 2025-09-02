import React from 'react';

interface Props {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

const switchBase: React.CSSProperties = {
  width: 40,
  height: 20,
  borderRadius: 9999,
  position: 'relative',
  flexShrink: 0,
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const knobBase: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  backgroundColor: '#fff',
  position: 'absolute',
  top: 1,
  left: 1,
  transition: 'transform 0.2s',
  boxShadow: '0 0 2px rgba(0,0,0,0.2)',
};

const SettingToggle: React.FC<Props> = ({ label, description, value, disabled, onChange }) => {
  const bg = value ? '#000000' : '#d1d5db';
  const knobTransform = value ? 'translateX(20px)' : 'translateX(0)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '1rem 1.5rem',
        gap: '1rem',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.4' }}>
            {description}
          </div>
        )}
      </div>
      <div
        role="checkbox"
        aria-checked={value}
        onClick={() => !disabled && onChange(!value)}
        style={{ ...switchBase, backgroundColor: bg, opacity: disabled ? 0.6 : 1 }}
      >
        <span style={{ ...knobBase, transform: knobTransform }} />
      </div>
    </div>
  );
};

export default SettingToggle; 