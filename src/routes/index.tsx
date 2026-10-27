import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingPage } from "@/components/landing";
import { pageMeta, canonicalLink, jsonLdScripts, hcmJsonLdGraph } from "@/lib/seo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: pageMeta({
      title: "HCM Lite — AI-Powered HR, Biometric Geofence Attendance & Payroll System",
      description:
        "Enterprise HR suite with webcam face-check attendance, Haversine GPS geofencing, Pakistani tax-slab payroll with PDF payslips, a Roman Urdu + English AI assistant and immutable audit logs.",
      path: "/",
    }),
    links: canonicalLink("/"),
    scripts: jsonLdScripts(hcmJsonLdGraph()),
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  // Signed-in visitors skip the marketing page and land on their workspace.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return <LandingPage />;
}
