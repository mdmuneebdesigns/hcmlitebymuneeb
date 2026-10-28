# HCM Lite — Build Roadmap

Plan approved: `.lovable/plan/hcm-lite-master-architectural-implementation-plan-2026-10-24.md`

## Phase 1 — Foundation (complete; verified E2E in preview)
- [x] Enable Lovable Cloud
- [x] Schema migrations (16 tables) + GRANTs + RLS + `has_role()`
- [x] Email/password auth, login/logout/change password
- [x] First-run setup wizard (/setup) — verified: wizard → company + Admin created → login → dashboard
- [x] Role-based shell + navigation — Admin badge + company name on shell
- [x] Judge Reset utility (Admin-only wipe)
- [x] Force password change on first sign-in — employees via `employees.must_change_password`; HR/Admin logins (no employee row) via auth `user_metadata.must_change_password`; verified for both

## Phase 2 — Core HR (complete; verified E2E in preview)
- [x] Org setup screens (/org, Admin-only): departments, designations, leave types + quotas, public holidays, office settings (start/grace/half-day/weekend/lat-lng/geofence) — full CRUD + audit
- [x] Employee registration (HR/Admin): auto-creates confirmed login with system-generated temporary password, `must_change_password=true`, employee role; Admin-only HR login creation
- [x] Directory (/employees): server-side search (name/email/code), department + status filters, pagination; CSV export; row → Employee 360
- [x] Employee 360 (/employees/$id): job details, salary (own or HR/Admin only), own phone/address editing, last-30 attendance history; HR/Admin edit dialog (job details, status, exit date)
- [x] CSV import: dry-run report with exact row/field/reason (missing fields, duplicate code/email, invalid email, unknown dept/designation, non-ISO date, salary ≤ 0) → imports valid rows, shows one-time temp passwords
- [x] Attendance (/attendance): web check-in/out with server-stamped time + GPS capture (distance via Haversine), 409 conflict on duplicate check-in (UI-disabled + server guard + DB unique index), late after office start + grace (PKT), half-day under threshold at checkout, missing_checkout/absent on day board
- [x] My attendance (last 30 days) + Daily board (HR/Admin, date picker + status summary)
- [x] Corrections: employee request (date/field/time/reason, dup-pending guard) → HR/Admin approve/reject with comment
- [x] Audit logging on every create/update/approve (before/after JSON) — verified rows in `audit_logs`
- [x] Tests: 27 unit tests (attendance rules: PKT stamping, late/half-day/weekend, Haversine, day-board status; CSV rules: full dry-run matrix, parse/export) — all passing

## Phase 3 — Leave, Payroll, Dashboards, Audit (complete; verified E2E in preview)
- [x] Leave apply/balance/overlap 422 + HR approval inbox (`/leaves`, leave-rules tests) — verified: employee applied Annual 26–27 Oct (Roman-Urdu AI pre-fill), balances 2 pending / 12 remaining, Admin approved, employee notification received
- [x] Payroll draft run (Gross=1.5×basic, deductions, late penalty, tax slabs, proration) (`/payroll`, payroll-rules tests) — verified: Oct 2026 draft = 3 payslips, gross PKR 330,000, net PKR 70,181.82; current-month rule fixed (`isFutureMonth`)
- [x] Admin finalize/lock; payslip PDF download (pdf-lib, per-employee or per-run) — verified: run locked "finalized", employee downloaded `October_2026_payslip.pdf`; `payslip.download` audited
- [x] Role dashboards (Recharts) + date/dept filters; attrition + anomaly flags (`/dashboards`) — verified: KPIs, dept donut/bar, attrition scores, absenteeism anomaly
- [x] Announcements, notification bell, audit log viewer (`/announcements`, `/audit-logs`) — verified: posting writes through admin client (tables intentionally have no user INSERT policies)

## Phase 4 — AI + Camera (complete; verified E2E in preview)
- [x] AI Gateway integration + scoped tool-calling chat (`src/lib/ai.functions.ts`, `ai.tools.server.ts`) — verified: "What is my leave balance?" returned role-scoped table with AI badge
- [x] KPI summarizer — verified: "Summarize with AI" produced 4 bullet insights from live KPIs with AI-generated badge
- [x] Smart leave parser (EN + Roman Urdu) — verified: "Mujhe agle Monday aur Tuesday chutti chahiye" pre-filled Annual + correct next Mon/Tue dates
- [x] Guardrails: 15s timeout, friendly fallbacks, per-user rate limit, `ai_logs`, AI badge
- [x] Camera + GPS geofence check-in (FaceDetector, skip option; server-side Haversine; `webcam`/`webcam+gps` check_method)
- [x] README + .env.example — done; test credentials handed off in chat (Admin / HR / Employee)
- [x] Dark mode toggle — verified: sun/moon button on every page (incl. /setup, /auth), persists across reloads, no first-paint flash, OS preference fallback (src/components/theme-toggle.tsx)

## Project Blueprint report (2026-10-27)
- [x] `/project-blueprint` page — full A-to-Z technical report (Roman Urdu) rendered in-app + "Project Blueprint PDF" link on dashboard header
- [x] One-click PDF download — server-side pdf-lib generation (`src/lib/blueprint.functions.ts`, content in `src/lib/blueprint-report.ts`), 7-page A4 report; verified via Playwright download + per-page visual QA

## SaaS Landing, Brand & Security Hardening (2026-10-27; complete; verified E2E)
- [x] Brand identity: `<BrandLogo />` SVG component (indigo→violet→emerald gradient squircle "H" + biometric frame + AI spark) + `public/favicon.svg` (favicon.ico removed); used on landing navbar, /auth, /setup, dashboard header and inside Payslip/Blueprint PDFs
- [x] SaaS landing page at `/` and `/welcome` (`src/components/landing.tsx`): sticky glass navbar, animated hero, 4-card bento grid (radar geofence, Roman-Urdu AI typing preview, payroll table, RBAC/audit/RLS), 3-step how-it-works, architecture section; signed-in visitors on `/` redirect to /dashboard
- [x] Enterprise theme (indigo/violet/emerald) in `src/styles.css`: new light+dark oklch tokens, `success`/`warning` tokens, `gradient-brand`/`text-gradient-brand`/`glass` utilities; dark mode re-verified visually
- [x] Secured /setup: login required (beforeLoad → /auth?redirect=/setup); fresh-install Sign-Up tab on /auth (PasswordStrengthChecklist) → `provisionFirstAdmin` server fn (fresh-install guarded, creates confirmed admin + role) → auto sign-in → /setup; after setup the tab disappears; "Workspace Active" banner on /setup when company exists (Go to Dashboard / Update Company Setup)
- [x] Wipe guard: dashboard RESET modal requires typing `RESET` exactly (wrong text keeps button disabled); `wipeAllData` stays Admin-only server-side
- [x] RLS re-verified: all 16 public tables RLS-enabled with policies; TS zero errors, 64/64 tests, build OK; E2E verified landing → signup → setup → dashboard → RESET wipe → fresh signup state, zero console errors; test data wiped

## Demo state (as of 2026-10-26)
Database is intentionally EMPTY (fresh /setup state for judging — zero dummy data). Test flow verified end-to-end on 2026-10-26: /setup wizard → Admin auto sign-in → payroll draft run → payslip PDF download (October_2026_payslip.pdf, math + layout QA'd). Test data was wiped after verification. Create real accounts via /setup; Judge Reset (Admin dashboard) wipes everything back to /setup.

## SEO / AEO / GEO + Enterprise Demo (2026-10-27; complete)
- [x] Unique per-route metadata via `pageMeta()` (`src/lib/seo.ts`): unique title/description/OG/Twitter + `og:url` on every route; canonical links on public leaves; `noindex, nofollow` on `/auth`, `/setup`, `/project-blueprint` (login-gated) and ALL authenticated views (robots meta on `_authenticated` layout)
- [x] JSON-LD `@graph` (WebApplication + Organization + ContactPoint + Person + FAQPage with 6 Q&A) on `/` and `/welcome`; TechArticle graph on `/project-blueprint`
- [x] FAQ accordion on landing (`#faq`) mirroring FAQPage schema item-for-item; semantic `<main>` landmark, single `<h1>`
- [x] Sitemap: router-derived helper `src/lib/sitemap.ts` + server route `src/routes/sitemap[.]xml.ts` (BASE_URL https://hcmlitebymuneeb.lovable.app); `staticData.sitemap` decision on every route; / and /welcome included, private subtree excluded — verified 200 application/xml with 2 URLs
- [x] robots.txt: all search + AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Google-Extended, ClaudeBot) allowed + Sitemap directive — verified 200
- [x] `public/llms.txt` + `public/llms-full.txt` (llmstxt.org spec) — verified 200
- [x] Enterprise Demo section (`#enterprise`, `src/components/landing-extras.tsx`): 7 fields, honeypot, FormSubmit AJAX → mdmuneebdesigns@gmail.com, 20s timeout, emerald success state, toast, navbar + footer links, HTML form-POST fallback button on error. Endpoint verified reachable (HTTP 200, CORS open); delivery needs one-time FormSubmit activation email click by owner

## Monetization Phase 1 (2026-10-27; complete)
- [x] `enterprise_leads` table (anon INSERT-only) + `demo_events` analytics table; public server fn `submitEnterpriseLead` stores lead first, then forwards to FormSubmit server-side (iframe/CORS-proof); emerald success modal "✅ Request Received!" after storage
- [x] Booking form root-cause fix: no more "Send failed — please email directly" as primary failure; contact badges (WhatsApp PK Desk +92-3140263346, US Desk +1 (775) 312-8079, mdmuneebdesigns@gmail.com) in booking section, footer, quota modal; floating WhatsApp CTA on public pages
- [x] Interactive Demo Mode: 5-action quotas per module, sticky quota bar, upgrade + End Demo buttons, quota-reached upsell modal (WhatsApp / US Desk / Activate License Key → lead pipeline), demo PDF payslip receipts (pdf-lib client-side), never auto-closes; entry points on landing hero + auth page
- [x] Pricing section (#pricing + nav link): Free demo trial · $49/mo (shown with $100 cut) · $499 one-time (shown with $999 cut); Offer schema added to JSON-LD

## Monetization Phase 2 — Super Admin License & Device Control (2026-10-27; complete)
- [x] `workspace_licenses` table (RLS on, service-role only; no public policies — all access via admin client inside role-gated server fns)
- [x] `/super-admin` owner console (PIN-gated `MUNEEB-ADMIN-2026`): License generator (monthly 30d / lifetime / 7-day trial), Copy + WhatsApp send, Reset Device Lock, Extend 30 Days, Revoke/Reactivate; Companies monitor (admin email, employees, device, ban with `DELETE` confirm); Leads inbox with one-click license approval; Activity feed from `audit_logs`
- [x] 1-device lock: SHA-256 device fingerprint (platform + screen + timezone + persistent localStorage token) in `src/lib/device.ts`; `/setup` requires a valid license key, binds first device; `/auth` sign-in + dashboard re-check `checkDeviceLock` and show full-page `LicenseLockScreen` on a second device
- [x] Key format `HCM-30D-XXXXXXXX` / `HCM-LIFE-XXXXXXXX` / `HCM-TRIAL-XXXXXXXX` (unambiguous alphabet, no 0/O/1/I/L); auto-expiry on sight; `formatDaysLeft` badges (♾️ lifetime / N days left / expired)
- [x] Master key `MUNEEB-VIP` is owner-only — `validateLicenseKey` and `completeFirstRunSetup` reject it for any account whose email is not `mdmuneebdesigns@gmail.com`
- [x] E2E verified: fresh signup → /setup wrong key rejected → valid key verified → company created → dashboard; 2nd-device sign-in shows lock screen; super-admin unlock, generate (lifetime + trial), companies tab with ban button; TypeScript clean, 83/83 tests, build OK; test data wiped

## Email Delivery Fix + Admin Guide PDF (2026-10-28; complete)
- [x] FormSubmit email root-cause fix in `src/lib/leads.functions.ts`: server-side fetch now sends `Referer: https://hcmlitebymuneeb.lovable.app/` (FormSubmit rejects server POSTs without it — "open this page through a web server"), plus User-Agent, JSON `success:"true"` verification (bare HTTP 200 no longer counts as delivered), and one retry after 1.5s
- [x] E2E verified via Playwright: booking form submit → success modal, no "email delivery pending" toast (FormSubmit accepted from workerd runtime); QA test lead deleted afterwards
- [x] FormSubmit activation reminder: owner must click the first "Activate Form" email link once; guaranteed fallback = Super Admin → Leads tab (DB-stored)
- [x] `/mnt/documents/HCM_Lite_Admin_User_Guide.pdf` — 10-page Roman Urdu step-by-step guide (pages/URLs, setup wizard, admin/HR/employee login, temp passwords, demo credentials, super-admin PIN + license generation, per-page click-by-click, email/booking system, security, quick-reference credentials card); visual QA on all pages
