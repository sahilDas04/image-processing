import { api } from "./api";

export interface UploadChunk {
  index: number;
  start: number;
  end: number;
  blob: Blob;
}

export interface ChunkedUploadOptions {
  file: File;
  chunkSize?: number;
  maxConcurrency?: number;
  onProgress?: (progress: UploadProgress) => void;
  onChunkComplete?: (chunkIndex: number) => void;
  signal?: AbortSignal;
}

export interface UploadProgress {
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  speed: number; // bytes/second
  currentChunk: number;
  totalChunks: number;
}

export interface ChunkedUploadResult {
  success: boolean;
  uploadId?: string;
  error?: string;
}

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_CONCURRENCY = 2;
const CHUNKED_THRESHOLD = 100 * 1024 * 1024; // 100 MB

/**
 * Create chunks from a file
 */
export function createChunks(file: File, chunkSize = DEFAULT_CHUNK_SIZE): UploadChunk[] {
  const chunks: UploadChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);
    chunks.push({ index, start, end, blob });
    start = end;
    index++;
  }

  return chunks;
}

/**
 * Upload a single chunk to the server
 */
async function uploadChunk(
  uploadId: string,
  chunk: UploadChunk,
  signal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  formData.append("upload_id", uploadId);
  formData.append("chunk_index", String(chunk.index));
  formData.append("chunk_total", String(chunk.blob.size)); // We'll send total chunks separately
  formData.append("file", chunk.blob, `chunk_${chunk.index}`);

  await api.post("/api/v1/upload/chunk", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
  });
}

/**
 * Initialize a chunked upload session
 */
async function initChunkedUpload(
  fileName: string,
  fileSize: number,
  totalChunks: number,
  mimeType: string
): Promise<string> {
  const response = await api.post<{ upload_id: string }>("/api/v1/upload/init", {
    file_name: fileName,
    file_size: fileSize,
    total_chunks: totalChunks,
    mime_type: mimeType,
  });
  return response.data.upload_id;
}

/**
 * Finalize chunked upload (reassemble chunks)
 */
async function finalizeChunkedUpload(
  uploadId: string,
  fileName: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const response = await api.post<{ success: boolean; url?: string; error?: string }>(
    "/api/v1/upload/finalize",
    { upload_id: uploadId, file_name: fileName }
  );
  return response.data;
}

/**
 * Check upload status
 */
async function checkUploadStatus(uploadId: string): Promise<{ uploaded_chunks: number[] }> {
  const response = await api.get<{ uploaded_chunks: number[] }>(`/api/v1/upload/status/${uploadId}`);
  return response.data;
}

/**
 * Main chunked upload function
 */
export async function chunkedUpload(
  options: ChunkedUploadOptions
): Promise<ChunkedUploadResult> {
  const {
    file,
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    onProgress,
    onChunkComplete,
    signal,
  } = options;

  // Check if we should use chunked upload
  if (file.size <= CHUNKED_THRESHOLD) {
    return { success: false, error: "File too small for chunked upload" };
  }

  const chunks = createChunks(file, chunkSize);
  const totalChunks = chunks.length;

  // Initialize upload session
  let uploadId: string;
  try {
    uploadId = await initChunkedUpload(file.name, file.size, totalChunks, file.type);
  } catch {
    return { success: false, error: "Failed to initialize upload" };
  }

  // Track uploaded chunks (for resume capability)
  const uploadedChunks = new Set<number>();
  let uploadedBytes = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;
  let lastProgressBytes = 0;

  // Check for existing progress (resume)
  try {
    const status = await checkUploadStatus(uploadId);
    status.uploaded_chunks.forEach((idx) => uploadedChunks.add(idx));
    uploadedBytes = Array.from(uploadedChunks).reduce((sum, idx) => {
      const chunk = chunks[idx];
      return sum + (chunk ? chunk.end - chunk.start : 0);
    }, 0);
  } catch {
    // No existing progress, continue fresh
  }

  // Upload chunks with controlled concurrency
  const queue = [...chunks].filter((c) => !uploadedChunks.has(c.index));
  const active = new Set<Promise<void>>();

  const processQueue = async () => {
    while (queue.length > 0 && !signal?.aborted) {
      // Wait for concurrency slot
      while (active.size >= maxConcurrency && !signal?.aborted) {
        await Promise.race(active);
      }

      if (signal?.aborted) break;

      const chunk = queue.shift()!;
      const promise = (async () => {
        try {
          await uploadChunk(uploadId, chunk, signal);
          uploadedChunks.add(chunk.index);
          uploadedBytes += chunk.end - chunk.start;

          // Calculate speed
          const now = Date.now();
          const elapsed = (now - lastProgressTime) / 1000;
          if (elapsed > 0) {
            const speed = (uploadedBytes - lastProgressBytes) / elapsed;
            onProgress?.({
              progress: (uploadedBytes / file.size) * 100,
              uploadedBytes,
              totalBytes: file.size,
              speed,
              currentChunk: uploadedChunks.size,
              totalChunks,
            });
            lastProgressTime = now;
            lastProgressBytes = uploadedBytes;
          }

          onChunkComplete?.(chunk.index);
        } catch (error) {
          if (signal?.aborted) return;
          // Retry this chunk once
          queue.unshift(chunk);
          throw error;
        }
      })();

      active.add(promise);
      promise.finally(() => active.delete(promise));
    }

    // Wait for all remaining
    await Promise.all(active);
  };

  try {
    await processQueue();

    if (signal?.aborted) {
      return { success: false, error: "Upload cancelled" };
    }

    // Finalize
    const result = await finalizeChunkedUpload(uploadId, file.name);
    if (result.success) {
      onProgress?.({
        progress: 100,
        uploadedBytes: file.size,
        totalBytes: file.size,
        speed: 0,
        currentChunk: totalChunks,
        totalChunks,
      });
      return { success: true, uploadId };
    } else {
      return { success: false, error: result.error || "Finalization failed" };
    }
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, error: "Upload cancelled" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Regular (non-chunked) upload for smaller files
 */
export async function regularUpload(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<ChunkedUploadResult> {
  const formData = new FormData();
  formData.append("files", file);

  try {
    // For regular upload, we can't easily track progress with axios
    // This is a simplified version - in production you'd use XMLHttpRequest
    // or a library like axios-progress-bar for real progress
    const response = await api.post("/api/v1/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      signal,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          const elapsed = (Date.now() - performance.now()) / 1000; // approximate
          const speed = elapsed > 0 ? progressEvent.loaded / elapsed : 0;
          onProgress({
            progress,
            uploadedBytes: progressEvent.loaded,
            totalBytes: progressEvent.total,
            speed,
            currentChunk: 1,
            totalChunks: 1,
          });
        }
      },
    });

    return { success: true, uploadId: response.data.results?.[0]?.image?.id };
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, error: "Upload cancelled" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Smart upload - chooses chunked or regular based on file size
 */
export async function smartUpload(
  file: File,
  options: Omit<ChunkedUploadOptions, "file"> = {}
): Promise<ChunkedUploadResult> {
  if (file.size > CHUNKED_THRESHOLD) {
    return chunkedUpload({ ...options, file });
  } else {
    return regularUpload(file, options.onProgress, options.signal);
  }
}