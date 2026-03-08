import { useState, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
  onValidChange?: (valid: boolean) => void;
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return input;
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith('1')) return true;
  return false;
}

export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

export default function PhoneInput({ value, onChange, className = '', required, placeholder = '(555) 123-4567', onValidChange }: Props) {
  const [display, setDisplay] = useState(value ? formatPhoneDisplay(value) : '');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  // Sync display when external value changes (e.g. form reset)
  useEffect(() => {
    if (!touched) {
      setDisplay(value ? formatPhoneDisplay(value) : '');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, parens, dashes, spaces, plus sign
    const filtered = e.target.value.replace(/[^0-9()\-\s+]/g, '');
    setDisplay(filtered);
    setTouched(true);
    if (error) setError('');
  };

  const handleBlur = () => {
    if (!display.trim()) {
      onChange('');
      onValidChange?.(false);
      setError('');
      return;
    }
    const normalized = normalizePhone(display);
    if (isValidPhone(display)) {
      onChange(normalized);
      setDisplay(formatPhoneDisplay(normalized));
      setError('');
      onValidChange?.(true);
    } else {
      onChange(display);
      setError('Please enter a valid 10-digit phone number.');
      onValidChange?.(false);
    }
  };

  return (
    <div className={className}>
      <input
        type="tel"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] ${error ? 'border-red-400' : 'border-gray-300'}`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
