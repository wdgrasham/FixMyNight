import { useState, useRef } from 'react';

export default function PlayButton({ url, compact }: { url: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.addEventListener('ended', () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <button
      onClick={toggle}
      title={playing ? 'Pause' : 'Play recording'}
      className={`inline-flex items-center justify-center rounded-full transition-colors ${
        compact
          ? 'h-6 w-6 text-gray-400 hover:text-[#F59E0B] hover:bg-amber-50'
          : 'h-7 w-7 text-gray-500 hover:text-[#F59E0B] hover:bg-amber-50'
      }`}
    >
      {playing ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}>
          <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}>
          <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
        </svg>
      )}
    </button>
  );
}
