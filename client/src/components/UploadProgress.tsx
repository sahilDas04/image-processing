import { useEffect, useRef, useState } from "react";
import { IconX, IconLoader, IconCheck, IconAlertCircle, IconPlayerPlay } from "@tabler/icons-react";
import { cn, formatBytes, formatSpeed, formatTime } from "@/lib/utils";

interface UploadProgressProps {
  /** Upload progress 0-100 */
  progress: number;
  /** Bytes uploaded so far */
  uploadedBytes: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Current upload speed in bytes/second */
  speed: number;
  /** File name */
  fileName: string;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Whether upload completed successfully */
  isComplete?: boolean;
  /** Whether upload failed */
  isError?: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Callback to cancel upload */
  onCancel: () => void;
  /** Callback to retry upload */
  onRetry?: () => void;
  /** Callback to pause/resume upload */
  onPause?: () => void;
  /** Whether upload is paused */
  isPaused?: boolean;
}

export function UploadProgress({
  progress,
  uploadedBytes,
  totalBytes,
  speed,
  fileName,
  isUploading,
  isComplete = false,
  isError = false,
  errorMessage,
  onCancel,
  onRetry,
  onPause,
  isPaused = false,
}: UploadProgressProps) {
  const speedRef = useRef(speed);
  const timeRef = useRef(Date.now());
  const [displaySpeed, setDisplaySpeed] = useState(speed);
  const [eta, setEta] = useState<number>(0);

  // Smooth speed calculation and ETA
  useEffect(() => {
    speedRef.current = speed;
    const now = Date.now();
    const elapsed = (now - timeRef.current) / 1000;
    if (elapsed > 0.5 && speed > 0) {
      setDisplaySpeed(speed);
      const remaining = totalBytes - uploadedBytes;
      setEta(remaining / speed);
    }
    timeRef.current = now;
  }, [speed, uploadedBytes, totalBytes]);

  const progressPercent = Math.min(100, Math.max(0, progress));

  if (!isUploading && !isComplete && !isError) {
    return null;
  }

  return (
    <div className="animate-slide-in">
      {/* File Header */}
      <div className="glass-highlight rounded-2xl border border-white/40 p-4 bg-gradient-to-br from-white/25 to-white/15 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shrink-0">
              {isComplete ? (
                <IconCheck className="size-5" aria-hidden="true" />
              ) : isError ? (
                <IconAlertCircle className="size-5" aria-hidden="true" />
              ) : (
                <IconLoader className="size-5 animate-spin" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {isComplete
                  ? "Upload complete"
                  : isError
                    ? "Upload failed"
                    : isPaused
                      ? "Upload paused"
                      : "Uploading…"}
              </p>
            </div>
          </div>
          {!isComplete && !isError && (
            <button
              onClick={onCancel}
              className="glass-control rounded-xl p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              aria-label="Cancel upload"
            >
              <IconX className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{Math.round(progressPercent)}%</span>
          <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
        </div>
        <div className="relative h-2.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300 ease-out",
              isError ? "bg-destructive" : isComplete ? "bg-primary" : "bg-gradient-to-r from-primary to-primary/80",
            )}
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="glass-control rounded-xl p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Speed</p>
            <p className="font-mono text-sm text-foreground">{displaySpeed > 0 ? formatSpeed(displaySpeed) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Elapsed</p>
            <p className="font-mono text-sm text-foreground">
              {isUploading || isComplete || isError ? formatTime((Date.now() - timeRef.current) / 1000) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="font-mono text-sm text-foreground">
              {isUploading && displaySpeed > 0 && !isPaused ? formatTime(eta) : isPaused ? "Paused" : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-mono text-sm text-foreground">
              {isComplete ? "Done" : isError ? "Failed" : isPaused ? "Paused" : "Active"}
            </p>
          </div>
        </div>
      </div>

      {/* Error Message & Retry */}
      {isError && errorMessage && (
        <div className="mt-3 glass-highlight rounded-xl border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <IconAlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      {(isError || isPaused) && !isComplete && (
        <div className="mt-3 flex items-center gap-2">
          {isPaused && onPause && (
            <button
              onClick={onPause}
              className="glass-highlight flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium text-foreground bg-white/30 border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all"
              type="button"
            >
              <IconPlayerPlay className="size-4" aria-hidden="true" />
              <span>Resume</span>
            </button>
          )}
          {isError && onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition-all",
                "bg-gradient-to-r from-primary to-primary/80 text-white shadow-[0_4px_16px_rgba(90,70,160,0.35)] hover:from-primary/90 hover:to-primary/70",
              )}
              type="button"
            >
              <IconLoader className="size-4" aria-hidden="true" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Complete Actions */}
      {isComplete && (
        <div className="mt-3 glass-highlight flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium text-foreground bg-white/30 border-white/40 shadow-sm">
          <IconCheck className="size-4 text-green-500" aria-hidden="true" />
          <span className="text-green-600 dark:text-green-400">Upload complete — ready to process</span>
        </div>
      )}
    </div>
  );
}