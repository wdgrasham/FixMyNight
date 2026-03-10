import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image } from 'lucide-react';

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.docx';
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 10;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file: File) {
  if (file.type.startsWith('image/')) return <Image className="h-4 w-4 text-[#64748B]" />;
  return <FileText className="h-4 w-4 text-[#64748B]" />;
}

export default function FileUpload({ files, onFilesChange }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(newFiles);

    // Validate types
    const invalid = incoming.filter(f => !ACCEPTED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      setError(`Unsupported file type: ${invalid[0].name}. Accepted: PDF, JPG, PNG, HEIC, DOCX.`);
      return;
    }

    // Validate count
    if (files.length + incoming.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    // Validate total size
    const newTotal = totalSize + incoming.reduce((s, f) => s + f.size, 0);
    if (newTotal > MAX_TOTAL_SIZE) {
      setError(`Total file size exceeds 20 MB limit.`);
      return;
    }

    onFilesChange([...files, ...incoming]);
  }, [files, totalSize, onFilesChange]);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  return (
    <div>
      <label className="block text-sm font-medium text-[#0F172A] mb-2">
        Upload Supporting Documents <span className="text-[#94A3B8] font-normal">(optional)</span>
      </label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[#F59E0B] bg-[#FFFBEB]'
            : 'border-[#CBD5E1] hover:border-[#94A3B8] bg-white'
        }`}
      >
        <Upload className={`h-8 w-8 mx-auto mb-3 ${dragOver ? 'text-[#F59E0B]' : 'text-[#94A3B8]'}`} />
        <p className="text-sm text-[#64748B]">
          <span className="font-medium text-[#0F172A]">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-[#94A3B8] mt-1">
          PDF, JPG, PNG, HEIC, DOCX &mdash; max 20 MB total, up to 10 files
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-3 bg-[#F8FAFC] rounded-lg px-3 py-2 border border-[#E2E8F0]">
              {getFileIcon(file)}
              <span className="text-sm text-[#0F172A] truncate flex-1">{file.name}</span>
              <span className="text-xs text-[#94A3B8] shrink-0">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="text-[#94A3B8] hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-[#94A3B8]">
            {files.length} file{files.length !== 1 ? 's' : ''} &middot; {formatSize(totalSize)} total
          </p>
        </div>
      )}
    </div>
  );
}
