# HCM Lite — AI-assisted Human Capital Management

A lightweight, hackathon-ready HCM system for **Admin, HR and Employee** roles with real
attendance, leave, payroll, analytics, audit trail and a role-scoped AI assistant.

## Tech stack

- **Frontend + backend:** TanStack Start v1 (React 19, Vite 7, server functions) — deploys as edge functions
- **Database + auth:** Managed cloud Postgres with Row-Level Security, email/password auth
- **Styling:** Tailwind CSS v4 + shadcn/ui, dark-mode-ready semantic tokens
- **Charts:** Recharts
- **PDF payslips:** pdf-lib (generated server-side, zero external service)
- **AI:** Managed AI Gateway — chat assistant, KPI summarizer,
  smart leave pre-fill (English + Roman Urdu), grounded policy Q&A

## Modules

| # | Module | Where |
|---|--------|-------|
| M1 | First-run company + Admin setup | `/setup` |
| M2 | Auth (temporary-password first login, forced change) | `/auth`, `/change-password` |
| M3 | Organization setup (departments, leave types, holidays, office rules, geofence) | `/org` |
| M4 | Employees: registration, directory, Employee 360, CSV import/export | `/employees` |
| M5 | Leave: apply/cancel, balances, working-day math, HR approval inbox | `/leaves` |
| M6 | Payroll: gross = 1.5×basic, deductions, late penalty, progressive tax, finalize lock, PDF payslips | `/payroll` |
| M7 | Dashboards: KPIs, weekly trend, department charts, attrition risk, anomaly alerts | `/dashboards` |
| M8 | AI assistant: role-scoped tools, dashboard summarize, smart leave pre-fill, policy Q&A | floating panel + `/leaves`, `/dashboards` |
| M9 | Comms & audit: announcements, notification bell, Admin audit-log viewer | `/announcements`, `/audit-logs` |
| Bonus | Webcam face check + GPS geofence on check-in | `/attendance` |

## Quick start (under 10 minutes)

1. Open the app — you are redirected to **/setup**.
2. Create the company: name, office start time, grace minutes, weekend days,
   half-day threshold, office location (GPS coordinates + radius) and leave types.
3. The first Admin account is created in the same wizard — write down the password.
4. Sign in as Admin → **Employees → add employee** (a temporary password is shown **once**) or
   upload employees via CSV (template downloadable from the directory).
5. Employees sign in with their temporary password and are forced to set a new one.
6. HR/Admin check themselves in and employees use **Attendance → Check in**
   (optionally with camera face check + GPS).

## Business rules (implemented server-side)

- **Timezone:** all attendance math uses **Pakistan Standard Time** (`Asia/Karachi`).
- **Late** = check-in strictly after office start + grace. **Half-day** = worked hours below the
  company threshold, applied at check-out.
- **Leave** counts working days only (weekends + holidays skipped); overlap and over-quota
  requests are rejected with HTTP 422.
- **Payroll:** gross = 1.5 × basic (HRA 40% + medical 10%); per-day = gross ÷ working days;
  deductions for absent, unpaid leave, half-days and lates (configurable "N lates = 0.5 day");
  proration for joiners/leavers; annualized progressive tax slabs
  (0–600k: 0% · 600k–1.2M: 5% · 1.2M–2.4M: 30k+15% · 2.4M–3.6M: 210k+25% · >3.6M: 510k+35%).
- **Finalize** locks a payroll run permanently (Admin only); payslips download as PDF.
- **Security:** roles live in a protected `user_roles` table checked via a security-definer
  function; every privileged write is verified server-side and logged with before/after JSON in
  `audit_logs`. No client can escalate privileges.

## Testing / judging

- The Admin dashboard has a **Wipe database (Judge Reset)** button — it clears all data and
  returns the app to the empty first-run state (`/setup`).
- Suggested test flow: setup → create employee → temp login → change password → check-in/out →
  apply leave → HR approves → run payroll draft → Admin finalizes → dashboards → announcements →
  audit logs → ask the AI assistant.

## Environment

All configuration is supplied by the hosting integration
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`); no manual
`.env` is needed. The AI assistant reads its gateway key from the server environment
(`LOVABLE_API_KEY`) — it is never exposed to the browser.
