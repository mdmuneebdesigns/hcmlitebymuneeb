<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- **Attendance timezone:** all server-side attendance math (work_date, late rule) uses Pakistan Standard Time via `pktStamp()` in `src/lib/rules/attendance-rules.ts` — the schema has no per-company timezone. Late = strictly after office start + grace; half-day = worked hours below the company threshold, applied at checkout.
- **Privileged writes:** `employees`, `attendance`, `attendance_corrections`, `audit_logs` have no user INSERT/UPDATE RLS policies by design; server functions verify role via `requireAnyRole` first, then write through `supabaseAdmin` (dynamic import inside the handler) and log to `audit_logs` with before/after JSON.
- **Temporary-password flag:** employee logins carry `employees.must_change_password`; HR/Admin logins (no employees row) carry auth `user_metadata.must_change_password`. `getMe` merges both; `clearMustChangePassword` clears both. Supabase Auth now requires `current_password` on password change — the change-password page sends it.
- **Route layout pattern:** `/employees` is a layout route (`employees.tsx` renders `<Outlet/>` only); the HR/Admin-gated directory lives in `employees.index.tsx`, so `/employees/$id` (Employee 360, open to own employee) is not caught by the directory's role redirect. Do not re-add a loader with a role redirect to `employees.tsx`.
- **Shared UI:** status chips come from `src/components/status-badge.tsx` — do not re-export them from route files.
- **Temp passwords are system-generated** (crypto-random, mixed classes) and shown once in the UI; never store them beyond the creation response.
- **Dark mode:** theme lives in `hcm-theme` localStorage + a `.dark` class on `<html>`; the no-flash inline script in `__root.tsx` applies it before paint and the `ThemeToggle` component is the only writer (rendered floating in the root route and optionally inline, e.g. the landing navbar) — don't add other theme writers.
- **Landing & setup flow:** `/` and `/welcome` render the shared SaaS landing (`src/components/landing.tsx`); signed-in visitors on `/` redirect to `/dashboard`. `/setup` is authenticated-only (beforeLoad session check → `/auth?redirect=/setup`); fresh-install sign-up goes through `provisionFirstAdmin` (public fn, guarded to run only while `companies` is empty — creates a confirmed admin + role) and the Sign-Up tab on `/auth` exists only while no company exists. Once a company exists, `/setup` shows a "Workspace Active" banner and never overwrites data.
- **Wipe guard:** the dashboard "Wipe database" modal requires typing `RESET` exactly before the action enables; the server fn `wipeAllData` stays Admin-only via `requireAnyRole`.
- **Brand theme:** primary is royal indigo; brand gradient utilities `gradient-brand` / `text-gradient-brand` are defined in `src/styles.css` — reuse them instead of hardcoding hexes; brand mark is `src/components/brand-logo.tsx` + `public/favicon.svg` (no favicon.ico).
- **AI calls** use `@lovable.dev/ai-gateway` (`generateResponse`, model `openai/gpt-6-astra`, responses surface) inside `src/lib/ai.functions.ts` only; role scoping lives in `src/lib/ai.tools.server.ts` (`AI_TOOLS`), every call is logged to `ai_logs`, 15s timeout, no client-visible secrets.
- **Payroll/leave/announcement writes** follow the same privileged pattern as attendance: role-verified server fn → dynamic `supabaseAdmin` import → `audit_logs` before/after; finalized payroll runs are immutable (no re-run, no delete). Announcements/notifications tables intentionally have no user INSERT RLS policies.
- **Payroll period rule:** a draft run is allowed for the current month mid-month (pays today's attendance/leave data); only a month that has not started is rejected — see `isFutureMonth()` in `src/lib/rules/payroll-rules.ts` (unit-tested).

- **Demo mode:** Interactive Demo (`src/lib/demo.ts` + `src/components/demo-mode.tsx`) is client-side ONLY — it must never write to the real workspace (no company/employee/attendance writes); quotas are 5 per module (employees/check-ins/leaves/receipts/AI) persisted in localStorage key `hcm-demo-session`, and the session ends only via "End Demo" (never auto-close). Demo usage analytics go to the anon-insert-only `demo_events` table; license-key activations submit through the same lead pipeline.
- **License/device lock:** `/setup` requires a valid `workspace_licenses` key; first device binds via SHA-256 fingerprint (`src/lib/device.ts`), sign-in + dashboard re-check via `checkDeviceLock` and render `LicenseLockScreen`. All license writes go through service-role server fns (table is RLS-on with no public policies). The master key `MUNEEB-VIP` is accepted only for the owner account email; `/super-admin` is the owner PIN console.
- **Lead capture:** booking form + license activations store into `public.enterprise_leads` FIRST via the public server fn `submitEnterpriseLead` (anon INSERT-only policy), then forward to FormSubmit server-side; storage success always shows the success modal — never surface a "Send failed" primary state.
