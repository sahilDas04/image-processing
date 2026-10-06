import { useCallback, useEffect, useRef, useState } from "react";
import { IconPhotoUp, IconX, IconAlertTriangle, IconFile, IconPhoto } from "@tabler/icons-react";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/env";
import { cn, formatBytes } from "@/lib/utils";

interface UploadDropzoneProps {
  accept?: string;
  maxSize?: number; // in bytes
  multiple?: boolean;
  onFilesSelect: (files: File[]) => void;
  currentFiles?: File[];
  onClear?: () => void;
  disabled?: boolean;
}

// Mirrors the backend's MAX_UPLOAD_SIZE_MB. Keep both in sync or the UI will
// either reject valid files or let through ones the API refuses with a 413.
const DEFAULT_MAX_SIZE = MAX_UPLOAD_SIZE_BYTES;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_PDF_TYPES = ["application/pdf"];

function ImageDimensions({ file, index }: { file: File; index: number }) {
  const [dimensions, setDimensions] = useState<string>("Loading…");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setDimensions(`${img.width} × ${img.height}`);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setDimensions("Unknown dimensions");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file, index]);

  return <span>{dimensions}</span>;
}

export function UploadDropzone({
  accept = "image/png,image/jpeg,image/webp",
  maxSize = DEFAULT_MAX_SIZE,
  multiple = false,
  onFilesSelect,
  currentFiles = [],
  onClear,
  disabled = false,
}: UploadDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
    const isPdf = ACCEPTED_PDF_TYPES.includes(file.type);
    const acceptedTypes = accept.split(",").map((t) => t.trim());

    const isAccepted = acceptedTypes.some((type) => {
      if (type === "image/*") return isImage;
      if (type === "application/pdf") return isPdf;
      return file.type === type;
    });

    if (!isAccepted) {
      return `File type "${file.type || "unknown"}" is not supported.`;
    }

    // Check file size
    if (file.size > maxSize) {
      return `File size (${formatBytes(file.size)}) exceeds the maximum allowed size of ${formatBytes(maxSize)}.`;
    }

    return null;
  }, [accept, maxSize]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of fileArray) {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push(`${file.name}: ${validationError}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setError(errors.join("\n"));
        if (validFiles.length === 0) return;
      } else {
        setError(null);
      }

      onFilesSelect(multiple ? [...currentFiles, ...validFiles] : validFiles.slice(0, 1));
    },
    [multiple, currentFiles, onFilesSelect, validateFile],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragActive(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) e.dataTransfer.dropEffect = "copy";
  }, [disabled]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles],
  );

  const handleClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
      // Reset input value to allow selecting the same file again
      e.target.value = "";
    },
    [handleFiles],
  );

  const handleClear = useCallback(() => {
    onClear?.();
    setError(null);
  }, [onClear]);

  const hasFiles = currentFiles.length > 0;
  const displayFiles = multiple ? currentFiles : currentFiles.slice(0, 1);

  const maxSizeDisplay = formatBytes(maxSize);

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="sr-only"
        disabled={disabled}
        aria-label="Upload files"
      />

      {/* Error Toast */}
      {error && (
        <div
          className="mb-4 glass-highlight rounded-xl border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2 animate-slide-in"
          role="alert"
        >
          <IconAlertTriangle className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      )}

      {/* Dropzone / File Preview */}
      {!hasFiles ? (
        <label
          className={cn(
            "group glass-highlight relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all duration-200",
            "bg-gradient-to-br from-white/20 to-primary/5",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : isDragActive
                ? "border-primary/60 bg-gradient-to-br from-primary/10 to-primary/5 scale-[1.01] shadow-[0_8px_32px_rgba(90,70,160,0.2)]"
                : "border-white/40 hover:border-primary/50 hover:from-white/30 hover:to-primary/10",
          )}
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleFileChange}
            className="sr-only"
            disabled={disabled}
          />
          <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg transition-transform group-hover:scale-110">
            <IconPhotoUp className="size-7" aria-hidden="true" />
          </span>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Upload Image</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Drag & drop your file here or click to browse
            </p>
            <p className="mt-2 text-xs text-muted-foreground/70">
              JPEG • PNG • WebP • PDF{multiple ? " • Multiple files supported" : ""}
              <br />
              Maximum file size: {maxSizeDisplay}
            </p>
          </div>
        </label>
      ) : (
        <div className="space-y-3 animate-slide-in">
          {displayFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}-${file.size}`}
              className="glass-highlight flex items-center gap-4 rounded-2xl border border-white/40 p-4 bg-gradient-to-br from-white/25 to-white/15"
            >
              <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shrink-0">
                {file.type === "application/pdf" ? (
                  <IconFile className="size-5" aria-hidden="true" />
                ) : (
                  <IconPhoto className="size-5" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{file.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{file.type || "Unknown type"}</span>
                  <span>•</span>
                  <span>{formatBytes(file.size)}</span>
                  {file.size > maxSize && (
                    <>
                      <span className="text-destructive">•</span>
                      <span className="text-destructive">Exceeds limit</span>
                    </>
                  )}
                  {file.type.startsWith("image/") && (
                    <>
                      <span>•</span>
                      <ImageDimensions file={file} index={index} />
                    </>
                  )}
                </div>
              </div>
              {!multiple && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="glass-control rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-white/30 transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  <IconX className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {!multiple && onClear && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full glass-highlight flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium text-foreground bg-white/30 border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all"
            >
              <IconX className="size-4" aria-hidden="true" />
              <span>Change File</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}