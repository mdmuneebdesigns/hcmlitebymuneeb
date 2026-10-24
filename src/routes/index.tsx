import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { getFirstRunStatus } from "@/lib/setup.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HCM Lite — AI-assisted Human Capital Management" },
      {
        name: "description",
        content:
          "HCM Lite: a web-based HR system with three roles, camera attendance, leave, payroll and a built-in AI assistant.",
      },
      { property: "og:title", content: "HCM Lite — AI-assisted Human Capital Management" },
      {
        property: "og:description",
        content:
          "HCM Lite: a web-based HR system with three roles, camera attendance, leave, payroll and a built-in AI assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getFirstRunStatus();
        if (cancelled) return;
        if (!status.companyExists) {
          navigate({ to: "/setup", replace: true });
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
      } catch {
        if (!cancelled) setError("Could not reach the server. Please refresh.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Building2 className="h-8 w-8" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">HCM Lite</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI-assisted Human Capital Management</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
