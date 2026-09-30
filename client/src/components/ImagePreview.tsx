import { useEffect, useRef, useState } from "react";
import {
  IconZoomIn,
  IconZoomOut,
  IconMaximize,
  IconX,
  IconFile,
  IconTrash,
  IconPhoto,
} from "@tabler/icons-react";

interface ImagePreviewProps {
  title: string;
  imageUrl: string | null;
  emptyText: string;
  meta?: string | null;
  file?: File | null;
  actions?: React.ReactNode;
  onRemove?: () => void;
  isProcessing?: boolean;
  resultType?: string;
}

export function ImagePreview({
  title,
  imageUrl,
  emptyText,
  meta,
  file,
  actions,
  onRemove,
  isProcessing = false,
  resultType = "",
}: ImagePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image dimensions
  useEffect(() => {
    if (!imageUrl || imageError) return;

    const img = new Image();
    img.onload = () => {
      setImageDims({ width: img.width, height: img.height });
      setImageError(false);
    };
    img.onerror = () => setImageError(true);
    img.src = imageUrl;
  }, [imageUrl]);

  const zoomIn = () => setZoom((z) => Math.min(z * 1.2, 5));
  const zoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.2));
  const resetZoom = () => setZoom(1);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
  };

  useEffect(() => {
    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const isPdf = file?.type === "application/pdf" || file?.name?.toLowerCase().endsWith(".pdf");
  const isZip = resultType === "application/zip";

  if (isFullscreen && imageUrl && !isPdf && !isZip) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} fullscreen`}
        onClick={() => setIsFullscreen(false)}
      >
        <button
          className="absolute top-5 right-5 glass-highlight rounded-full size-12 bg-white/10 text-white hover:bg-white/20 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }}
          aria-label="Close fullscreen"
        >
          <IconX className="size-6" aria-hidden="true" />
        </button>
        <div
          className="relative max-h-[90vh] max-w-[90vw]"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          onWheel={handleWheel}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`${title} fullscreen`}
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />
        </div>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3">
          <button
            className="glass-highlight rounded-full size-10 bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); zoomOut(); }}
            aria-label="Zoom out"
          >
            <IconZoomOut className="size-5" aria-hidden="true" />
          </button>
          <span className="text-white/80 text-sm font-mono w-16 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="glass-highlight rounded-full size-10 bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); zoomIn(); }}
            aria-label="Zoom in"
          >
            <IconZoomIn className="size-5" aria-hidden="true" />
          </button>
          <button
            className="glass-highlight rounded-full size-10 bg-white/10 text-white hover:bg-white/20 transition-colors ml-2"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            aria-label="Reset zoom"
          >
            <IconMaximize className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass flex flex-col overflow-hidden h-full min-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/20 bg-gradient-to-r from-primary/10 to-transparent px-5 py-3.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
          {title}
        </span>
        <div className="flex items-center gap-2">
          {meta && <span className="text-xs text-muted-foreground font-mono">{meta}</span>}
          {imageDims && !isPdf && !isZip && (
            <span className="text-xs text-muted-foreground font-mono">
              {imageDims.width} × {imageDims.height}
            </span>
          )}
          {file && !isPdf && !isZip && (
            <button
              className="glass-control rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/30 transition-colors"
              onClick={() => setIsFullscreen(true)}
              aria-label="View fullscreen"
            >
              <IconMaximize className="size-4" aria-hidden="true" />
            </button>
          )}
          {actions}
          {onRemove && (
            <button
              className="glass-control rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={onRemove}
              aria-label={`Remove ${title.toLowerCase()} image`}
            >
              <IconTrash className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Image Area */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center bg-black/5 p-4 relative overflow-hidden"
        onWheel={handleWheel}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <svg className="size-16 text-primary animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="31.4 31.4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">Processing…</p>
            <p className="text-sm text-muted-foreground">Please wait while we process your image</p>
          </div>
        ) : imageUrl && !isPdf && !isZip ? (
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`${title} preview`}
            className="max-h-full max-w-full object-contain cursor-zoom-in transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
            onClick={() => setIsFullscreen(true)}
          />
        ) : isPdf ? (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="grid size-20 place-items-center rounded-2xl bg-red-500/20 text-red-500">
              <IconFile className="size-10" aria-hidden="true" />
            </div>
            <div className="max-w-xs">
              <p className="text-lg font-medium text-foreground">PDF Document</p>
              <p className="mt-1 text-sm text-muted-foreground">{file?.name || "Processed PDF"}</p>
              {meta && <p className="mt-1 text-xs text-muted-foreground/70">{meta}</p>}
            </div>
          </div>
        ) : isZip ? (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="grid size-20 place-items-center rounded-2xl bg-blue-500/20 text-blue-500">
              <IconFile className="size-10" aria-hidden="true" />
            </div>
            <div className="max-w-xs">
              <p className="text-lg font-medium text-foreground">ZIP Archive</p>
              <p className="mt-1 text-sm text-muted-foreground">All pages converted</p>
              {meta && <p className="mt-1 text-xs text-muted-foreground/70">{meta}</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="grid size-16 place-items-center rounded-full bg-white/10 text-muted-foreground/60">
              <IconPhoto className="size-8" aria-hidden="true" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
      </div>

      {/* Zoom controls when not fullscreen */}
      {imageUrl && !isPdf && !isZip && zoom !== 1 && !isFullscreen && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 glass-highlight rounded-full px-3 py-1.5 bg-white/20 border-white/30 shadow-lg">
          <button
            className="text-white/90 hover:text-white transition-colors"
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <IconZoomOut className="size-4" aria-hidden="true" />
          </button>
          <span className="text-white/90 text-sm font-mono w-14 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="text-white/90 hover:text-white transition-colors"
            onClick={zoomIn}
            aria-label="Zoom in"
          >
            <IconZoomIn className="size-4" aria-hidden="true" />
          </button>
          <button
            className="text-white/90 hover:text-white transition-colors ml-1"
            onClick={resetZoom}
            aria-label="Reset zoom"
          >
            <IconMaximize className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}