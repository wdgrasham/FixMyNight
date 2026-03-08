const colors: Record<string, string> = {
  emergency: 'bg-red-100 text-red-800',
  routine: 'bg-brand-50 text-brand',
  message: 'bg-purple-100 text-purple-800',
  wrong_number: 'bg-gray-100 text-gray-600',
  hangup: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-600',
};

const labels: Record<string, string> = {
  emergency: 'Emergency',
  routine: 'Routine',
  message: 'Message',
  wrong_number: 'Wrong Number',
  hangup: 'Hangup',
  unknown: 'Unknown',
};

export default function CallTypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type] || colors.unknown}`}>
      {labels[type] || type}
    </span>
  );
}
