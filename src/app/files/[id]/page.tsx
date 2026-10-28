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
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const pagesRef = React.useRef<HTMLDivElement>(null);

  const fileUrl = `/api/files/${id}`;
  const isPdf = !!blob && blob.type.includes('application/pdf');

  // Load the file once (GET, with session cookie) and detect type from the real blob
  React.useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const b = await res.blob();
        if (cancelled) return;
        setBlob(b);
        if (!b.type.includes('application/pdf')) {
          objectUrl = URL.createObjectURL(b);
          setImgUrl(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося завантажити файл' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Render PDF pages onto canvases (works in Android/Telegram WebView, no iframe needed)
  React.useEffect(() => {
    if (!isPdf || !blob) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        const container = pagesRef.current;
        if (!container) return;
        container.innerHTML = '';
        const width = container.clientWidth || 800;
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.className = 'mb-2 rounded-md bg-white shadow-2xl';
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPdf, blob]);

  const extOf = (b: Blob) => (b.type.split('/')[1] || 'jpg').split('+')[0];

  const handleShare = async () => {
    if (!blob) return;
    setSharing(true);
    try {
      const mimeType = blob.type || 'image/jpeg';
      const file = new File([blob], `document-${id}.${extOf(blob)}`, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Документ RoadSync', text: 'Документ з каденції RoadSync' });
      } else {
        await navigator.share({ url: window.location.href, title: 'Документ RoadSync' });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast({ variant: 'destructive', title: 'Помилка надсилання', description: err.message || 'Не вдалося поділитися файлом.' });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    if (!blob) return;
    setDownloading(true);
    try {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${id}.${extOf(blob)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Помилка завантаження', description: err.message || 'Не вдалося зберегти файл.' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white selection:bg-zinc-800">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm tracking-wide text-zinc-200">Перегляд документа</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleShare} disabled={sharing || loading || !blob} className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full" title="Поділитися">
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDownload} disabled={downloading || loading || !blob} className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full" title="Завантажити">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-2 sm:p-4 relative bg-zinc-950">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )}
        <div className="relative w-full max-w-4xl mx-auto">
          {isPdf ? (
            <div ref={pagesRef} className="w-full" />
          ) : (
            imgUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imgUrl}
                alt="Документ"
                onError={() => setFailed(true)}
                className="mx-auto max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl border border-zinc-800/30"
              />
            )
          )}
          {failed && !loading && <p className="text-center text-sm text-zinc-400 py-10">Не вдалося відобразити документ</p>}
        </div>
      </main>
    </div>
  );
}
