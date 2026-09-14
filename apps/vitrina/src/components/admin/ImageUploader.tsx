'use client';

import { useRef, useState } from 'react';
import { ImageOff, Loader2, Upload } from 'lucide-react';

export function ImageUploader({
  value,
  onUpload,
  disabled,
}: {
  value: string | null;
  onUpload: (file: File) => Promise<string>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen.');
      return;
    }

    setError(null);
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      const uploadedUrl = await onUpload(file);
      setPreview(uploadedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
      setPreview(value);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- la vista previa local usa blob:, que next/image no puede optimizar.
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <div>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {preview ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {error ? <p className="mt-1 text-xs font-medium text-red-500">{error}</p> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
