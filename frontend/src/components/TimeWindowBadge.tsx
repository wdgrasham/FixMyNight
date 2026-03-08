const colors: Record<string, string> = {
  business_hours: 'bg-green-100 text-green-700',
  evening: 'bg-amber-100 text-amber-700',
  sleep: 'bg-indigo-100 text-indigo-700',
};

const labels: Record<string, string> = {
  business_hours: 'Business',
  evening: 'Evening',
  sleep: 'Sleep',
};

export default function TimeWindowBadge({ window }: { window: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[window] || 'bg-gray-100 text-gray-600'}`}>
      {labels[window] || window}
    </span>
  );
}
