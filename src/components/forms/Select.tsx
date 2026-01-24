// Reusable Select component

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  name,
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
}) => {
  // Implementation placeholder
  return (
    <div>
      <select name={name} value={value} onChange={onChange} disabled={disabled}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span>{error}</span>}
    </div>
  );
};
