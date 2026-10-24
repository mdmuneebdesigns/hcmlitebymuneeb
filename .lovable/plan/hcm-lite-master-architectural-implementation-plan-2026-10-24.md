# HCM Lite — Master Architectural & Implementation Plan

AI-assisted Human Capital Management system (Saylani Hackathon) — React + TanStack Start + Tailwind + Lovable Cloud (PostgreSQL/Auth/RLS) + Lovable AI Gateway. Strictly no dummy data, no AI-generated images (pure code, Tailwind, Lucide SVG icons only).

## Stack decisions
- **Frontend:** TanStack Start (routes under `src/routes/`), shadcn/Tailwind v4, Recharts, Lucide icons, react-markdown for AI chat. Dark mode toggle + responsive 375px+ (PWA manifest).
- **Backend:** Lovable Cloud (Supabase Postgres + Auth). All business logic in `createServerFn` (auth via `requireSupabaseAuth`); no Edge Functions. Time/deduction math computed server-side only.
- **AI:** Lovable AI Gateway (`@lovable.dev/ai-gateway`, server-side only) for tool-calling chat, KPI summarizer, smart leave parser (English + Roman Urdu), policy Q&A. Key never leaves the server.
- **Roles:** `user_roles` table (`app_role` enum: admin/hr/employee) + `has_role()` security-definer function. Never stored on profiles. Every server fn verifies role + data scope; RLS scopes rows.

## Database schema (all tables empty at start; GRANTs + RLS in every migration)
- `companies` (name, office start 09:00, grace 15m, half_day<5h, weekend Sat–Sun, lat/lng, geofence radius m)
- `user_roles`, `departments`, `designations`, `leave_types` (Annual 14, Sick 8, Casual 10, Unpaid unlimited), `public_holidays`
- `employees` (auth link, must_change_password flag, job details, basic salary, status, face_descriptor)
- `attendance` (server-stamped in/out, unique(employee, date) → 409 on dup, status: present/late>09:15/half_day<5h/missing_checkout/absent, gps lat/lng/accuracy, haversine distance)
- `attendance_corrections` (employee request → HR approve/reject)
- `leave_requests` (working-day calc skipping weekends+holidays, overlap/quota validation → 422, HR decision + comment)
- `payroll_runs`, `payslips` (Gross=1.5×basic: HRA 40%, medical 10%; per-day=gross÷working days; deduct absent+unpaid+0.5×half-day; bonus rule 3 lates=0.5 day; prorated joiners/leavers; progressive tax on gross×12: 0–600k 0%; 5% ≤1.2M; 30k+15% ≤2.4M; 210k+25% ≤3.6M; 510k+35% above; Admin-only finalize/lock)
- `announcements`, `notifications`, `audit_logs` (immutable actor/action/entity/before-after JSON), `ai_logs`

## Key flows
- **First-run wizard:** app loads → no company row → route to `/setup` wizard: company profile + geofence + Admin account. Hidden "Judge Reset" (Admin-only wipe via service role → fresh install).
- **Auth:** email/password login; Admin/HR create logins with temporary password → `must_change_password` forces change on first sign-in. Role-scoped menus, route guards, and server-side guards on every call.
- **Data scope:** Employee reads only own rows (RLS `auth.uid()`); HR reads org data; Admin all. Employee can never read another salary — enforced by RLS + server fns + AI tools.
- **Dashboards (M7):** all KPIs from DB aggregation via server fns; filters date-range + department; formulas per Section 7 (attendance rate, late %, absenteeism, leave utilization, payroll cost, attrition). Recharts charts; tailored per role.
- **PDF payslip:** server-side PDF generation per payslip, download by Admin/HR (all) and Employee (own).
- **Audit log:** written in every create/update/approve/finalize server fn; Admin-only viewer.

## AI Assistant (M8)
- Chat panel → server fn → AI Gateway chat with tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`. Tools run against the caller's RLS scope; unauthorized asks politely refused.
- KPI Summarizer (Admin/HR): 3–5 bullets strictly from current filtered KPI JSON.
- Smart leave pre-fill: NL (English + Roman Urdu) → `{type, start, end, reason}` → pre-filled form the user confirms.
- Policy Q&A grounded in the brief's rules. Guardrails: 15s timeout, friendly fallback, per-user rate limiting, `ai_logs` logging, "AI-generated" badge on all outputs.

## Bonus (+10)
1. Camera + GPS geofence check-in (web): webcam face detection (exactly 1 face), Geolocation accuracy ≤100m, server-side Haversine vs office coords; optional face descriptor match + blink liveness; result stored, not the photo.
2. Attrition risk score + absence anomaly flags on Admin/HR dashboards.
3. Configurable late penalty (3 lates = 0.5 day).
4. Roman Urdu in AI chat + smart leave parser.
5. Dark mode + responsive PWA-ready UI.

## Build phases
- **Phase 1 — Foundation:** Lovable Cloud enable, schema migrations + GRANTs + RLS + `user_roles`/`has_role`, email auth, login/logout/change password, first-run wizard, role-based shell/nav, password change flow, Judge Reset.
- **Phase 2 — Core HR:** org setup screens (depts, designations, leave types, holidays, geofence settings), employees CRUD + temporary-password logins, directory + search/filter/pagination, Employee 360, CSV import (dry-run report) + export, attendance check-in/out (409/late/half-day rules), calendar + daily board, corrections.
- **Phase 3 — Leave, Payroll, Dashboards, Audit:** leave apply/balance/overlap validation + HR approval inbox, payroll draft run (deductions, tax, proration), Admin finalize/lock, payslip PDF, role dashboards with Recharts + filters, attrition/anomaly bonus, announcements + notifications, audit log viewer.
- **Phase 4 — AI + Camera:** AI Gateway integration, tool-calling chat with scoped tools, KPI summarizer, smart leave parser (EN + Roman Urdu), policy Q&A, guardrails + `ai_logs`, camera+geofence check-in with face detection, final E2E demo-script verification.

Each phase is verified end-to-end (build + runtime checks) before the next begins.

## Verification per phase
- Server rules get automated tests (409 dup check-in, 422 leave overlap, tax slab math, RBAC denials).
- Playwright walkthrough of the judge demo script after Phase 4.
