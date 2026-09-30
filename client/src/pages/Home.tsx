import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AxiosResponse } from "axios";
import { IconWand, IconX } from "@tabler/icons-react";

import {
  Button,
  Navbar,
  UploadDropzone,
  UploadProgress,
  OperationCard,
  OPERATIONS,
  OperationConfig,
  ImagePreview,
  DownloadButton,
  useToast,
} from "@/components";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { smartUpload, type UploadProgress as UploadProgressData } from "@/lib/upload";

type Operation =
  | "grayscale"
  | "blur"
  | "sharpen"
  | "enhance"
  | "rotate"
  | "resize"
  | "reduce_size"
  | "convert"
  | "from_pdf"
  | "to_pdf";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

export default function HomePage() {
  const { showToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<Operation>("grayscale");
  const [angle, setAngle] = useState(90);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(400);
  const [strength, setStrength] = useState(1.25);
  const [quality, setQuality] = useState(75);
  const [maxDimension, setMaxDimension] = useState(1600);
  const [outputFormat, setOutputFormat] = useState("png");
  const [page, setPage] = useState(1);
  const [allPages, setAllPages] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [resultType, setResultType] = useState("");
  const [processingState, setProcessingState] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<UploadProgressData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const [isUploadError, setIsUploadError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadPaused, setIsUploadPaused] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const previewFile = operation === "to_pdf" ? (files[0] ?? null) : file;
  const isPdf =
    previewFile?.type === "application/pdf" ||
    previewFile?.name.toLowerCase().endsWith(".pdf");

  const previewUrl = useMemo(
    () => (previewFile && !isPdf ? URL.createObjectURL(previewFile) : null),
    [previewFile, isPdf],
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

  const isImageResult = resultType === "" || resultType.startsWith("image/");

  const applyResult = useCallback((response: AxiosResponse) => {
    const blob = response.data as Blob;
    const headerType = response.headers["content-type"];
    const type = blob.type || (typeof headerType === "string" ? headerType : "");
    setResultSize(blob.size);
    setResultType(type);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
    setProcessingState("success");
    showToast({
      type: "success",
      title: "Processing Complete",
      message: "Your image has been processed successfully",
    });
  }, [showToast]);

  const handleError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    setError(message);
    setProcessingState("error");
    showToast({
      type: "error",
      title: "Processing Failed",
      message,
    });
  }, [showToast]);

  const convertToPdf = useCallback(async () => {
    if (files.length === 0) {
      showToast({ type: "error", title: "No images selected", message: "Choose at least one image." });
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProcessingState("processing");
    showToast({ type: "loading", title: "Converting to PDF…", message: "Please wait" });

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const response = await api.post("/api/v1/images/to-pdf", formData, {
        responseType: "blob",
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyResult(response);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setIsProcessing(false);
    }
  }, [files, applyResult, handleError, showToast]);

  const processImage = useCallback(async () => {
    if (operation === "to_pdf") {
      await convertToPdf();
      return;
    }

    if (!file) {
      showToast({ type: "error", title: "No image", message: "Choose an image first." });
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProcessingState("processing");
    showToast({ type: "loading", title: "Processing image…", message: "Please wait" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("operation", operation);
    formData.append("angle", String(angle));
    formData.append("strength", String(strength));
    formData.append("quality", String(quality));
    formData.append("max_dimension", String(maxDimension));
    formData.append("output_format", outputFormat);

    if (operation === "resize") {
      formData.append("width", String(width));
      formData.append("height", String(height));
    }

    if (operation === "from_pdf") {
      formData.append("page", String(page));
      formData.append("all_pages", String(allPages));
    }

    try {
      const response = await api.post("/api/v1/images/process", formData, {
        responseType: "blob",
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyResult(response);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      setIsProcessing(false);
    }
  }, [operation, file, convertToPdf, angle, strength, quality, maxDimension, outputFormat, width, height, page, allPages, applyResult, handleError, showToast]);

  const clearImage = useCallback(() => {
    setFile(null);
    setFiles([]);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setResultSize(null);
    setResultType("");
    setProcessingState("idle");
    setError(null);
    // Reset upload state
    setIsUploading(false);
    setIsUploadComplete(false);
    setIsUploadError(false);
    setUploadError(null);
    setUploadProgress(null);
    setIsUploadPaused(false);
  }, []);

  const handleFilesSelect = useCallback(async (selectedFiles: File[]) => {
    if (operation === "to_pdf") {
      setFiles(selectedFiles);
    } else {
      const selectedFile = selectedFiles[0] ?? null;
      setFile(selectedFile);

      // Start upload for the selected file
      if (selectedFile) {
        await handleFileUpload(selectedFile);
      }
    }
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setResultSize(null);
    setResultType("");
    setProcessingState("idle");
    setError(null);
    showToast({
      type: "success",
      title: "File Selected",
      message: `Ready to process ${selectedFiles[0]?.name ?? `${selectedFiles.length} files`}`,
    });
  }, [operation, showToast]);

  const handleFileUpload = useCallback(async (fileToUpload: File) => {
    setIsUploading(true);
    setIsUploadComplete(false);
    setIsUploadError(false);
    setUploadError(null);
    setUploadProgress(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await smartUpload(fileToUpload, {
        onProgress: (progress) => setUploadProgress(progress),
        signal: abortController.signal,
      });

      if (result.success) {
        setIsUploadComplete(true);
        showToast({
          type: "success",
          title: "Upload Complete",
          message: `${fileToUpload.name} uploaded successfully`,
        });
      } else {
        setIsUploadError(true);
        setUploadError(result.error || "Upload failed");
        showToast({
          type: "error",
          title: "Upload Failed",
          message: result.error || "Failed to upload file",
        });
      }
    } catch (err: unknown) {
      setIsUploadError(true);
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError(message);
      showToast({
        type: "error",
        title: "Upload Failed",
        message,
      });
    } finally {
      setIsUploading(false);
    }
  }, [showToast]);

  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
    setIsUploadError(false);
    setUploadError(null);
    setUploadProgress(null);
  }, []);

  const handleRetryUpload = useCallback(async () => {
    if (file) {
      await handleFileUpload(file);
    }
  }, [file, handleFileUpload]);

  const pickerAccept =
    operation === "from_pdf"
      ? "application/pdf"
      : operation === "to_pdf"
        ? "image/png,image/jpeg,image/webp"
        : "image/png,image/jpeg,image/webp";

  const originalMeta =
    operation === "to_pdf"
      ? files.length > 0
        ? `${files.length} file${files.length > 1 ? "s" : ""} · ${formatBytes(
            files.reduce((sum, f) => sum + f.size, 0),
          )}`
        : null
      : file
        ? formatBytes(file.size)
        : null;

  const originalEmptyText =
    operation === "to_pdf"
      ? "Choose one or more images — each becomes a PDF page."
      : file && isPdf
        ? "PDF selected — pages appear after processing."
        : "Upload an image to get started. Drag and drop an image here or use the upload button.";

  const processedEmptyText =
    processingState === "processing"
      ? "Processing your image…"
      : "Your processed image will appear here. Select an operation and click Process.";

  return (
    <main className="page-bg min-h-svh text-foreground">
      <Navbar />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-5 pb-6 pt-[2rem]">
        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left Sidebar - Operations */}
          <aside className="glass flex flex-col overflow-hidden h-fit">
            <div className="border-b border-white/20 p-5">
              <h2 className="text-xl font-bold text-foreground">Operations</h2>
              <p className="mt-1 text-xs text-muted-foreground">Choose what to do with your image</p>
            </div>

            <div className="flex flex-col gap-5 p-5">
              {/* Upload Dropzone */}
              <UploadDropzone
                accept={pickerAccept}
                multiple={operation === "to_pdf"}
                onFilesSelect={handleFilesSelect}
                currentFiles={operation === "to_pdf" ? files : (file ? [file] : [])}
                onClear={clearImage}
                disabled={isProcessing || isUploading}
              />

              {/* Upload Progress */}
              {(isUploading || isUploadComplete || isUploadError) && (
                <UploadProgress
                  progress={uploadProgress?.progress ?? 0}
                  uploadedBytes={uploadProgress?.uploadedBytes ?? 0}
                  totalBytes={uploadProgress?.totalBytes ?? file?.size ?? 0}
                  speed={uploadProgress?.speed ?? 0}
                  fileName={file?.name ?? "File"}
                  isUploading={isUploading}
                  isComplete={isUploadComplete}
                  isError={isUploadError}
                  errorMessage={uploadError ?? undefined}
                  onCancel={handleCancelUpload}
                  onRetry={handleRetryUpload}
                  isPaused={isUploadPaused}
                />
              )}

              {/* Operation Categories */}
              <div className="mt-2 space-y-4">
                {OPERATIONS.map((category) => (
                  <div key={category.id} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {category.name}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                      {category.operations.map((op) => (
                        <OperationCard
                          key={op.value}
                          operation={op}
                          isSelected={operation === op.value}
                          onSelect={(value) => setOperation(value as Operation)}
                          disabled={isProcessing}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Operation Config */}
              <OperationConfig
                operation={operation}
                config={{
                  angle,
                  width,
                  height,
                  strength,
                  quality,
                  maxDimension,
                  outputFormat,
                  page,
                  allPages,
                  onChange: (key: string, value: unknown) => {
                    if (key === "angle") setAngle(value as number);
                    if (key === "width") setWidth(value as number);
                    if (key === "height") setHeight(value as number);
                    if (key === "strength") setStrength(value as number);
                    if (key === "quality") setQuality(value as number);
                    if (key === "maxDimension") setMaxDimension(value as number);
                    if (key === "outputFormat") setOutputFormat(value as string);
                    if (key === "page") setPage(value as number);
                    if (key === "allPages") setAllPages(value as boolean);
                  },
                }}
              />

              {error && (
                <div
                  className="rounded-xl border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Process Button */}
              <div className="mt-auto flex gap-2">
                <Button
                  className="flex-1 gap-2 rounded-full bg-gradient-to-r from-primary to-primary/80 text-white shadow-[0_4px_16px_rgba(90,70,160,0.35)] hover:from-primary/90 hover:to-primary/70 hover:shadow-[0_6px_20px_rgba(90,70,160,0.45)] transition-all"
                  disabled={isProcessing || (!file && files.length === 0) || processingState === "processing" || isUploading}
                  onClick={processImage}
                  aria-label={isProcessing ? "Processing" : "Process image"}
                >
                  <IconWand className={isProcessing ? "animate-spin" : ""} aria-hidden="true" />
                  {processingState === "processing" ? "Processing…" : "Process"}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearImage}
                  disabled={!file && files.length === 0}
                  aria-label="Clear selection"
                  className="glass-control rounded-full"
                >
                  <IconX aria-hidden="true" />
                </Button>
              </div>
            </div>
          </aside>

          {/* Right Area - Previews */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImagePreview
              title="Original"
              imageUrl={previewUrl}
              emptyText={originalEmptyText}
              meta={originalMeta}
              file={previewFile}
              onRemove={clearImage}
            />
            <ImagePreview
              title="Processed"
              imageUrl={isImageResult ? resultUrl : null}
              emptyText={processedEmptyText}
              meta={resultSize ? formatBytes(resultSize) : null}
              resultType={resultType}
              isProcessing={processingState === "processing"}
              file={null}
              actions={
                resultUrl ? (
                  <DownloadButton
                    url={resultUrl}
                    filename={`processed.${EXTENSION_BY_TYPE[resultType] || "bin"}`}
                    type={resultType}
                    onDownload={() => showToast({ type: "success", title: "Download Started" })}
                  />
                ) : undefined
              }
            />
          </section>
        </div>
      </div>
    </main>
  );
}