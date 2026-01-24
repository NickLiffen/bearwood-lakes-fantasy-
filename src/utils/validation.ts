// Form validation utilities and hooks

import { useState, useCallback } from 'react';

// Validator function type - returns error string or null if valid
export type ValidatorFn = (value: string) => string | null;

// Validation rules - each returns a ValidatorFn
export const validators = {
  required: (message = 'This field is required'): ValidatorFn => (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? null : message;
  },

  email: (message = 'Please enter a valid email address'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null; // Let required handle empty
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim()) ? null : message;
  },

  lettersOnly: (message = 'Only letters, spaces, hyphens, and apostrophes allowed'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    const lettersRegex = /^[a-zA-Z\s'-]+$/;
    return lettersRegex.test(value.trim()) ? null : message;
  },

  alphanumeric: (message = 'Only letters, numbers, and underscores allowed'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    const alphanumericRegex = /^[a-zA-Z0-9_]+$/;
    return alphanumericRegex.test(value.trim()) ? null : message;
  },

  minLength: (min: number, message?: string): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    return value.trim().length >= min ? null : (message || `Must be at least ${min} characters`);
  },

  maxLength: (max: number, message?: string): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    return value.trim().length <= max ? null : (message || `Must be no more than ${max} characters`);
  },

  url: (message = 'Please enter a valid URL'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null; // Optional field
    try {
      new URL(value.trim());
      return null;
    } catch {
      return message;
    }
  },

  positiveNumber: (message = 'Please enter a positive number'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    const num = parseFloat(value);
    return !isNaN(num) && num > 0 ? null : message;
  },

  nonNegativeInteger: (message = 'Please enter a non-negative whole number'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && Number.isInteger(num) ? null : message;
  },

  date: (message = 'Please enter a valid date'): ValidatorFn => (value: string) => {
    if (!value.trim()) return null;
    const date = new Date(value);
    return !isNaN(date.getTime()) ? null : message;
  },

  dateAfter: (getOtherDate: () => string, message = 'End date must be on or after start date'): ValidatorFn => (value: string) => {
    const otherDate = getOtherDate();
    if (!value.trim() || !otherDate.trim()) return null;
    return new Date(value) >= new Date(otherDate) ? null : message;
  },

  passwordMatch: (getPassword: () => string, message = 'Passwords do not match'): ValidatorFn => (value: string) => {
    return value === getPassword() ? null : message;
  },

  password: (message = 'Password must be at least 8 characters'): ValidatorFn => (value: string) => {
    if (!value) return null;
    if (value.length < 8) return message;
    return null;
  },
};

// Sanitizers
export const sanitizers = {
  trim: (value: string) => value.trim(),
  trimAndCapitalize: (value: string) => {
    const trimmed = value.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  },
  lowercase: (value: string) => value.trim().toLowerCase(),
  removeExtraSpaces: (value: string) => value.trim().replace(/\s+/g, ' '),
};

// Field state interface
interface FieldState {
  value: string;
  error: string | null;
  touched: boolean;
  isValid: boolean;
}

// Hook for form validation - accepts arrays of ValidatorFn per field
export function useFormValidation<T extends { [key: string]: string }>(
  initialValues: T,
  validatorConfig: Record<keyof T, ValidatorFn[]>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<keyof T, string | null>>(
    Object.keys(initialValues).reduce((acc, key) => ({ ...acc, [key]: null }), {} as Record<keyof T, string | null>)
  );
  const [touched, setTouched] = useState<Record<keyof T, boolean>>(
    Object.keys(initialValues).reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<keyof T, boolean>)
  );

  const validateField = useCallback((field: keyof T, value: string): string | null => {
    const fieldValidators = validatorConfig[field];
    if (!fieldValidators) return null;

    for (const validator of fieldValidators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  }, [validatorConfig]);

  const setValue = useCallback((field: keyof T, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Only validate if field has been touched
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  }, [touched, validateField]);

  const setFieldTouched = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [validateField, values]);

  const validateAll = useCallback((): boolean => {
    const newErrors: Record<keyof T, string | null> = {} as Record<keyof T, string | null>;
    const newTouched: Record<keyof T, boolean> = {} as Record<keyof T, boolean>;
    let isValid = true;

    for (const field of Object.keys(values) as Array<keyof T>) {
      newTouched[field] = true;
      const error = validateField(field, values[field]);
      newErrors[field] = error;
      if (error) isValid = false;
    }

    setTouched(newTouched);
    setErrors(newErrors);
    return isValid;
  }, [values, validateField]);

  const getFieldState = useCallback((field: keyof T): FieldState => {
    return {
      value: values[field],
      error: errors[field],
      touched: touched[field],
      isValid: touched[field] && !errors[field],
    };
  }, [values, errors, touched]);

  const reset = useCallback((newValues?: T) => {
    setValues(newValues || initialValues);
    setErrors(Object.keys(initialValues).reduce((acc, key) => ({ ...acc, [key]: null }), {} as Record<keyof T, string | null>));
    setTouched(Object.keys(initialValues).reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<keyof T, boolean>));
  }, [initialValues]);

  const isFormValid = Object.values(errors).every(e => e === null) && 
                       Object.values(touched).some(t => t);

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateAll,
    getFieldState,
    reset,
    isFormValid,
  };
}

// Helper function to get input class based on validation state
export function getInputClassName(touched: boolean, error: string | null | undefined, baseClass = ''): string {
  if (!touched) return baseClass;
  if (error) return `${baseClass} input-error`.trim();
  return `${baseClass} input-valid`.trim();
}
