import { useState } from "react";
import { IconBrandGoogle } from "@tabler/icons-react";
import { Navigate, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  GOOGLE_CLIENT_ID,
  buildGoogleAuthUrl,
  generateCodeChallenge,
  generateRandomToken,
  stashOAuthState,
} from "@/lib/oauth";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, authError, clearAuthError } =
    useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Already logged in? Redirect away
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleGoogleLogin() {
    setError(null);
    clearAuthError();
    setIsSigningIn(true);

    try {
      await api.get("/health");
    } catch {
      setError("Backend server unreachable. Make sure the API is running.");
      setIsSigningIn(false);
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      setError(
        "VITE_GOOGLE_CLIENT_ID is not set in client/.env. Add it (matching the backend's GOOGLE_CLIENT_ID) and restart the Vite dev server.",
      );
      setIsSigningIn(false);
      return;
    }

    // Server-side authorization-code + PKCE flow. Only the redirect URI
    // (http://localhost:5173) needs to be registered in Google Cloud Console —
    // no "Authorized JavaScript origins" entry is required.
    const verifier = generateRandomToken();
    const state = generateRandomToken();
    stashOAuthState(state, verifier);

    const url = buildGoogleAuthUrl();
    url.searchParams.set("state", state);
    url.searchParams.set(
      "code_challenge",
      await generateCodeChallenge(verifier),
    );
    url.searchParams.set("code_challenge_method", "S256");

    window.location.href = url.toString();
  }

  async function handleDevLogin(token: string) {
    if (!token.trim()) return;
    setError(null);
    clearAuthError();
    setIsSigningIn(true);

    try {
      const res = await api.post("/api/v1/auth/google", { token: token.trim() });
      await login(res.data.access_token);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
    } finally {
      setIsSigningIn(false);
    }
  }

  const message = error ?? authError;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm border border-border bg-card p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Image Lab</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to start processing images
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Button
            className="w-full gap-2"
            disabled={isSigningIn}
            onClick={handleGoogleLogin}
          >
            <IconBrandGoogle className="size-4" aria-hidden="true" />
            {isSigningIn ? "Redirecting…" : "Sign in with Google"}
          </Button>

          {message && (
            <p className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {message}
            </p>
          )}

          {/* Dev-only: manual token entry */}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Development: enter token manually
            </summary>
            <form
              className="mt-2 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                handleDevLogin(data.get("token") as string);
              }}
            >
              <input
                className="h-8 border border-input bg-background px-2 text-xs"
                name="token"
                placeholder="Paste Google OAuth token"
              />
              <Button type="submit" size="xs" disabled={isSigningIn}>
                Submit token
              </Button>
            </form>
          </details>
        </div>

        <footer className="mt-6 border-t border-border pt-4 text-center text-[10px] leading-4 text-muted-foreground">
          <div>origin: {window.location.origin}</div>
          <div>client id: {GOOGLE_CLIENT_ID || "(not set)"}</div>
        </footer>
      </div>
    </main>
  );
}
