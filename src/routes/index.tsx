import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingPage } from "@/components/landing";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HCM Lite — AI-Powered HR, Biometric Attendance & Payroll" },
      {
        name: "description",
        content:
          "Enterprise-grade HR suite: camera face-check attendance with GPS geofencing, automated Pakistani tax-slab payroll with PDF payslips, role-scoped AI assistant and immutable audit logs.",
      },
      { property: "og:title", content: "HCM Lite — AI-Powered HR, Biometric Attendance & Payroll" },
      {
        property: "og:description",
        content:
          "Enterprise-grade HR suite: camera face-check attendance with GPS geofencing, automated payroll with PDF payslips, role-scoped AI assistant and immutable audit logs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
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
