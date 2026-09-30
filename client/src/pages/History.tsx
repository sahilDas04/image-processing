import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDownload,
  IconHistory,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconFileText,
  IconPhoto,
  IconPackage,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

import { Navbar } from "@/components";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { formatBytes, cn } from "@/lib/utils";

const OPERATION_LABELS: Record<string, string> = {
  compress: "Compress",
  convert: "Convert format",
  grayscale: "Grayscale",
  blur: "Blur",
  sharpen: "Sharpen",
  enhance: "Enhance",
  rotate: "Rotate",
  resize: "Resize",
  reduce_size: "Reduce size",
  from_pdf: "PDF to images",
  to_pdf: "Images to PDF",
};

interface Variant {
  id: string;
  operation: string;
  params: Record<string, unknown> | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface Job {
  id: string;
  operation: string;
  params: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  variants: Variant[];
}

interface HistoryResponse {
  items: Job[];
  total: number;
  skip: number;
  limit: number;
}

function operationIcon(operation: string): React.ReactNode {
  switch (operation) {
    case "to_pdf":
      return <IconFileText className="size-5" aria-hidden="true" />;
    case "from_pdf":
      return <IconFile className="size-5" aria-hidden="true" />;
    case "compress":
    case "reduce_size":
    case "convert":
      return <IconPackage className="size-5" aria-hidden="true" />;
    default:
      return <IconPhoto className="size-5" aria-hidden="true" />;
  }
}

function variantExtension(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/zip") return "zip";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function canPreview(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function JobVariantPreview({ job, variant }: { job: Job; variant: Variant }) {
  const previewQuery = useQuery({
    queryKey: ["history-preview", job.id, variant.id],
    queryFn: async () => {
      const res = await api.get<Blob>(
        `/api/v1/history/${job.id}/preview`,
        { params: variant ? { variant_id: variant.id } : {}, responseType: "blob" },
      );
      return URL.createObjectURL(res.data);
    },
    enabled: canPreview(variant.mime_type),
  });

  const previewUrl = previewQuery.data;

  useEffect(() => {
    return () => {
      if (previewQuery.data) URL.revokeObjectURL(previewQuery.data);
    };
  }, [previewQuery.data]);

  if (!canPreview(variant.mime_type) || previewQuery.isError) {
    return (
      <div
        className="grid aspect-square w-20 shrink-0 place-items-center rounded-2xl border border-white/40 bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {operationIcon(job.operation)}
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div
        className="aspect-square w-20 shrink-0 animate-pulse rounded-2xl border border-white/40 bg-white/10"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={previewUrl}
      alt={`${OPERATION_LABELS[job.operation] ?? job.operation} result preview`}
      className="aspect-square w-20 shrink-0 rounded-2xl border border-white/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}

export default function HistoryPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(25);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const historyQuery = useQuery({
    queryKey: ["history", skip, limit],
    queryFn: () =>
      api.get<HistoryResponse>("/api/v1/history", {
        params: { skip, limit },
      }),
    select: (res) => res.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => api.delete(`/api/v1/history/${jobId}`),
    onSuccess: (_data, jobId) => {
      queryClient.setQueryData<HistoryResponse>(
        ["history", skip, limit],
        (prev) =>
          prev ? { ...prev, items: prev.items.filter((j) => j.id !== jobId), total: prev.total - 1 } : prev,
      );
      showToast({ type: "success", title: "Deleted", message: "History entry removed." });
    },
    onError: () => {
      showToast({ type: "error", title: "Delete failed", message: "Could not delete this entry." });
    },
  });

  const handleDelete = useCallback((job: Job) => {
    const label = OPERATION_LABELS[job.operation] ?? job.operation;
    if (window.confirm(`Delete this ${label} entry from your history? This cannot be undone.`)) {
      deleteMutation.mutate(job.id);
    }
  }, [deleteMutation]);

  const jobs = historyQuery.data?.items ?? null;
  const total = historyQuery.data?.total ?? 0;
  const isLoading = historyQuery.isPending;
  const error = historyQuery.isError ? "Could not load your history. Please try again." : null;

  const page = Math.floor(skip / limit);
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const downloadVariant = useCallback(async (job: Job, variantId?: string) => {
    try {
      const res = await api.get<Blob>(
        `/api/v1/history/${job.id}/download`,
        { params: variantId ? { variant_id: variantId } : {}, responseType: "blob" },
      );
      const headerType = res.headers["content-type"];
      const type =
        typeof headerType === "string" ? headerType : "application/octet-stream";
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ext = variantExtension(type);
      const operation = OPERATION_LABELS[job.operation] ?? "result";
      link.download = `${operation.replace(/\s+/g, "-").toLowerCase()}-result.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      historyQuery.refetch();
    }
  }, [historyQuery]);

  return (
    <main className="page-bg relative min-h-svh text-foreground">
      <Navbar />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24 pt-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Processing History</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Your previous conversions and edits, ready to download again.
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span>{error}</span>
            <button type="button" onClick={() => historyQuery.refetch()} className="flex items-center gap-1 font-medium hover:underline">
              <IconRefresh className="size-4" aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        {isLoading && jobs === null ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-muted-foreground">
            <span className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
            <p className="text-sm">Loading your history…</p>
          </div>
        ) : jobs === null || jobs.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl glass-strong border border-white/40 py-16 px-6 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary" aria-hidden="true">
              <IconHistory className="size-7" />
            </div>
            <h2 className="text-lg font-semibold">No history yet</h2>
            <p className="text-sm text-muted-foreground">
              Processed images will show up here so you can re-download them anytime.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-3xl glass-strong border border-white/40 p-5 shadow-[0_8px_32px_rgba(90,70,160,0.08)]"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary" aria-hidden="true">
                      {operationIcon(job.operation)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-base font-semibold">
                          {OPERATION_LABELS[job.operation] ?? job.operation}
                        </h3>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            job.status === "completed"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : job.status === "error"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-amber-500/15 text-amber-300",
                          )}
                        >
                          {job.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                      {job.error_message && (
                        <p className="mt-1 text-xs text-red-300">{job.error_message}</p>
                      )}
                      {job.status === "completed" && job.variants.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {job.variants.map((variant) => (
                            <JobVariantPreview key={variant.id} job={job} variant={variant} />
                          ))}
                        </div>
                      )}
                    </div>

                    {job.status === "completed" && job.variants.length > 0 && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {job.variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => downloadVariant(job, job.variants.length === 1 ? undefined : variant.id)}
                            className="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:bg-white/30 hover:border-white/60"
                            aria-label={`Download ${OPERATION_LABELS[job.operation] ?? "result"} (${variantExtension(variant.mime_type)}, ${formatBytes(variant.size_bytes)})`}
                          >
                            <IconDownload className="size-3.5" aria-hidden="true" />
                            {variantExtension(variant.mime_type)} · {formatBytes(variant.size_bytes)}
                            {job.variants.length > 1 && <span className="sr-only">{variant.id}</span>}
                            {job.variants.length > 1 && (
                              <span className="rounded bg-white/20 px-1 text-[10px]">
                                {variant.width && variant.height ? `${variant.width}×${variant.height}` : "multi"}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(job)}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 shadow-sm transition-all hover:bg-red-500/20 hover:border-red-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete ${OPERATION_LABELS[job.operation] ?? "result"} from history`}
                      >
                        <IconTrash className="size-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSkip((s) => Math.max(0, s - limit))}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-full border border-white/40 bg-white/20 px-4 py-2 text-sm font-medium shadow-sm transition-all hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconChevronLeft className="size-4" aria-hidden="true" /> Previous
              </button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
              <button
                type="button"
                onClick={() => setSkip((s) => s + limit)}
                disabled={skip + limit >= total}
                className="flex items-center gap-1 rounded-full border border-white/40 bg-white/20 px-4 py-2 text-sm font-medium shadow-sm transition-all hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <IconChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}