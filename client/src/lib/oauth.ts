// Google sign-in via the server-side authorization-code + PKCE flow.
//
// Unlike the Google Identity Services popup, this flow only requires the OAuth
// client's *Authorized redirect URIs* to be registered (http://localhost:5173)
// — it does not depend on the "Authorized JavaScript origins" field at all.

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

// Must match an entry under "Authorized redirect URIs" in Google Cloud Console
// for this client, and must be exactly what the backend exchanges the code with.
export const GOOGLE_REDIRECT_URI =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? "http://localhost:5173";

const STATE_KEY = "oauth_state";
const VERIFIER_KEY = "oauth_verifier";

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

/** Persist `state` + `code_verifier` before redirecting to Google. */
export function stashOAuthState(state: string, verifier: string): void {
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
}

/** Read and clear the pending `state`/`verifier` once we return from Google. */
export function takeOAuthState(): { state: string | null; verifier: string | null } {
  const state = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  return { state, verifier };
}
