const colors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  inactive: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.inactive}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
