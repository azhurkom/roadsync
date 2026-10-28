'use client';

import * as React from 'react';
import Image from 'next/image';
import { Camera, Image as ImageIcon, Loader2, XCircle, ExternalLink, ScanLine, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';
import DocumentScanner, { DocumentScannerRef } from './document-scanner';

interface PhotoInputProps {
  /** Called with the uploaded file URL (e.g. /api/files/uuid) or null when cleared */
  onFileUploaded: (url: string | null) => void;
  promptText?: string;
  enableScanner?: boolean;
}

export default function PhotoInput({
  onFileUploaded,
  promptText = 'Додати фото',
  enableScanner = false,
}: PhotoInputProps) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const scannerRef = React.useRef<DocumentScannerRef>(null);

  const [preview, setPreview] = React.useState<string | null>(null);
  const [isPdf, setIsPdf] = React.useState(false);
  const [uploadedUrl, setUploadedUrl] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const isFilePdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    setIsPdf(isFilePdf);

    if (isFilePdf) {
      setPreview('pdf');
      toast({ title: 'Завантаження PDF документа...', description: 'Будь ласка, зачекайте.' });
    } else {
      const reader = new FileReader();
      reader.onload = e => { if (e.target?.result) setPreview(e.target.result as string); };
      reader.readAsDataURL(file);
      toast({ title: 'Завантаження фото...', description: 'Будь ласка, зачекайте.' });
    }

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
      toast({ title: isFilePdf ? 'PDF документ збережено!' : 'Фото збережено!' });
    } catch (error: unknown) {
      const err = error as Error;
      setPreview(null);
      setIsPdf(false);
      toast({
        variant: 'destructive',
        title: 'Помилка завантаження',
        description: err.message || 'Не вдалося завантажити файл.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // If file is already a PDF, upload it directly
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      await uploadFile(file);
      event.target.value = '';
      return;
    }

    // If scanner is enabled, send image directly into auto-scanner
    if (enableScanner && scannerRef.current) {
      scannerRef.current.addFile(file);
      event.target.value = '';
      return;
    }

    // Otherwise standard direct upload
    await uploadFile(file);
    event.target.value = '';
  };

  const handleScanComplete = async (pdfFile: File) => {
    await uploadFile(pdfFile);
  };

  const handleClear = () => {
    setPreview(null);
    setIsPdf(false);
    setUploadedUrl(null);
    onFileUploaded(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <Label>{promptText}</Label>

      {preview ? (
        <div className="relative w-full aspect-video rounded-md overflow-hidden border bg-muted/30">
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
              <div className="w-12 h-12 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center">
                <FileText className="h-7 w-7" />
              </div>
              <span className="text-xs font-semibold text-foreground">PDF документ збережено</span>
              <span className="text-[11px] text-muted-foreground">Готово до перегляду та надсилання</span>
            </div>
          ) : (
            <Image src={preview} alt="Попередній перегляд" fill style={{ objectFit: 'cover' }} />
          )}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {!isUploading && (
            <div className="absolute top-2 right-2 flex gap-1">
              {uploadedUrl && (
                <a href={uploadedUrl.replace('/api/files/', '/files/')} target="_blank" rel="noopener noreferrer">
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
              type="button"
              variant="outline"
              className="w-full h-20 border-dashed"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                {enableScanner ? <ScanLine className="h-6 w-6 text-primary" /> : <Camera className="h-6 w-6" />}
                <span className="text-sm">{enableScanner ? 'Сканувати (PDF)' : 'Зробити фото'}</span>
              </div>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-20 border-dashed"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isUploading}
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

      {/* Interactive document scanner modal */}
      {enableScanner && (
        <DocumentScanner
          open={isScannerOpen}
          onOpenChange={setIsScannerOpen}
          onScanComplete={handleScanComplete}
          scannerRef={scannerRef}
        />
      )}

      <input type="file" ref={cameraInputRef} onChange={handleFileChange} className="hidden" accept="image/*" capture="environment" />
      <input type="file" ref={galleryInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />
    </div>
  );
}
