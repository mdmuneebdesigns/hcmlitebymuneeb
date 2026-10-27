/**
 * Shared SEO / AEO / GEO data: unique per-route head metadata, JSON-LD
 * structured data (@graph), and the FAQ content that backs both the on-page
 * accordion and the FAQPage schema.
 */

export const SITE_URL = "https://hcmlitebymuneeb.lovable.app";

/** Creator / owner of HCM Lite. */
export const SITE_AUTHOR = {
  "@type": "Person",
  name: "Muhammad Muneeb",
  jobTitle: "AI Engineer, Data Scientist & Full-Stack Developer",
  email: "mailto:mdmuneebdesigns@gmail.com",
} as const;

/** FAQ items — rendered as an accordion on the landing page and mirrored into FAQPage JSON-LD. */
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "How does HCM Lite detect faces and verify the GPS office geofence during check-in?",
    a: "At check-in and check-out the browser captures a live camera frame and runs on-device image analysis to confirm a face is present before the punch is accepted. In parallel, HCM Lite resolves the device position through a multi-stage GPS pipeline (high-accuracy GPS, Wi-Fi positioning, then IP geolocation) and computes the Haversine distance to your configured office coordinates. Punches outside the geofence radius are rejected, and all attendance math runs in Pakistan Standard Time (Asia/Karachi).",
  },
  {
    q: "How does the Roman Urdu & English AI Assistant automate leave requests and HR analytics?",
    a: "The assistant is role-scoped: Employees can type a natural request such as “Mujhe Monday aur Tuesday chutti chahiye” and the AI parses it into a pre-filled leave form; HR gets headcount and attendance summaries; Admin gets payroll cost insights. It works through a tool-calling AI gateway with a 15-second timeout, and every call is recorded in the ai_logs table for full traceability.",
  },
  {
    q: "How are Pakistani income tax slabs and attendance deductions calculated in Payroll Lite?",
    a: "Payroll builds gross pay from basic salary plus house rent (40%) and medical (10%) allowances, then deducts absences, half-days and late penalties computed from real attendance records, and finally applies the active progressive income-tax slab on the taxable amount. Every employee gets an instant server-generated PDF payslip, and finalized payroll runs are immutable.",
  },
  {
    q: "How does Row-Level Security (RLS) protect employee salary privacy?",
    a: "Every table is RLS-enabled directly in PostgreSQL — salaries and audit trails are isolated per role scope in the database itself, not just the UI. Roles live in a protected user_roles table and every privileged server function re-verifies the caller's role before writing, with before/after JSON recorded in immutable audit logs.",
  },
  {
    q: "How can a company book a custom deployment or an enterprise license of HCM Lite?",
    a: "Use the “Book Enterprise Demo / Buy License” form on this page or email mdmuneebdesigns@gmail.com directly. Muhammad Muneeb responds within 24 hours to discuss live product demos, SaaS subscriptions, on-premise or cloud deployments, white-label source-code licensing and AI / computer-vision integration consulting.",
  },
  {
    q: "Does HCM Lite handle weekends, grace periods and half-days automatically?",
    a: "Yes. Company setup configures office start time, a grace period in minutes, a half-day threshold in hours and weekend days. The attendance engine applies these rules consistently: late marks apply strictly after office start plus grace, checkout below the threshold records a half-day, and weekend rules are respected in every report and payroll deduction.",
  },
];

/** Full @graph JSON-LD for the landing pages: WebApplication + Organization + ContactPoint + FAQPage + Person. */
export function hcmJsonLdGraph(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "HCM Lite",
        applicationCategory: ["BusinessApplication", "HumanResourcesApplication"],
        operatingSystem: "Web",
        url: SITE_URL,
        inLanguage: ["en", "ur"],
        author: SITE_AUTHOR,
        featureList: [
          "9 core HR modules: employees, attendance, leave, payroll, dashboards, announcements, audit logs, organization and AI assistant",
          "Camera face-detection attendance at check-in and check-out",
          "Haversine GPS geofence around the office with multi-stage location fallback",
          "Roman Urdu + English role-scoped AI assistant with smart leave parsing",
          "Pakistani progressive tax-slab payroll with instant PDF payslips",
          "PostgreSQL Row-Level Security with immutable before/after audit logs",
        ],
        offers: [
          {
            "@type": "Offer",
            name: "Interactive Demo Trial",
            price: "0",
            priceCurrency: "USD",
            description: "Free interactive demo — 5 actions per module (employees, check-ins, leaves, receipts, AI queries).",
          },
          {
            "@type": "Offer",
            name: "Monthly Cloud Subscription",
            price: "49",
            priceCurrency: "USD",
            description: "30-day license, strictly 1 device lock — unlimited employees, payroll and AI assistant.",
          },
          {
            "@type": "Offer",
            name: "Lifetime Enterprise / One-Time License",
            price: "499",
            priceCurrency: "USD",
            description: "One-time payment, lifetime validity, source code and custom setup included.",
          },
        ],
      },
      {
        "@type": "Organization",
        name: "HCM Lite",
        url: SITE_URL,
        founder: SITE_AUTHOR,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "mdmuneebdesigns@gmail.com",
          availableLanguage: ["English", "Urdu"],
          areaServed: "PK",
        },
      },
      SITE_AUTHOR,
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

/** JSON-LD for the architecture blueprint page. */
export function blueprintJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: "HCM Lite — Technical Architecture, Analysis & System Blueprint",
        about: "16-table PostgreSQL schema with Row-Level Security, server-side authorization on every function, a Pakistan-timezone attendance engine, a Haversine geofence pipeline, payroll math with active tax slabs and a full audit trail.",
        author: SITE_AUTHOR,
        url: `${SITE_URL}/project-blueprint`,
      },
      SITE_AUTHOR,
    ],
  };
}

type PageMetaOptions = {
  title: string;
  description: string;
  /** Route path beginning with "/" — used for og:url and canonical. */
  path: string;
  /** Public shareable content routes: true. Auth-gated or private views: false (emits noindex). */
  indexable?: boolean;
};

/** Builds a unique, non-repeating head() meta array for one route. */
export function pageMeta({ title, description, path, indexable = true }: PageMetaOptions) {
  const url = `${SITE_URL}${path}`;
  const robots = indexable ? "index, follow" : "noindex, nofollow";
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (indexable) meta.push({ property: "og:url", content: url });
  return meta;
}

/** Canonical <link> for a leaf route — never put this on the root or a layout. */
export function canonicalLink(path: string) {
  return [{ rel: "canonical", href: `${SITE_URL}${path}` }];
}

/** Shared JSON-LD head script entries. */
export function jsonLdScripts(...graphs: Record<string, unknown>[]) {
  return graphs.map((graph) => ({
    type: "application/ld+json" as const,
    children: JSON.stringify(graph),
  }));
}
