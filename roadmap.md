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

## Phase 3 — Leave, Payroll, Dashboards, Audit (code complete; E2E verification pending)
- [x] Leave apply/balance/overlap 422 + HR approval inbox (`/leaves`, leave-rules tests)
- [x] Payroll draft run (Gross=1.5×basic, deductions, late penalty, tax slabs, proration) (`/payroll`, payroll-rules tests)
- [x] Admin finalize/lock; payslip PDF download (pdf-lib, per-employee or per-run)
- [x] Role dashboards (Recharts) + date/dept filters; attrition + anomaly flags (`/dashboards`)
- [x] Announcements, notification bell, audit log viewer (`/announcements`, `/audit-logs`)

## Phase 4 — AI + Camera (code complete; E2E verification pending)
- [x] AI Gateway integration + scoped tool-calling chat (`src/lib/ai.functions.ts`, `ai.tools.server.ts`)
- [x] KPI summarizer, smart leave parser (EN + Roman Urdu), policy Q&A
- [x] Guardrails: 15s timeout, friendly fallbacks, per-user rate limit, `ai_logs`, AI badge
- [x] Camera + GPS geofence check-in (FaceDetector, skip option; server-side Haversine; `webcam`/`webcam+gps` check_method)
- [ ] Dark mode + PWA polish; E2E judge demo script verification
- [ ] README + .env.example (done) — final credential handoff for judging
