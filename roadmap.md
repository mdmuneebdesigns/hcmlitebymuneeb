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
