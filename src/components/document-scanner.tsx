'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Camera,
  Crop,
  Check,
  RotateCw,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  CornerPoints,
  Point,
  detectDocumentCorners,
  warpPerspective,
  applyScanFilter,
  createPdfFromPages,
} from '@/lib/scanner-utils';

export interface DocumentScannerRef {
  addFile: (file: File) => void;
}

interface DocumentScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoked when user completes scanning and generates the multi-page PDF File */
  onScanComplete: (pdfFile: File) => void;
  scannerRef?: React.RefObject<DocumentScannerRef | null>;
}

interface ScannedPage {
  originalImage: HTMLImageElement;
  corners: CornerPoints;
  rotation: number; // 0, 90, 180, 270
  processedCanvas: HTMLCanvasElement;
}

export default function DocumentScanner({
  open,
  onOpenChange,
  onScanComplete,
  scannerRef,
}: DocumentScannerProps) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const [pages, setPages] = React.useState<ScannedPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = React.useState<number>(0);
  const [activeStep, setActiveStep] = React.useState<'preview' | 'crop'>('preview');
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  // Active corner drag state
  const [activeCorner, setActiveCorner] = React.useState<'tl' | 'tr' | 'br' | 'bl' | null>(null);
  const [currentCorners, setCurrentCorners] = React.useState<CornerPoints | null>(null);

  // Process a raw image file into a scanned B&W page
  const processImageFile = React.useCallback((file: File) => {
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Downscale image if exceptionally huge to keep mobile snappy (< 1920px)
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;
        let scale = 1;
        if (w > maxDim || h > maxDim) {
          scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const normCanvas = document.createElement('canvas');
        normCanvas.width = w;
        normCanvas.height = h;
        const ctx = normCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);

        const scaledImg = new Image();
        scaledImg.onload = () => {
          // 1. Auto-detect document corners
          const corners = detectDocumentCorners(scaledImg);
          setCurrentCorners(corners);

          // 2. Warp perspective to rectangular page
          const initialWarp = warpPerspective(scaledImg, corners);

          // 3. Apply high-contrast Grayscale filter ("Сірий")
          const initialProcessed = applyScanFilter(initialWarp, 'grayscale');

          const newPage: ScannedPage = {
            originalImage: scaledImg,
            corners,
            rotation: 0,
            processedCanvas: initialProcessed,
          };

          setPages((prev) => {
            const updated = [...prev, newPage];
            setCurrentPageIndex(updated.length - 1);
            return updated;
          });

          setActiveStep('preview');
          setIsProcessing(false);
          onOpenChange(true);
        };
        scaledImg.src = normCanvas.toDataURL('image/jpeg', 0.92);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [onOpenChange]);

  // Expose addFile method to parent via ref
  React.useEffect(() => {
    if (scannerRef) {
      scannerRef.current = {
        addFile: (file: File) => {
          processImageFile(file);
        },
      };
    }
  }, [scannerRef, processImageFile]);

  // Handle capture for additional pages
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  const currentPage = pages[currentPageIndex];

  // Draw crop UI overlay if user chooses manual adjustment
  React.useEffect(() => {
    if (activeStep !== 'crop' || !currentPage || !currentCorners || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = currentPage.originalImage;

    canvas.width = img.width;
    canvas.height = img.height;

    // Draw base image
    ctx.drawImage(img, 0, 0);

    // Dark semi-transparent mask outside crop area
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear polygon for quad
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(currentCorners.tl.x, currentCorners.tl.y);
    ctx.lineTo(currentCorners.tr.x, currentCorners.tr.y);
    ctx.lineTo(currentCorners.br.x, currentCorners.br.y);
    ctx.lineTo(currentCorners.bl.x, currentCorners.bl.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw border polygon
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = Math.max(3, Math.round(canvas.width / 250));
    ctx.beginPath();
    ctx.moveTo(currentCorners.tl.x, currentCorners.tl.y);
    ctx.lineTo(currentCorners.tr.x, currentCorners.tr.y);
    ctx.lineTo(currentCorners.br.x, currentCorners.br.y);
    ctx.lineTo(currentCorners.bl.x, currentCorners.bl.y);
    ctx.closePath();
    ctx.stroke();

    // Draw corner circular handles
    const radius = Math.max(16, Math.round(canvas.width / 45));
    const handleCorners = [
      { key: 'tl', p: currentCorners.tl },
      { key: 'tr', p: currentCorners.tr },
      { key: 'br', p: currentCorners.br },
      { key: 'bl', p: currentCorners.bl },
    ];

    handleCorners.forEach(({ p }) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(4, radius / 4);

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius / 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [activeStep, currentPage, currentCorners]);

  // Handle touch / mouse pointer events on the crop canvas
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!currentCorners) return;
    const p = getCanvasCoords(e);
    if (!p) return;

    const hitRadius = (canvasRef.current?.width || 1000) / 12;
    const corners = currentCorners;
    const dists: Array<{ key: 'tl' | 'tr' | 'br' | 'bl'; d: number }> = [
      { key: 'tl', d: Math.hypot(p.x - corners.tl.x, p.y - corners.tl.y) },
      { key: 'tr', d: Math.hypot(p.x - corners.tr.x, p.y - corners.tr.y) },
      { key: 'br', d: Math.hypot(p.x - corners.br.x, p.y - corners.br.y) },
      { key: 'bl', d: Math.hypot(p.x - corners.bl.x, p.y - corners.bl.y) },
    ];

    dists.sort((a, b) => a.d - b.d);
    if (dists[0].d < hitRadius) {
      setActiveCorner(dists[0].key);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!activeCorner || !currentCorners || !canvasRef.current) return;
    const p = getCanvasCoords(e);
    if (!p) return;

    const canvasW = canvasRef.current.width;
    const canvasH = canvasRef.current.height;
    const minSize = 40;

    const { tl, tr, br, bl } = currentCorners;

    // Linearly adjust box width & height so the crop remains a true rectangle
    if (activeCorner === 'tl') {
      const newX = Math.max(0, Math.min(p.x, tr.x - minSize));
      const newY = Math.max(0, Math.min(p.y, bl.y - minSize));
      setCurrentCorners({
        tl: { x: newX, y: newY },
        tr: { x: tr.x, y: newY },
        br: { x: br.x, y: br.y },
        bl: { x: newX, y: bl.y },
      });
    } else if (activeCorner === 'tr') {
      const newX = Math.min(canvasW, Math.max(p.x, tl.x + minSize));
      const newY = Math.max(0, Math.min(p.y, br.y - minSize));
      setCurrentCorners({
        tl: { x: tl.x, y: newY },
        tr: { x: newX, y: newY },
        br: { x: newX, y: br.y },
        bl: { x: bl.x, y: bl.y },
      });
    } else if (activeCorner === 'br') {
      const newX = Math.min(canvasW, Math.max(p.x, bl.x + minSize));
      const newY = Math.min(canvasH, Math.max(p.y, tr.y + minSize));
      setCurrentCorners({
        tl: { x: tl.x, y: tl.y },
        tr: { x: newX, y: tl.y },
        br: { x: newX, y: newY },
        bl: { x: bl.x, y: newY },
      });
    } else if (activeCorner === 'bl') {
      const newX = Math.max(0, Math.min(p.x, br.x - minSize));
      const newY = Math.min(canvasH, Math.max(p.y, tl.y + minSize));
      setCurrentCorners({
        tl: { x: newX, y: tl.y },
        tr: { x: tr.x, y: tl.y },
        br: { x: tr.x, y: newY },
        bl: { x: newX, y: newY },
      });
    }
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
  };

  // Re-process current page with updated manual corners
  const applyManualCrop = () => {
    if (!currentPage || !currentCorners) return;

    setIsProcessing(true);
    setTimeout(() => {
      const warped = warpPerspective(currentPage.originalImage, currentCorners);
      const filtered = applyScanFilter(warped, 'grayscale');

      setPages((prev) => {
        const next = [...prev];
        next[currentPageIndex] = {
          ...currentPage,
          corners: currentCorners,
          processedCanvas: filtered,
        };
        return next;
      });

      setActiveStep('preview');
      setIsProcessing(false);
    }, 40);
  };

  // Rotate processed page by 90 degrees
  const handleRotatePage = () => {
    if (!currentPage) return;
    const src = currentPage.processedCanvas;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = src.height;
    rotCanvas.height = src.width;
    const ctx = rotCanvas.getContext('2d')!;

    ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);

    setPages((prev) => {
      const next = [...prev];
      next[currentPageIndex] = {
        ...currentPage,
        rotation: (currentPage.rotation + 90) % 360,
        processedCanvas: rotCanvas,
      };
      return next;
    });
  };

  // Delete current page
  const handleDeletePage = () => {
    if (pages.length <= 1) {
      setPages([]);
      setCurrentCorners(null);
      onOpenChange(false);
      return;
    }

    const nextPages = pages.filter((_, idx) => idx !== currentPageIndex);
    const nextIdx = Math.max(0, currentPageIndex - 1);
    setPages(nextPages);
    setCurrentPageIndex(nextIdx);
    setCurrentCorners(nextPages[nextIdx].corners);
  };

  // Finish scanning and assemble into PDF
  const handleFinishScan = async () => {
    if (pages.length === 0) return;

    setIsProcessing(true);
    try {
      const canvasPages = pages.map((p) => p.processedCanvas);
      const pdfFile = await createPdfFromPages(canvasPages);
      onScanComplete(pdfFile);
      onOpenChange(false);
      setPages([]);
      setCurrentCorners(null);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] p-0 flex flex-col gap-0 overflow-hidden rounded-xl bg-card border">
        {/* Header */}
        <DialogHeader className="p-3.5 border-b bg-muted/40 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {activeStep === 'crop'
                  ? 'Підлаштувати кути документа'
                  : `Скан документа (${currentPageIndex + 1} з ${pages.length})`}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Формат: Сірий (PDF)</p>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 p-3 flex flex-col items-center justify-center overflow-y-auto min-h-[380px] max-h-[70vh] bg-zinc-950/5 relative">
          {isProcessing && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Обробка сторінки...</span>
            </div>
          )}

          {/* Interactive Corner Quad Cropping (Manual adjustment) */}
          {activeStep === 'crop' && (
            <div
              ref={containerRef}
              className="relative w-full flex items-center justify-center select-none touch-none overflow-hidden max-h-[64vh]"
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            >
              <canvas
                ref={canvasRef}
                className="max-h-[62vh] max-w-full w-auto h-auto rounded border shadow-md object-contain cursor-crosshair"
              />
            </div>
          )}

          {/* Scanned Preview: Sharp B&W Document */}
          {activeStep === 'preview' && currentPage && (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="relative border rounded-lg overflow-hidden shadow-lg max-h-[54vh] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentPage.processedCanvas.toDataURL('image/jpeg', 0.88)}
                  alt="Сканована сторінка"
                  className="max-h-[52vh] max-w-full w-auto object-contain mx-auto"
                />
              </div>

              {/* Action buttons for current page */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentCorners(currentPage.corners);
                    setActiveStep('crop');
                  }}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Crop className="h-3.5 w-3.5" />
                  Підправити кути
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotatePage}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Повернути
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeletePage}
                  className="h-8 text-destructive hover:bg-destructive/10 gap-1 text-xs"
                  title="Видалити сторінку"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Multiple pages thumbnails selector if > 1 page */}
              {pages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
                  {pages.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCurrentPageIndex(idx);
                        setCurrentCorners(p.corners);
                      }}
                      className={`relative w-11 h-14 rounded border-2 overflow-hidden transition-all shrink-0 ${
                        idx === currentPageIndex ? 'border-primary ring-2 ring-primary/30' : 'border-muted opacity-70'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.processedCanvas.toDataURL('image/jpeg', 0.5)}
                        alt={`Стор. ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center font-bold">
                        {idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hidden inputs for + Додати сторінку */}
        <input
          type="file"
          ref={cameraInputRef}
          onChange={handlePhotoCapture}
          className="hidden"
          accept="image/*"
          capture="environment"
        />
        <input
          type="file"
          ref={galleryInputRef}
          onChange={handlePhotoCapture}
          className="hidden"
          accept="image/*"
        />

        {/* Footer Navigation */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex flex-row items-center justify-between sm:justify-between gap-2">
          {activeStep === 'crop' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActiveStep('preview')}
              >
                Скасувати
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={applyManualCrop}
                className="gap-1.5"
              >
                <Check className="h-4 w-4" />
                Застосувати кути
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  className="gap-1 text-xs h-9"
                >
                  <Camera className="h-3.5 w-3.5" />
                  + Сторінка (камера)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => galleryInputRef.current?.click()}
                  className="gap-1 text-xs h-9"
                  title="Додати з галереї"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  + З галереї
                </Button>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={handleFinishScan}
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-9 px-4"
              >
                <Check className="h-4 w-4" />
                Зберегти PDF ({pages.length})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
