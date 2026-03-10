import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react';

export interface AudioClip {
  blob: Blob;
  url: string;
  duration: number;
}

interface AudioRecorderProps {
  clips: AudioClip[];
  onClipsChange: (clips: AudioClip[]) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioRecorder({ clips, onClipsChange }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      clips.forEach(c => URL.revokeObjectURL(c.url));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const duration = (Date.now() - startTimeRef.current) / 1000;
        onClipsChange([...clips, { blob, url, duration }]);
      };

      mediaRecorder.start(250);
      startTimeRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startTimeRef.current) / 1000);
      }, 200);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, [clips, onClipsChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setElapsed(0);
  }, []);

  const removeClip = (index: number) => {
    URL.revokeObjectURL(clips[index].url);
    onClipsChange(clips.filter((_, i) => i !== index));
    if (playingIndex === index) {
      audioRef.current?.pause();
      setPlayingIndex(null);
    }
  };

  const togglePlay = (index: number) => {
    if (playingIndex === index) {
      audioRef.current?.pause();
      setPlayingIndex(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(clips[index].url);
    audio.onended = () => setPlayingIndex(null);
    audio.play();
    audioRef.current = audio;
    setPlayingIndex(index);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[#0F172A] mb-2">
        Record Voice Description <span className="text-[#94A3B8] font-normal">(optional)</span>
      </label>

      {/* Record button */}
      <div className="flex items-center gap-4">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <Square className="h-4 w-4" />
            Stop Recording
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-[#CBD5E1] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:border-[#F59E0B] hover:bg-[#FFFBEB] transition-colors"
          >
            <Mic className="h-4 w-4 text-[#F59E0B]" />
            Record Audio
          </button>
        )}

        {/* Live recording indicator */}
        {recording && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-medium text-red-600">{formatDuration(elapsed)}</span>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Clips list */}
      {clips.length > 0 && (
        <div className="mt-3 space-y-2">
          {clips.map((clip, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#F8FAFC] rounded-lg px-3 py-2 border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => togglePlay(i)}
                className="text-[#F59E0B] hover:text-[#D97706] transition-colors"
              >
                {playingIndex === i ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <span className="text-sm text-[#0F172A]">Recording {i + 1}</span>
              <span className="text-xs text-[#94A3B8]">{formatDuration(clip.duration)}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => removeClip(i)}
                className="text-[#94A3B8] hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
