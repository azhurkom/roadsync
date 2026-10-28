import { jsPDF } from 'jspdf';

export interface Point {
  x: number;
  y: number;
}

export interface CornerPoints {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type ScanFilter = 'color' | 'bw' | 'grayscale' | 'original';

/**
 * Calculates Euclidean distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Automatically detects the 4 corners of a document in an image.
 * Uses contrast analysis and edge scanning from borders to locate the document paper quad.
 */
export function detectDocumentCorners(
  sourceCanvasOrImage: HTMLCanvasElement | HTMLImageElement
): CornerPoints {
  const naturalW = 'naturalWidth' in sourceCanvasOrImage ? sourceCanvasOrImage.naturalWidth : sourceCanvasOrImage.width;
  const naturalH = 'naturalHeight' in sourceCanvasOrImage ? sourceCanvasOrImage.naturalHeight : sourceCanvasOrImage.height;

  // Fallback default corners (3% margin)
  const defaultCorners: CornerPoints = {
    tl: { x: Math.round(naturalW * 0.03), y: Math.round(naturalH * 0.03) },
    tr: { x: Math.round(naturalW * 0.97), y: Math.round(naturalH * 0.03) },
    br: { x: Math.round(naturalW * 0.97), y: Math.round(naturalH * 0.97) },
    bl: { x: Math.round(naturalW * 0.03), y: Math.round(naturalH * 0.97) },
  };

  try {
    // Downscale for fast edge detection (< 300px)
    const targetW = 200;
    const scale = targetW / naturalW;
    const targetH = Math.round(naturalH * scale);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = targetW;
    smallCanvas.height = targetH;
    const sCtx = smallCanvas.getContext('2d');
    if (!sCtx) return defaultCorners;

    sCtx.drawImage(sourceCanvasOrImage, 0, 0, targetW, targetH);
    const imgData = sCtx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // Convert to grayscale & compute average luminance
    const gray = new Uint8Array(targetW * targetH);
    let totalLum = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[j] = lum;
      totalLum += lum;
    }
    const avgLum = totalLum / gray.length;

    // Paper threshold (paper is typically lighter than background in truck cab / table)
    // If image is very bright overall, adjust threshold
    const paperThreshold = Math.max(90, Math.min(210, avgLum * 1.05));

    // Find bounding edges by scanning from borders inwards
    let top = Math.round(targetH * 0.03);
    let bottom = Math.round(targetH * 0.97);
    let left = Math.round(targetW * 0.03);
    let right = Math.round(targetW * 0.97);

    // Top scan
    for (let y = Math.round(targetH * 0.02); y < targetH * 0.4; y++) {
      let paperCount = 0;
      for (let x = Math.round(targetW * 0.2); x < targetW * 0.8; x++) {
        if (gray[y * targetW + x] >= paperThreshold) paperCount++;
      }
      if (paperCount > (targetW * 0.6) * 0.45) {
        top = Math.max(0, y - 2);
        break;
      }
    }

    // Bottom scan
    for (let y = Math.round(targetH * 0.98); y > targetH * 0.6; y--) {
      let paperCount = 0;
      for (let x = Math.round(targetW * 0.2); x < targetW * 0.8; x++) {
        if (gray[y * targetW + x] >= paperThreshold) paperCount++;
      }
      if (paperCount > (targetW * 0.6) * 0.45) {
        bottom = Math.min(targetH, y + 2);
        break;
      }
    }

    // Left scan
    for (let x = Math.round(targetW * 0.02); x < targetW * 0.4; x++) {
      let paperCount = 0;
      for (let y = Math.round(targetH * 0.2); y < targetH * 0.8; y++) {
        if (gray[y * targetW + x] >= paperThreshold) paperCount++;
      }
      if (paperCount > (targetH * 0.6) * 0.45) {
        left = Math.max(0, x - 2);
        break;
      }
    }

    // Right scan
    for (let x = Math.round(targetW * 0.98); x > targetW * 0.6; x--) {
      let paperCount = 0;
      for (let y = Math.round(targetH * 0.2); y < targetH * 0.8; y++) {
        if (gray[y * targetW + x] >= paperThreshold) paperCount++;
      }
      if (paperCount > (targetH * 0.6) * 0.45) {
        right = Math.min(targetW, x + 2);
        break;
      }
    }

    // Validate detected area (must cover reasonable document area)
    const detectedW = right - left;
    const detectedH = bottom - top;
    if (detectedW < targetW * 0.35 || detectedH < targetH * 0.35) {
      return defaultCorners;
    }

    // Map back to natural dimensions
    const invScale = 1 / scale;
    return {
      tl: { x: Math.max(0, Math.round(left * invScale)), y: Math.max(0, Math.round(top * invScale)) },
      tr: { x: Math.min(naturalW, Math.round(right * invScale)), y: Math.max(0, Math.round(top * invScale)) },
      br: { x: Math.min(naturalW, Math.round(right * invScale)), y: Math.min(naturalH, Math.round(bottom * invScale)) },
      bl: { x: Math.max(0, Math.round(left * invScale)), y: Math.min(naturalH, Math.round(bottom * invScale)) },
    };
  } catch (err) {
    console.warn('Auto-corner detection fallback:', err);
    return defaultCorners;
  }
}

/**
 * Estimate initial 4 corners of an image with default margins (e.g. 5-10% from edges).
 */
export function detectDefaultCorners(width: number, height: number): CornerPoints {
  const marginX = width * 0.03;
  const marginY = Math.min(height * 0.03, marginX);
  return {
    tl: { x: marginX, y: marginY },
    tr: { x: width - marginX, y: marginY },
    br: { x: width - marginX, y: height - marginY },
    bl: { x: marginX, y: height - marginY },
  };
}

/**
 * Solves a 3x3 projective transformation matrix (homography) mapping
 * arbitrary quad (p0, p1, p2, p3) to rectangle (0,0)-(W,H).
 */
function getProjectiveTransform(
  src: [Point, Point, Point, Point],
  dstWidth: number,
  dstHeight: number
): number[] {
  // src points: tl, tr, br, bl
  const [p0, p1, p2, p3] = src;
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  let g = 0;
  let h = 0;

  if (sx === 0 && sy === 0) {
    // Affine
    return [
      (x1 - x0) / dstWidth, (x3 - x0) / dstHeight, x0,
      (y1 - y0) / dstWidth, (y3 - y0) / dstHeight, y0,
      0, 0, 1
    ];
  }

  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) > 1e-10) {
    g = ((sx * dy2 - sy * dx2) / det) / dstWidth;
    h = ((dx1 * sy - dy1 * sx) / det) / dstHeight;
  }

  const a = (x1 - x0 + g * dstWidth * x1) / dstWidth;
  const b = (x3 - x0 + h * dstHeight * x3) / dstHeight;
  const c = x0;
  const d = (y1 - y0 + g * dstWidth * y1) / dstWidth;
  const e = (y3 - y0 + h * dstHeight * y3) / dstHeight;
  const f = y0;

  return [a, b, c, d, e, f, g, h, 1];
}

/**
 * Perspective warp of an image given 4 corners into a flattened rectangular canvas.
 */
export function warpPerspective(
  sourceCanvasOrImage: HTMLCanvasElement | HTMLImageElement,
  corners: CornerPoints,
  targetWidth?: number,
  targetHeight?: number
): HTMLCanvasElement {
  const { tl, tr, br, bl } = corners;

  // Determine width and height of output rectangle based on corners
  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const outWidth = Math.round(targetWidth || Math.max(widthTop, widthBottom));

  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);
  const outHeight = Math.round(targetHeight || Math.max(heightLeft, heightRight));

  // Source canvas to read pixel data from
  let srcCanvas: HTMLCanvasElement;
  let srcCtx: CanvasRenderingContext2D;

  if (sourceCanvasOrImage instanceof HTMLCanvasElement) {
    srcCanvas = sourceCanvasOrImage;
    srcCtx = srcCanvas.getContext('2d')!;
  } else {
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = sourceCanvasOrImage.naturalWidth || sourceCanvasOrImage.width;
    srcCanvas.height = sourceCanvasOrImage.naturalHeight || sourceCanvasOrImage.height;
    srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(sourceCanvasOrImage, 0, 0);
  }

  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sPixels = srcData.data;
  const sWidth = srcCanvas.width;
  const sHeight = srcCanvas.height;

  // Destination canvas
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outWidth;
  dstCanvas.height = outHeight;
  const dstCtx = dstCanvas.getContext('2d')!;
  const dstData = dstCtx.createImageData(outWidth, outHeight);
  const dPixels = dstData.data;

  // Matrix mapping (u, v) in dst to (x, y) in src
  const M = getProjectiveTransform([tl, tr, br, bl], outWidth, outHeight);

  // Bilinear interpolation mapping
  let dIndex = 0;
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const denom = M[6] * x + M[7] * y + M[8];
      if (denom === 0) {
        dIndex += 4;
        continue;
      }
      const sx = (M[0] * x + M[1] * y + M[2]) / denom;
      const sy = (M[3] * x + M[4] * y + M[5]) / denom;

      if (sx >= 0 && sx < sWidth - 1 && sy >= 0 && sy < sHeight - 1) {
        const x0 = Math.floor(sx);
        const x1 = x0 + 1;
        const y0 = Math.floor(sy);
        const y1 = y0 + 1;

        const wx = sx - x0;
        const wy = sy - y0;

        const idx00 = (y0 * sWidth + x0) * 4;
        const idx10 = (y0 * sWidth + x1) * 4;
        const idx01 = (y1 * sWidth + x0) * 4;
        const idx11 = (y1 * sWidth + x1) * 4;

        for (let c = 0; c < 3; c++) {
          const top = sPixels[idx00 + c] * (1 - wx) + sPixels[idx10 + c] * wx;
          const bottom = sPixels[idx01 + c] * (1 - wx) + sPixels[idx11 + c] * wx;
          dPixels[dIndex + c] = Math.round(top * (1 - wy) + bottom * wy);
        }
        dPixels[dIndex + 3] = 255;
      } else {
        dPixels[dIndex] = 255;
        dPixels[dIndex + 1] = 255;
        dPixels[dIndex + 2] = 255;
        dPixels[dIndex + 3] = 255;
      }
      dIndex += 4;
    }
  }

  dstCtx.putImageData(dstData, 0, 0);
  return dstCanvas;
}

/**
 * Applies original clean grayscale filter ("Сірий").
 * Converts to smooth photographic grayscale with a gentle paper brightness lift,
 * preserving all table grids, text, carbon-copy prints, stamps, and signatures.
 */
export function applyScanFilter(canvas: HTMLCanvasElement, filter: ScanFilter = 'grayscale'): HTMLCanvasElement {
  if (filter === 'original') return canvas;

  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Brighten background paper gently
    gray = Math.min(255, gray * 1.15 + 10);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Creates a single multi-page PDF document from array of processed canvas pages.
 * Resizes pages cleanly to standard A4 (portrait or landscape depending on aspect ratio).
 */
export async function createPdfFromPages(pages: HTMLCanvasElement[]): Promise<File> {
  if (pages.length === 0) {
    throw new Error('Немає сторінок для створення PDF');
  }

  // A4 dimensions in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach((pageCanvas, index) => {
    if (index > 0) {
      const isLandscape = pageCanvas.width > pageCanvas.height;
      pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
    }

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Convert canvas to compressed JPEG data URL for embedding into PDF
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.82);

    // Compute aspect ratio fitting A4 with 5mm margins
    const margin = 5;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const imgAspect = pageCanvas.width / pageCanvas.height;
    const maxAspect = maxWidth / maxHeight;

    let finalW = maxWidth;
    let finalH = maxHeight;

    if (imgAspect > maxAspect) {
      finalW = maxWidth;
      finalH = maxWidth / imgAspect;
    } else {
      finalH = maxHeight;
      finalW = maxHeight * imgAspect;
    }

    const posX = margin + (maxWidth - finalW) / 2;
    const posY = margin + (maxHeight - finalH) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, finalW, finalH, undefined, 'FAST');
  });

  const pdfBlob = pdf.output('blob');
  const filename = `document-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}.pdf`;

  return new File([pdfBlob], filename, { type: 'application/pdf' });
}
