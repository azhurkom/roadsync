'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Share2, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function FileViewerPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [isPdf, setIsPdf] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const imageUrl = `/api/files/${id}`;

  React.useEffect(() => {
    // Probe content type
    fetch(imageUrl, { method: 'HEAD' })
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/pdf')) {
          setIsPdf(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, [imageUrl]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Не вдалося завантажити файл для спільного доступу');
      const blob = await response.blob();
      
      // Determine file extension and mime type
      const mimeType = blob.type || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'jpg';
      const filename = `document-${id}.${ext}`;
      
      const file = new File([blob], filename, { type: mimeType });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Документ RoadSync',
          text: 'Документ з каденції RoadSync',
        });
      } else {
        // Fallback if file sharing not supported: share URL
        await navigator.share({
          url: window.location.href,
          title: 'Документ RoadSync',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Помилка надсилання',
        description: err.message || 'Не вдалося поділитися файлом.',
      });
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Не вдалося завантажити файл');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const mimeType = blob.type || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'jpg';
      a.download = `document-${id}.${ext}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Помилка завантаження',
        description: err.message || 'Не вдалося зберегти файл.',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white selection:bg-zinc-800">
      {/* Premium Header with blur effect */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm tracking-wide text-zinc-200">Перегляд документа</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            disabled={sharing || loading}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full"
            title="Поділитися"
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={downloading || loading}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full"
            title="Завантажити"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Image or PDF Container */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4 relative overflow-hidden bg-zinc-950">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )}
        <div className="relative w-full h-[85vh] flex items-center justify-center max-w-4xl mx-auto rounded-lg overflow-hidden">
          {isPdf ? (
            <iframe
              src={imageUrl}
              title="PDF Документ"
              className="w-full h-full rounded-md border border-zinc-800/40 bg-white"
              onLoad={() => setLoading(false)}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt="Документ"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося відобразити зображення' });
              }}
              className="max-w-full max-h-[82vh] object-contain transition-all duration-500 ease-out animate-in fade-in zoom-in-95 rounded-md shadow-2xl border border-zinc-800/30"
            />
          )}
        </div>
      </main>
    </div>
  );
}
