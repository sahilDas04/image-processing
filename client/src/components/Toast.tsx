import { useEffect, useState, createContext } from "react";
import { IconCheck, IconAlertCircle, IconX, IconInfoCircle, IconLoader } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "loading";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    if (toast.type !== "loading" && toast.duration !== 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration ?? 4000);
    }

    return id;
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const dismissAll = () => {
    setToasts([]);
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, dismissAll }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

import { useContext } from "react";

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  const dismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  useEffect(() => {
    if (toast.type !== "loading" && toast.duration !== 0) {
      const timer = setTimeout(dismiss, toast.duration ?? 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, toast.type]);

  const typeStyles = {
    success: "bg-green-500/95 border-green-400/30",
    error: "bg-red-500/95 border-red-400/30",
    info: "bg-blue-500/95 border-blue-400/30",
    loading: "bg-primary/95 border-primary/30",
  };

  const icons = {
    success: <IconCheck className="size-5 text-white" aria-hidden="true" />,
    error: <IconAlertCircle className="size-5 text-white" aria-hidden="true" />,
    info: <IconInfoCircle className="size-5 text-white" aria-hidden="true" />,
    loading: <IconLoader className="size-5 text-white animate-spin" aria-hidden="true" />,
  };

  return (
    <div
      className={cn(
        "pointer-events-auto glass-highlight flex items-start gap-3 rounded-2xl border shadow-lg p-4 min-w-[300px] max-w-md animate-slide-in",
        isExiting && "animate-slide-out",
        typeStyles[toast.type],
      )}
      role="alert"
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{toast.title}</p>
        {toast.message && (
          <p className="mt-1 text-sm text-white/90">{toast.message}</p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-white/70 hover:text-white transition-colors"
        aria-label="Dismiss notification"
      >
        <IconX className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}