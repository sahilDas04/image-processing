import { IconLoader, IconCheck, IconAlertCircle, IconWand } from "@tabler/icons-react";

export type ProcessingState = "idle" | "processing" | "success" | "error";

interface ProcessingStatusProps {
  state: ProcessingState;
  message?: string;
  onRetry?: () => void;
  onProcessAnother?: () => void;
}

export function ProcessingStatus({ state, message, onRetry, onProcessAnother }: ProcessingStatusProps) {
  if (state === "idle") return null;

  return (
    <div className="animate-slide-in glass-highlight rounded-2xl p-6 text-center" role="status" aria-live="polite">
      {state === "processing" && (
        <div className="flex flex-col items-center gap-4">
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
            <span className="absolute inset-0 flex items-center justify-center">
              <IconWand className="size-8 text-primary/50" aria-hidden="true" />
            </span>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Processing Image</p>
            <p className="mt-1 text-sm text-muted-foreground">{message || "Please wait while we apply the selected operation…"}</p>
          </div>
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-green-500/20 text-green-500">
            <IconCheck className="size-8" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Processing Complete</p>
            <p className="mt-1 text-sm text-muted-foreground">{message || "Your image has been processed successfully"}</p>
          </div>
          {onProcessAnother && (
            <button
              type="button"
              onClick={onProcessAnother}
              className="mt-4 glass-highlight flex items-center gap-2 rounded-full px-5 py-2.5 font-medium text-foreground bg-white/30 border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all"
            >
              <IconWand className="size-4" aria-hidden="true" />
              Process Another
            </button>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-red-500/20 text-red-500">
            <IconAlertCircle className="size-8" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Processing Failed</p>
            <p className="mt-1 text-sm text-destructive">{message || "An error occurred while processing the image"}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 glass-highlight flex items-center gap-2 rounded-full px-5 py-2.5 font-medium text-white bg-gradient-to-r from-primary to-primary/80 shadow-[0_4px_16px_rgba(90,70,160,0.35)] hover:from-primary/90 hover:to-primary/70 transition-all"
            >
              <IconLoader className="size-4" aria-hidden="true" />
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}