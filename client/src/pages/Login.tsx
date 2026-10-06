import { useState } from "react";
import { Navigate } from "react-router";
import { IconBrandGoogle, IconSparkles, IconAlertCircle, IconShield, IconBolt, IconStack2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/env";
import {
  GOOGLE_CLIENT_ID,
  buildGoogleAuthUrl,
  generateCodeChallenge,
  generateRandomToken,
  stashOAuthState,
} from "@/lib/oauth";
import { formatBytes } from "@/lib/utils";

export default function LoginPage() {
  const { isAuthenticated, isLoading, clearAuthError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Already logged in? Redirect away
  if (isLoading) {
    return (
      <main className="page-bg flex min-h-svh items-center justify-center p-4 text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
          Loading…
        </div>
      </main>
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

    const verifier = generateRandomToken();
    const state = generateRandomToken();
    const nonce = generateRandomToken();
    stashOAuthState(state, verifier, nonce);

    const url = buildGoogleAuthUrl();
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set(
      "code_challenge",
      await generateCodeChallenge(verifier),
    );
    url.searchParams.set("code_challenge_method", "S256");

    window.location.href = url.toString();
  }

  return (
    <main className="page-bg relative min-h-svh flex items-center justify-center p-4 text-foreground">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Split Card - Left: Content, Right: Sign In */}
        <div className="glass-strong rounded-3xl overflow-hidden flex flex-col lg:flex-row min-h-[520px]">
          {/* Left Side - Content */}
          <div className="relative flex-1 p-8 sm:p-10 lg:p-12 flex flex-col min-h-[520px]">
            {/* Brand Header */}
            <div className="mb-6 flex-shrink-0 flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg">
                <IconSparkles className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-2xl leading-none text-foreground">IMAGE LAB</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Process images</p>
              </div>
            </div>

            {/* Centered Welcome Content */}
            <div className="flex flex-1 flex-col justify-center">
              {/* Welcome Text */}
              <div className="flex-shrink-0">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-3">
                  Welcome Back
                </h1>
                <p className="text-base lg:text-lg text-muted-foreground max-w-lg">
                  Sign in to access your image processing workspace. Transform, convert, and optimize images with ease.
                </p>
              </div>

              {/* Feature Chips */}
              <div className="mt-8 flex flex-wrap gap-2 flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full glass-control px-3 py-1.5 text-xs font-medium text-foreground">
                  <IconBolt className="size-3.5 text-primary" aria-hidden="true" /> 10+ operations
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full glass-control px-3 py-1.5 text-xs font-medium text-foreground">
                  <IconStack2 className="size-3.5 text-primary" aria-hidden="true" /> Batch processing
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full glass-control px-3 py-1.5 text-xs font-medium text-foreground">
                  <IconShield className="size-3.5 text-primary" aria-hidden="true" /> {formatBytes(
                    MAX_UPLOAD_SIZE_BYTES,
                  )}{" "}
                  files
                </span>
              </div>
            </div>
          </div>

          {/* Right Side - Sign In Card */}
          <div className="flex-1 lg:w-[420px] bg-white/10 backdrop-blur-2xl border-l border-white/30 flex items-center justify-center p-8 min-h-[520px]">
            <div className="w-full max-w-sm">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground">Sign in to continue</h2>
                <p className="mt-2 text-sm text-muted-foreground">Use your Google account to access Image Lab</p>
              </div>

              {/* Google Sign In Button */}
              <Button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSigningIn}
                className="w-full gap-3 rounded-full glass-highlight bg-white/30 text-foreground border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 hover:shadow-[0_4px_16px_rgba(90,70,160,0.15)] transition-all py-4 text-base"
              >
                <IconBrandGoogle className="size-5" aria-hidden="true" />
                {isSigningIn ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Connecting to Google…
                  </>
                ) : (
                  "Continue with Google"
                )}
              </Button>

              {/* Error Message */}
              {error && (
                <p
                  className="mt-6 rounded-xl border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive text-center flex items-center justify-center gap-2"
                  role="alert"
                >
                  <IconAlertCircle className="size-4" aria-hidden="true" />
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}