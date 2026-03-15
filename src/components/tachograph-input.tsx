'use client';

import * as React from 'react';
import Image from 'next/image';
import { Camera, CheckCircle, Copy, Loader2, MapPin, XCircle, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type TachographData = {
  odometer: string;
  location: string;
  coords: { lat: number; lon: number } | null;
  photo: File | null;
};

interface TachographInputProps {
  onDataExtracted: (data: TachographData) => void;
}

export default function TachographInput({ onDataExtracted }: TachographInputProps) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [data, setData] = React.useState<TachographData>({
    odometer: '', location: '', coords: null, photo: null,
  });

  React.useEffect(() => { onDataExtracted(data); }, [data, onDataExtracted]);

  const handleManualInput = () => {
    if (!preview && !data.location && !isProcessing) {
      setIsProcessing(true);
      processGeolocation();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setData(prev => ({ ...prev, photo: file }));

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) {
        setIsProcessing(false);
        toast({ variant: 'destructive', title: 'Помилка читання файлу' });
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1280;
        let { width, height } = img;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        const dataUri = canvas.toDataURL(file.type || 'image/jpeg', 0.9);
        setPreview(dataUri);
        processImage(dataUri);
      };
      img.onerror = () => {
        setIsProcessing(false);
        toast({ variant: 'destructive', title: 'Помилка зображення' });
      };
      img.src = e.target.result as string;
    };
    reader.onerror = () => {
      setIsProcessing(false);
      toast({ variant: 'destructive', title: 'Помилка читання файлу' });
    };
    reader.readAsDataURL(file);

    processGeolocation();
  };

  const processImage = async (dataUri: string) => {
    try {
      const res = await fetch('/api/ai/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUri: dataUri }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      if (result.odometerReading) {
        setData(prev => ({ ...prev, odometer: result.odometerReading }));
      }
    } catch (error: any) {
      const is429 = error?.message?.includes('429') || error?.message?.includes('Quota');
      toast({
        variant: 'destructive',
        title: 'Помилка OCR',
        description: is429
          ? 'Перевищено ліміт запитів до AI. Будь ласка, зачекайте хвилину та спробуйте знову.'
          : 'Не вдалося зчитати одометр. Будь ласка, введіть його вручну.',
      });
    }
  };

  const processGeolocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setData(prev => ({ ...prev, coords: { lat: latitude, lon: longitude } }));
        try {
          const res = await fetch('/api/ai/geolocate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude, longitude }),
          });
          if (!res.ok) throw new Error(await res.text());
          const result = await res.json();
          if (result.city) {
            setData(prev => ({ ...prev, location: result.city }));
          }
        } catch (error: any) {
          const is429 = error?.message?.includes('429') || error?.message?.includes('Quota');
          toast({
            variant: 'destructive',
            title: 'Помилка геолокації',
            description: is429
              ? 'Перевищено ліміт запитів до AI. Будь ласка, зачекайте хвилину та спробуйте знову.'
              : 'Не вдалося визначити місто. Будь ласка, введіть його вручну.',
          });
        } finally {
          setIsProcessing(false);
        }
      },
      (error) => {
        console.error('Geolocation API Error:', error);
        toast({
          variant: 'destructive',
          title: 'Помилка місцезнаходження',
          description: 'Не вдалося отримати ваше місцезнаходження. Будь ласка, увімкніть служби геолокації.',
        });
        setIsProcessing(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCopyCoords = () => {
    if (data.coords) {
      navigator.clipboard.writeText(`${data.coords.lat},${data.coords.lon}`);
      toast({ title: 'Координати скопійовано!' });
    }
  };

  const handleClear = () => {
    setPreview(null);
    setData({ odometer: '', location: '', coords: null, photo: null });
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative w-full aspect-video rounded-md overflow-hidden border">
          <Image src={preview} alt="Попередній перегляд тахографа" fill style={{ objectFit: 'cover' }} />
          <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full" onClick={handleClear}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="w-full h-20 border-dashed" onClick={() => cameraInputRef.current?.click()} disabled={isProcessing}>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span className="text-sm">Зробити фото</span>
              </div>
            </Button>
            <Button type="button" variant="outline" className="w-full h-20 border-dashed" onClick={() => galleryInputRef.current?.click()} disabled={isProcessing}>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <span className="text-sm">З галереї</span>
              </div>
            </Button>
          </div>
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm rounded-md">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>
      )}

      <input type="file" ref={cameraInputRef} onChange={handleFileChange} className="hidden" accept="image/*" capture="environment" />
      <input type="file" ref={galleryInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Input
            value={data.odometer}
            onChange={e => setData(prev => ({ ...prev, odometer: e.target.value }))}
            onFocus={handleManualInput}
            placeholder="Одометр"
            disabled={isProcessing}
            className="pl-8"
          />
          <CheckCircle className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        </div>
        <div className="relative">
          <Input
            value={data.location}
            onChange={e => setData(prev => ({ ...prev, location: e.target.value }))}
            placeholder="Місцезнаходження"
            disabled={isProcessing}
            className="pl-8"
          />
          <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
          {data.coords && (
            <Button size="icon" variant="ghost" className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleCopyCoords}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
