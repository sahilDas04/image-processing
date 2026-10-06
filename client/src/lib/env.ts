/**
 * Single source of truth for the browser-visible build configuration.
 *
 * Every `VITE_*` read lives here so the rest of the app never falls back to a
 * hardcoded localhost URL, and so the values stay in sync with the backend's
 * own `MAX_UPLOAD_SIZE_MB` setting.
 */

/** Base URL of the FastAPI backend, with any trailing slash removed. */
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

/** Must exactly match an entry in the OAuth client's authorized redirect URIs. */
export const GOOGLE_REDIRECT_URI =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? "http://localhost:5173";

/**
 * Upload cap in MB. Keep in sync with the backend's MAX_UPLOAD_SIZE_MB: the UI
 * rejects oversized files before they are sent, but the server enforces the
 * authoritative limit and would 413 anything larger.
 */
const parsedMaxUploadMb = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB ?? "", 10);

export const MAX_UPLOAD_SIZE_MB = Number.isFinite(parsedMaxUploadMb) ? parsedMaxUploadMb : 25;

export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;