import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "hcm-theme";

/** Apply the theme class to <html> and persist the choice. */
export function applyTheme(theme: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable — theme applies for this session only
  }
}

/** Read the stored theme, falling back to the OS preference. */
export function initialTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore
  }
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Fixed circular dark/light toggle. Rendered once in the root route so it is
 * available on every page, including /auth and /setup.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(initialTheme() === "dark");
    setMounted(true);
  }, []);

  function toggle(): void {
    const next = !dark;
    setDark(next);
    applyTheme(next ? "dark" : "light");
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="fixed bottom-5 left-5 z-50 rounded-full bg-background shadow print:hidden"
    >
      {mounted && dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
