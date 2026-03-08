interface Props {
  value: string; // HH:MM 24hr format
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export function formatTimeDisplay(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function TimePicker({ value, onChange, className = '', required }: Props) {
  // Strip seconds if present (e.g., "08:00:00" → "08:00")
  const normalized = value && value.split(':').length > 2 ? value.split(':').slice(0, 2).join(':') : value;
  return (
    <input
      type="time"
      value={normalized}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={`px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${className}`}
    />
  );
}
