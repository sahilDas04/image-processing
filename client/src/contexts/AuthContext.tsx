import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { GOOGLE_REDIRECT_URI, takeOAuthState } from "@/lib/oauth";

// ── Types ──

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ── Context ──

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ──

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const login = useCallback(async (accessToken: string) => {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
    setAuthError(null);

    // Fetch user profile
    const res = await api.get<{
      id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
    }>("/api/v1/auth/me");
    setUser(res.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Even if the request fails, clear local state
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  // On mount:
  //  - If we just returned from Google (?code=…&state=…), exchange the code for
  //    a JWT while isLoading stays true (so routes don't flash).
  //  - Otherwise validate any stored token.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    async function init() {
      try {
        if (code && state) {
          const { state: storedState, verifier, nonce } = takeOAuthState();

          if (!storedState || storedState !== state) {
            setAuthError("Sign-in failed (state mismatch). Please try again.");
            return;
          }
          try {
            const res = await api.post<{ access_token: string }>(
              "/api/v1/auth/google/code",
              {
                code,
                code_verifier: verifier,
                redirect_uri: GOOGLE_REDIRECT_URI,
                nonce: nonce ?? "",
              },
            );
            console.log("[Auth] Token exchange successful");
            await login(res.data.access_token);
            // Drop ?code=…&state=… from the URL now that it's consumed.
            window.history.replaceState({}, "", "/");
            return;
          } catch (tokenError: unknown) {
            console.error("[Auth] Token exchange failed:", tokenError);
            const errorMessage = tokenError instanceof Error ? tokenError.message : "Unknown error";
            if (errorMessage.includes("400")) {
              setAuthError("Sign-in failed: Invalid redirect URI or code. Please try again.");
            } else {
              setAuthError("Sign-in failed. Please try again.");
            }
            return;
          }
        }

        const storedToken = localStorage.getItem("token");
        if (!storedToken) {
          setToken(null);
          setIsLoading(false);
          return;
        }

        const me = await api.get<{
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
        }>("/api/v1/auth/me");
        setUser(me.data);
        setToken(storedToken);
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
        if (code) setAuthError("Sign-in failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [login]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      authError,
      clearAuthError,
      login,
      logout,
    }),
    [user, token, isLoading, authError, clearAuthError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
