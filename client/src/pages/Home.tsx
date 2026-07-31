import { useEffect, useMemo, useState } from "react";
import {
  IconPhotoUp,
  IconWand,
  IconX,
  IconLogout,
  IconDownload,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

type Operation =
  | "grayscale"
  | "blur"
  | "sharpen"
  | "enhance"
  | "rotate"
  | "resize"
  | "reduce_size";

const operations: Array<{ value: Operation; label: string }> = [
  { value: "grayscale", label: "Grayscale" },
  { value: "blur", label: "Blur" },
  { value: "sharpen", label: "Sharpen" },
  { value: "enhance", label: "Enhance" },
  { value: "rotate", label: "Rotate" },
  { value: "resize", label: "Resize" },
  { value: "reduce_size", label: "Reduce size" },
];

export default function HomePage() {
  const { user, logout } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<Operation>("grayscale");
  const [angle, setAngle] = useState(90);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(400);
  const [strength, setStrength] = useState(1.25);
  const [quality, setQuality] = useState(75);
  const [maxDimension, setMaxDimension] = useState(1600);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  async function processImage() {
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setError(null);
    setIsProcessing(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("operation", operation);
    formData.append("angle", String(angle));
    formData.append("strength", String(strength));
    formData.append("quality", String(quality));
    formData.append("max_dimension", String(maxDimension));

    if (operation === "resize") {
      formData.append("width", String(width));
      formData.append("height", String(height));
    }

    try {
      // Use the Axios api instance so JWT is auto-attached
      const response = await api.post("/api/v1/images/process", formData, {
        responseType: "blob",
        headers: { "Content-Type": "multipart/form-data" },
      });

      const blob = response.data as Blob;
      setResultSize(blob.size);
      setResultUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function clearImage() {
    setFile(null);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setResultSize(null);
    setError(null);
  }

  function downloadProcessed() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "processed.png";
    a.click();
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto grid min-h-svh max-w-7xl grid-cols-1 gap-6 px-5 py-5 lg:grid-cols-[320px_1fr]">
        <aside className="flex min-h-0 flex-col border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Image Lab
                </p>
                <h1 className="mt-1 text-2xl font-semibold">Process images</h1>
              </div>
            </div>
            {user && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Sign out"
                  type="button"
                  onClick={logout}
                >
                  <IconLogout className="size-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-5 p-4">
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted">
              <IconPhotoUp className="size-8 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose JPEG, PNG, or WebP"}
              </span>
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResultUrl((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return null;
                  });
                  setResultSize(null);
                  setError(null);
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              {operations.map((item) => (
                <button
                  className={`border px-3 py-2 text-left text-sm transition-colors ${
                    operation === item.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                  key={item.value}
                  type="button"
                  onClick={() => setOperation(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {operation === "rotate" ? (
              <label className="grid gap-2 text-sm">
                Angle
                <input
                  className="h-9 border border-input bg-background px-3"
                  max={360}
                  min={-360}
                  type="number"
                  value={angle}
                  onChange={(event) => setAngle(Number(event.target.value))}
                />
              </label>
            ) : null}

            {operation === "resize" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm">
                  Width
                  <input
                    className="h-9 border border-input bg-background px-3"
                    max={4000}
                    min={1}
                    type="number"
                    value={width}
                    onChange={(event) => setWidth(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Height
                  <input
                    className="h-9 border border-input bg-background px-3"
                    max={4000}
                    min={1}
                    type="number"
                    value={height}
                    onChange={(event) => setHeight(Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}

            {operation === "enhance" ? (
              <label className="grid gap-2 text-sm">
                Strength
                <input
                  className="accent-primary"
                  max={3}
                  min={1}
                  step={0.05}
                  type="range"
                  value={strength}
                  onChange={(event) => setStrength(Number(event.target.value))}
                />
                <span className="text-xs text-muted-foreground">
                  {strength.toFixed(2)}x
                </span>
              </label>
            ) : null}

            {operation === "reduce_size" ? (
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm">
                  JPEG quality
                  <input
                    className="accent-primary"
                    max={95}
                    min={10}
                    step={1}
                    type="range"
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">{quality}%</span>
                </label>
                <label className="grid gap-2 text-sm">
                  Max dimension
                  <input
                    className="h-9 border border-input bg-background px-3"
                    max={4000}
                    min={100}
                    step={50}
                    type="number"
                    value={maxDimension}
                    onChange={(event) => setMaxDimension(Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}

            {error ? (
              <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="mt-auto flex gap-2">
              <Button className="flex-1" disabled={isProcessing} onClick={processImage}>
                <IconWand aria-hidden="true" />
                {isProcessing ? "Processing" : "Process"}
              </Button>
              <Button aria-label="Clear image" disabled={!file} variant="outline" size="icon" onClick={clearImage}>
                <IconX aria-hidden="true" />
              </Button>
            </div>
          </div>
        </aside>

        <section className="grid min-h-[calc(100svh-2.5rem)] grid-cols-1 gap-4 lg:grid-cols-2">
          <ImagePanel
            title="Original"
            imageUrl={previewUrl}
            emptyText="Upload an image to preview it."
            meta={file ? formatBytes(file.size) : null}
          />
          <ImagePanel
            title="Processed"
            imageUrl={resultUrl}
            emptyText="Run an operation to see the result."
            meta={resultSize ? formatBytes(resultSize) : null}
            actions={
              resultUrl ? (
                <Button variant="outline" size="xs" onClick={downloadProcessed}>
                  <IconDownload aria-hidden="true" />
                  Download
                </Button>
              ) : undefined
            }
          />
        </section>
      </div>
    </main>
  );
}

function ImagePanel({
  title,
  imageUrl,
  emptyText,
  meta,
  actions,
}: {
  title: string;
  imageUrl: string | null;
  emptyText: string;
  meta?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-80 flex-col border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-2">
          {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
          {actions}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 p-4">
        {imageUrl ? (
          <img
            className="max-h-full max-w-full object-contain"
            src={imageUrl}
            alt={`${title} preview`}
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
