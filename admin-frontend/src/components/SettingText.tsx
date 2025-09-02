import React from 'react';

interface Props {
  label: string;
  description?: string;
  value: string;
  type?: 'text' | 'textarea' | 'url';
  placeholder?: string;
  disabled?: boolean;
  onBlur: (v: string) => void;
}

const SettingText: React.FC<Props> = ({ 
  label, 
  description, 
  value, 
  type = 'text', 
  placeholder, 
  disabled, 
  onBlur 
}) => {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onBlur(localValue);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    marginTop: '0.5rem',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div
      style={{
        padding: '1rem 1.5rem',
      }}
    >
      <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
        {label}
      </div>
      {description && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.4', marginBottom: '0.5rem' }}>
          {description}
        </div>
      )}
      {type === 'textarea' ? (
        <textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <input
          type={type === 'url' ? 'url' : 'text'}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyle}
        />
      )}
    </div>
  );
};

export default SettingText; 