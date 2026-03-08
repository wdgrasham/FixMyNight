interface Props {
  status: 'idle' | 'saving' | 'saved' | 'error';
}

export default function SaveIndicator({ status }: Props) {
  if (status === 'idle') return null;

  const styles: Record<string, string> = {
    saving: 'text-brand',
    saved: 'text-green-600',
    error: 'text-red-600',
  };

  const labels: Record<string, string> = {
    saving: 'Saving...',
    saved: 'Saved',
    error: 'Failed to save',
  };

  return (
    <span className={`text-sm font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
