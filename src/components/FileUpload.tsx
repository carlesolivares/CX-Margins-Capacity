import { useCallback, useState } from 'react';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FileUploadProps {
  label: string;
  description: string;
  accept: string;
  onFile: (file: File) => Promise<void>;
}

export function FileUpload({ label, description, accept, onFile }: FileUploadProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setStatus('loading');
    setMessage('Processing...');
    try {
      await onFile(file);
      setStatus('success');
      setMessage(`Imported: ${file.name}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Import failed');
    }
  }, [onFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div
      className={`file-upload ${dragOver ? 'drag-over' : ''} ${status}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        id={`upload-${label.replace(/\s/g, '-')}`}
        hidden
      />
      <label htmlFor={`upload-${label.replace(/\s/g, '-')}`} className="upload-label">
        <Upload size={24} />
        <div className="upload-text">
          <strong>{label}</strong>
          <span>{description}</span>
        </div>
      </label>
      {message && (
        <div className={`upload-message ${status}`}>
          {status === 'error' && <AlertCircle size={16} />}
          {status === 'success' && <CheckCircle2 size={16} />}
          {message}
        </div>
      )}
    </div>
  );
}
