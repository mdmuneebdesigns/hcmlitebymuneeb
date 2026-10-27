import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing";
import { pageMeta, canonicalLink, jsonLdScripts, hcmJsonLdGraph } from "@/lib/seo";

export const Route = createFileRoute("/welcome")({
  staticData: { sitemap: true },
  head: () => ({
    meta: pageMeta({
      title: "Welcome to HCM Lite — Enterprise HR Suite Tour & Live Demo",
      description:
        "Take a guided tour of HCM Lite: AI biometric attendance with geofenced check-ins, automated Pakistani payroll, role-scoped Roman Urdu AI — then launch your own workspace in minutes.",
      path: "/welcome",
    }),
    links: canonicalLink("/welcome"),
    scripts: jsonLdScripts(hcmJsonLdGraph()),
  }),
  component: LandingPage,
});
