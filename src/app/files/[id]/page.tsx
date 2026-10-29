'use client';

import * as React from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Share2, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface LoadedFileItem {
  id: string;
  blob: Blob;
  isPdf: boolean;
  imgUrl: string | null;
  filename: string;
}

function PdfCanvasViewer({ blob, onError }: { blob: Blob; onError: () => void }) {
  const pagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
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
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, onError]);

  return <div ref={pagesRef} className="w-full" />;
}

export default function FileViewerPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const primaryId = params?.id as string;
  const { toast } = useToast();

  const fileIds = React.useMemo(() => {
    const idsParam = searchParams?.get('ids');
    if (idsParam) {
      const parsed = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (parsed.length > 0) return parsed;
    }
    return primaryId ? [primaryId] : [];
  }, [primaryId, searchParams]);

  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<LoadedFileItem[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const extOf = (b: Blob) => (b.type.split('/')[1] || 'jpeg').split('+')[0];

  React.useEffect(() => {
    if (fileIds.length === 0) return;
    const objectUrls: string[] = [];
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    (async () => {
      try {
        const loaded: LoadedFileItem[] = [];
        for (const fid of fileIds) {
          const res = await fetch(`/api/files/${fid}`, { credentials: 'same-origin' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const disp = res.headers.get('content-disposition') || '';
          const match = disp.match(/filename="([^"]+)"/);
          const headerName = match ? decodeURIComponent(match[1]) : '';
          const b = await res.blob();
          if (cancelled) return;
          const isPdf = b.type.includes('application/pdf');
          let imgUrl: string | null = null;
          if (!isPdf) {
            imgUrl = URL.createObjectURL(b);
            objectUrls.push(imgUrl);
          }
          const filename = headerName || `document-${fid}.${extOf(b)}`;
          loaded.push({ id: fid, blob: b, isPdf, imgUrl, filename });
        }
        if (!cancelled) setItems(loaded);
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
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIds.join(',')]);

  const handleShare = async () => {
    if (items.length === 0) return;
    setSharing(true);
    try {
      const files = items.map(
        (it) => new File([it.blob], it.filename, { type: it.blob.type || 'image/jpeg' })
      );
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: 'Документ RoadSync',
          text: 'Документ з каденції RoadSync',
        });
      } else {
        await navigator.share({ url: window.location.href, title: 'Документ RoadSync' });
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name !== 'AbortError') {
        toast({
          variant: 'destructive',
          title: 'Помилка надсилання',
          description: error?.message || 'Не вдалося поділитися файлом.',
        });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    if (items.length === 0) return;
    setDownloading(true);
    try {
      items.forEach((it, idx) => {
        setTimeout(() => {
          const url = window.URL.createObjectURL(it.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = it.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        }, idx * 250);
      });
    } catch (err: unknown) {
      const error = err as Error;
      toast({
        variant: 'destructive',
        title: 'Помилка завантаження',
        description: error?.message || 'Не вдалося зберегти файл.',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white selection:bg-zinc-800">
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
          <span className="font-semibold text-sm tracking-wide text-zinc-200">
            {items.length > 1 ? `Перегляд фото (${items.length})` : 'Перегляд документа'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            disabled={sharing || loading || items.length === 0}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full"
            title="Поділитися"
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={downloading || loading || items.length === 0}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full"
            title="Завантажити"
          >
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
        <div className="relative w-full max-w-4xl mx-auto space-y-4">
          {items.map((it, idx) => (
            <div key={it.id} className="w-full">
              {items.length > 1 && (
                <div className="text-xs text-zinc-400 mb-1 px-1">
                  Фото {idx + 1} з {items.length} ({it.filename})
                </div>
              )}
              {it.isPdf ? (
                <PdfCanvasViewer blob={it.blob} onError={() => setFailed(true)} />
              ) : (
                it.imgUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={it.imgUrl}
                    alt={it.filename}
                    onError={() => setFailed(true)}
                    className="mx-auto max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl border border-zinc-800/30"
                  />
                )
              )}
            </div>
          ))}
          {failed && !loading && (
            <p className="text-center text-sm text-zinc-400 py-10">Не вдалося відобразити документ</p>
          )}
        </div>
      </main>
    </div>
  );
}
