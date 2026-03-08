interface Props {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start justify-between">
      <p className="text-sm text-red-700">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-4 text-red-400 hover:text-red-600 text-sm">
          &times;
        </button>
      )}
    </div>
  );
}
