# HCM Lite — Build Roadmap

Plan approved: `.lovable/plan/hcm-lite-master-architectural-implementation-plan-2026-10-24.md`

## Phase 1 — Foundation (complete; verified E2E in preview)
- [x] Enable Lovable Cloud
- [x] Schema migrations (companies, user_roles, departments, designations, leave_types, public_holidays, employees, attendance, attendance_corrections, leave_requests, payroll_runs, payslips, announcements, notifications, audit_logs, ai_logs) + GRANTs + RLS
- [x] `has_role()` security-definer function
- [x] Email/password auth (enable_email_auth), login/logout/change password
- [x] First-run setup wizard (/setup) — verified: wizard → company + Admin created → login → dashboard
- [x] Role-based shell + navigation — Admin badge + company name on shell
- [x] Judge Reset utility (Admin-only wipe) — verified: wipe → empty DB → /setup
- [ ] Force password change on first sign-in (must_change_password) — flag handled at login redirect + dashboard warning; global gate pending Phase 2 (when HR temp logins exist)

## Phase 2 — Core HR
- [ ] Org setup screens (departments, designations, leave types, holidays, geofence settings)
- [ ] Employees CRUD + temporary password logins
- [ ] Directory: server-side search/filter/pagination; Employee 360
- [ ] CSV import (dry-run report) + export
- [ ] Attendance: web check-in/out (409 dup, late >09:15, half_day <5h), calendar, daily board
- [ ] Attendance corrections (request/approve)

## Phase 3 — Leave, Payroll, Dashboards, Audit
- [ ] Leave apply/balance/overlap 422 + HR approval inbox
- [ ] Payroll draft run (Gross=1.5×basic, deductions, 3 lates=0.5 day, tax slabs, proration)
- [ ] Admin finalize/lock; payslip PDF download
- [ ] Role dashboards (Recharts) + date/dept filters; attrition + anomaly flags
- [ ] Announcements, notifications, audit log viewer

## Phase 4 — AI + Camera
- [ ] AI Gateway integration + scoped tool-calling chat
- [ ] KPI summarizer, smart leave parser (EN + Roman Urdu), policy Q&A
- [ ] Guardrails: 15s timeout, fallback, rate limit, ai_logs, AI badge
- [ ] Camera + GPS geofence check-in (face detection, Haversine server-side)
- [ ] Dark mode + PWA polish; E2E judge demo script verification
