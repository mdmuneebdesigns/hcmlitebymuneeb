import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — HCM Lite" },
      {
        name: "description",
        content:
          "HCM Lite: AI-powered HR with camera attendance, GPS geofencing, automated payroll and a Roman Urdu AI assistant. Set up your company in minutes.",
      },
      { property: "og:title", content: "Welcome — HCM Lite" },
      {
        property: "og:description",
        content:
          "HCM Lite: AI-powered HR with camera attendance, GPS geofencing, automated payroll and a Roman Urdu AI assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});
