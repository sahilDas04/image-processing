// Google sign-in via the server-side authorization-code + PKCE flow.
//
// Unlike the Google Identity Services popup, this flow only requires the OAuth
// client's *Authorized redirect URIs* to be registered — it does not depend on
// the "Authorized JavaScript origins" field at all.
//
// The redirect URI is the frontend origin (http://localhost:5173 in dev,
// https://<app>.vercel.app in production) and must be registered in Google Cloud
// Console. The backend validates the origin of whatever we send back to it.
import { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } from "@/lib/env";

export { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI };

const STATE_KEY = "oauth_state";
const VERIFIER_KEY = "oauth_verifier";
const NONCE_KEY = "oauth_nonce";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Random base64url string — used for the OAuth `state` and PKCE `code_verifier`. */
export function generateRandomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toBase64Url(arr);
}

/** S256 PKCE challenge derived from the plain-text `code_verifier`. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

/** Build the Google consent URL (`state` + `code_challenge` added by caller). */
export function buildGoogleAuthUrl(): URL {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url;
}

/** Persist `state` + `code_verifier` (+ nonce) before redirecting to Google. */
export function stashOAuthState(state: string, verifier: string, nonce: string): void {
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(NONCE_KEY, nonce);
}

/** Read and clear the pending `state`/`verifier`/`nonce` after returning from Google. */
export function takeOAuthState(): {
  state: string | null;
  verifier: string | null;
  nonce: string | null;
} {
  const state = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const nonce = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  return { state, verifier, nonce };
}
