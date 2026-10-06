/// <reference types="vite/client" />

/**
 * Typed surface for the `VITE_*` variables this app reads.
 *
 * These are inlined at build time, so anything added here must also be present
 * in Vercel's environment settings or the build silently falls back to its
 * default. Values prefixed `VITE_` are browser-visible — never put a secret
 * here.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_REDIRECT_URI?: string;
  /** Must match the backend's MAX_UPLOAD_SIZE_MB, or uploads get rejected at the API. */
  readonly VITE_MAX_UPLOAD_SIZE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}