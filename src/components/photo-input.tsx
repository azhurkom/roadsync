'use client';

import * as React from 'react';
import Image from 'next/image';
import { Camera, Image as ImageIcon, Loader2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';

interface PhotoInputProps {
  /** Called with the uploaded file URL (e.g. /api/files/uuid) or null when cleared */
  onFileUploaded: (url: string | null) => void;
  promptText?: string;
}

export default function PhotoInput({ onFileUploaded, promptText = 'Додати фото' }: PhotoInputProps) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) setPreview(e.target.result as string); };
    reader.readAsDataURL(file);

    setIsUploading(true);
    toast({ title: 'Завантаження фото...', description: 'Будь ласка, зачекайте.' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      setUploadedUrl(url);
      onFileUploaded(url);
      toast({ title: 'Фото збережено!' });
    } catch (error: unknown) {
      const err = error as Error;
      setPreview(null);
      toast({
        variant: 'destructive',
        title: 'Помилка завантаження',
        description: err.message || 'Не вдалося завантажити фото.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setUploadedUrl(null);
    onFileUploaded(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <Label>{promptText}</Label>

      {preview ? (
        <div className="relative w-full aspect-video rounded-md overflow-hidden border">
          <Image src={preview} alt="Попередній перегляд" fill style={{ objectFit: 'cover' }} />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {!isUploading && (
            <div className="absolute top-2 right-2 flex gap-1">
              {uploadedUrl && (
                <a href={uploadedUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
              <Button type="button" variant="destructive" size="icon" className="h-7 w-7 rounded-full" onClick={handleClear}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button" variant="outline" className="w-full h-20 border-dashed"
              onClick={() => cameraInputRef.current?.click()} disabled={isUploading}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span className="text-sm">Зробити фото</span>
              </div>
            </Button>
            <Button
              type="button" variant="outline" className="w-full h-20 border-dashed"
              onClick={() => galleryInputRef.current?.click()} disabled={isUploading}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <span className="text-sm">З галереї</span>
              </div>
            </Button>
          </div>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm rounded-md">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>
      )}

      <input type="file" ref={cameraInputRef} onChange={handleFileChange} className="hidden" accept="image/*" capture="environment" />
      <input type="file" ref={galleryInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
    </div>
  );
}
