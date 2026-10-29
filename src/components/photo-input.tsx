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
  onFileUploaded?: (url: string | null) => void;
  /** Called with array of uploaded file URLs when multiple=true */
  onFilesUploaded?: (urls: string[]) => void;
  promptText?: string;
  enableScanner?: boolean;
  multiple?: boolean;
  /** Optional suffix for B2 S3 naming mask: 'tr' -> yymmddnn_tr.jpeg, 'lkw' -> yymmddnn_lkw.jpeg */
  fileSuffix?: 'tr' | 'lkw';
}

interface UploadedItem {
  preview: string;
  url: string;
}

function convertImageToJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 2048;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, '') || 'photo';
            resolve(new File([blob], `${baseName}.jpeg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.9
        );
      } catch (e) {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export default function PhotoInput({
  onFileUploaded,
  onFilesUploaded,
  promptText = 'Додати фото',
  enableScanner = false,
  multiple = false,
  fileSuffix,
}: PhotoInputProps) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const scannerRef = React.useRef<DocumentScannerRef>(null);

  // Single mode state
  const [preview, setPreview] = React.useState<string | null>(null);
  const [isPdf, setIsPdf] = React.useState(false);
  const [uploadedUrl, setUploadedUrl] = React.useState<string | null>(null);

  // Multi mode state
  const [multiItems, setMultiItems] = React.useState<UploadedItem[]>([]);

  const [isUploading, setIsUploading] = React.useState(false);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);

  const uploadSingleFileToServer = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileSuffix) {
      formData.append('suffix', fileSuffix);
    }

    const res = await fetch('/api/files', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const { url } = await res.json();
    return url as string;
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const isFilePdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    setIsPdf(isFilePdf);

    if (isFilePdf) {
      setPreview('pdf');
      toast({ title: 'Завантаження PDF документа...', description: 'Будь ласка, зачекайте.' });
    } else {
      const dataUrl = await readAsDataURL(file);
      if (dataUrl) setPreview(dataUrl);
      toast({ title: 'Завантаження фото...', description: 'Будь ласка, зачекайте.' });
    }

    try {
      const fileToUpload = !isFilePdf && fileSuffix ? await convertImageToJpeg(file) : file;
      const url = await uploadSingleFileToServer(fileToUpload);
      setUploadedUrl(url);
      onFileUploaded?.(url);
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

  const uploadMultipleFiles = async (files: FileList) => {
    setIsUploading(true);
    toast({ title: 'Завантаження фото...', description: 'Будь ласка, зачекайте.' });

    try {
      const newAdded: UploadedItem[] = [];
      for (const rawFile of Array.from(files)) {
        const jpegFile = await convertImageToJpeg(rawFile);
        const previewDataUrl = await readAsDataURL(jpegFile);
        const url = await uploadSingleFileToServer(jpegFile);
        newAdded.push({ preview: previewDataUrl, url });
      }
      setMultiItems((prev) => {
        const next = [...prev, ...newAdded];
        onFilesUploaded?.(next.map((i) => i.url));
        return next;
      });
      toast({ title: newAdded.length > 1 ? `Збережено фото (${newAdded.length})!` : 'Фото збережено!' });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: 'destructive',
        title: 'Помилка завантаження',
        description: err.message || 'Не вдалося завантажити фото.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (multiple) {
      await uploadMultipleFiles(files);
      event.target.value = '';
      return;
    }

    const file = files[0];

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
    onFileUploaded?.(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleRemoveMultiItem = (index: number) => {
    setMultiItems((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      onFilesUploaded?.(next.map((i) => i.url));
      return next;
    });
  };

  if (multiple) {
    return (
      <div className="space-y-2">
        <Label>{promptText}</Label>

        {multiItems.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {multiItems.map((item, idx) => (
              <div key={item.url || idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted/30">
                <Image src={item.preview} alt={`Фото ${idx + 1}`} fill style={{ objectFit: 'cover' }} />
                <div className="absolute top-1 right-1 flex gap-1">
                  <a href={item.url.replace('/api/files/', '/files/')} target="_blank" rel="noopener noreferrer">
                    <Button type="button" variant="secondary" size="icon" className="h-6 w-6 rounded-full">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-6 w-6 rounded-full"
                    onClick={() => handleRemoveMultiItem(idx)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

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
                <Camera className="h-6 w-6" />
                <span className="text-sm">Зробити фото</span>
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

        <input
          type="file"
          ref={cameraInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
          capture="environment"
        />
        <input
          type="file"
          ref={galleryInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
          multiple
        />
      </div>
    );
  }

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
