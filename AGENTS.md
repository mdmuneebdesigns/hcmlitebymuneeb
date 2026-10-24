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

