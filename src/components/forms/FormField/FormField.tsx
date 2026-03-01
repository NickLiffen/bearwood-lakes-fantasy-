// Reusable FormField wrapper component

import React from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, htmlFor, error, children }) => {
  // Implementation placeholder
  return (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span>{error}</span>}
    </div>
  );
};
