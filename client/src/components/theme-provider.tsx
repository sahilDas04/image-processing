/* eslint-disable react-refresh/only-export-components */
import * as React from "react";

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeProviderState = {
  theme: "light";
  setTheme: (theme: "light") => void;
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({ children }: ThemeProviderProps) {
  const setTheme = React.useCallback(() => {}, []);

  React.useEffect(() => {
    document.documentElement.classList.add("light");
  }, []);

  const value = React.useMemo(
    () => ({
      theme: "light" as const,
      setTheme,
    }),
    [setTheme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};