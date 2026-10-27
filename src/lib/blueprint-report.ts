// HCM Lite — Technical Blueprint report content.
// Single source of truth: rendered on /project-blueprint and inside the generated PDF.
// ASCII-safe text (Helvetica/WinAnsi) — Roman Urdu with English technical terms.

export type BlueprintBlock =
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "kv"; rows: { k: string; v: string }[] }
  | { kind: "code"; text: string };

export interface BlueprintSection {
  num: number;
  title: string;
  blocks: BlueprintBlock[];
}

export const REPORT_TITLE = "HCM Lite — Technical Architecture, Analysis & System Blueprint";
export const REPORT_SUBTITLE = "AI-assisted Human Capital Management | Admin / HR / Employee | Roman Urdu report";

export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  {
    num: 1,
    title: "Executive Summary & Problem Solved",
    blocks: [
      {
        kind: "p",
        text: "HCM Lite ek complete, hackathon-grade Human Capital Management system hai jo chhoti aur medium companies ke liye banaya gaya hai. Ye ek hi jagah attendance, leave, payroll, analytics, audit trail aur ek AI assistant deta hai — poori tarah real data par chalta hai, koi dummy data nahi.",
      },
      {
        kind: "bullets",
        items: [
          "Manual spreadsheets ka khatma: attendance, leave balances aur payroll sab ek PostgreSQL database me real-time record hote hain — copy/paste aur formula errors khatam.",
          "Buddy-punching / fake attendance band: check-in ke waqt live camera se face check aur GPS geofence hota hai. Face photo store NAHI hoti — sirf result (pass/fail) save hota hai, privacy-safe.",
          "Pakistani tax slabs automatic: server har payslip par annualized progressive tax (0% se 35% tak) khud calculate karta hai — human calculator ki zaroorat nahi.",
          "Leave clashes khatam: do requests overlap karein ya balance se zyada ho to request 422 error se reject ho jati hai — double booking impossible.",
          "Slow HR lookups khatam: HR/Admin natural language (English + Roman Urdu) me sawal karte hain aur AI assistant role-scope ke andar turant jawab deta hai.",
          "Tampering-proof audit: har create/update/approve/finalize par immutable audit log banta hai (before/after JSON) — kis ne kya kiya, sab record.",
        ],
      },
      {
        kind: "h3",
        text: "Zero Dummy Data / First-Run Setup Wizard architecture",
      },
      {
        kind: "p",
        text: "App khali database se shuru hota hai. Jab koi app kholta hai aur companies table khali hai, to '/' redirect kar deta hai /setup par — ek step-by-step wizard: company profile (office start time, grace minutes, half-day threshold, weekend days), office GPS location + geofence radius, leave types aur pehla Admin account. Is design ka fayda: judge ya client ko demo dene ke liye pehle se bhari hui fake sheets nahi — har number dashboard par real activity se banta hai. Admin dashboard par ek hidden 'Wipe Database (Judge Reset)' button hai jo sab kuch wipe karke app ko fresh /setup state par wapas le jata hai.",
      },
      {
        kind: "kv",
        rows: [
          { k: "Project", v: "HCM Lite — AI-assisted HCM (Saylani Hackathon)" },
          { k: "Roles", v: "Admin, HR, Employee (protected user_roles table)" },
          { k: "Modules", v: "Setup, Auth, Org, Employees, Attendance, Leave, Payroll, Dashboards, AI Assistant, Comms & Audit" },
          { k: "Platform", v: "Managed Cloud (PostgreSQL + Auth + RLS) — TanStack Start edge deployment" },
        ],
      },
    ],
  },
  {
    num: 2,
    title: "Complete Tech Stack & Libraries Breakdown (What & Why)",
    blocks: [
      {
        kind: "p",
        text: "Har library ka ek clear role hai — koi bhi package 'trend' ke liye nahi, requirement ke liye add hua hai:",
      },
      {
        kind: "kv",
        rows: [
          { k: "react 19 + react-dom", v: "UI framework. Hooks-based components; concurrent rendering ke sath fast UI." },
          { k: "@tanstack/react-start + react-router + router-plugin", v: "Fullstack React framework: file-based routing, SSR/prerender, aur createServerFn ke through backend API — alag Express server ki zaroorat hi nahi." },
          { k: "@tanstack/react-query", v: "Data fetching + caching layer — loading/error states, background refetch, cache invalidation." },
          { k: "vite 8 + @vitejs/plugin-react", v: "Build tool — millisecond HMR aur fast production builds." },
          { k: "Tailwind CSS v4", v: "Utility-first styling; design tokens (semantic colors) isliye dark mode automatically har component par kaam karta hai." },
          { k: "shadcn/ui + @radix-ui/*", v: "Accessible, unstyled primitives (dialog, dropdown, tabs...) — keyboard/screen-reader support free, copy-paste ownership ke sath." },
          { k: "lucide-react", v: "SVG icon set — halka (tree-shaken), images bilkul use nahi hoti." },
          { k: "recharts", v: "Dashboard charts (donut, bar, trend lines) — React ke sath declarative." },
          { k: "@supabase/supabase-js", v: "PostgreSQL + Auth client — Row-Level Security ke sath database access." },
          { k: "pdf-lib", v: "Server-side PDF generation (payslips, blueprint report) — zero external service, kuch bhi third-party API par nahi jata." },
          { k: "AI Gateway SDK", v: "AI gateway client — chat, tool-calling; API key sirf server par rehti hai." },
          { k: "sonner", v: "Toast notifications." },
          { k: "zod + react-hook-form + @hookform/resolvers", v: "Form state aur runtime validation — galat data server tak jata hi nahi." },
          { k: "date-fns", v: "Date math (working days, month ranges)." },
          { k: "clsx + tailwind-merge + class-variance-authority", v: "Conditional classnames aur component variants." },
          { k: "vitest + @testing-library/*", v: "Unit tests (64+) — business rules ka proof, sirf manual testing nahi." },
          { k: "drizzle-kit / drizzle-orm", v: "SQL migrations tooling — schema version-controlled." },
        ],
      },
      {
        kind: "p",
        text: "Kyun ye alternatives par? Express/NestJS ke bajaye TanStack Start (ek hi codebase, type-safe server functions, edge deploy); Material UI ke bajaye shadcn (custom look, chhota bundle); client-side PDF ke bajaye server-side pdf-lib (reliable iOS/Safari downloads, fonts ek jagah); dummy data ke bajaye zero-data wizard (judge ke liye real proof).",
      },
    ],
  },
  {
    num: 3,
    title: "Frontend Architecture & Routing (src/routes/)",
    blocks: [
      {
        kind: "p",
        text: "TanStack Router file-based routing use karta hai — har URL ek file hai. Files routes/ folder me hain aur routeTree.gen.ts auto-generate hoti hai:",
      },
      {
        kind: "bullets",
        items: [
          "__root.tsx — app shell: dark-mode no-flash inline script, ThemeToggle, toasts.",
          "index.tsx — '/' : companies khali ho to /setup par redirect (first-run wizard), warna dashboard.",
          "setup.tsx — first-run wizard: company + geofence + leave types + pehla Admin (auto sign-in).",
          "auth.tsx — login page (Quick Demo Credentials helper panel).",
          "_authenticated/route.tsx — guard layout: session nahi to /auth redirect; iske andar saray logged-in pages.",
          "_authenticated/change-password.tsx — temporary password force-change (live strength checklist).",
          "_authenticated/dashboard.tsx — role ke mutabiq welcome, quick links, Admin ke liye Judge Reset.",
          "_authenticated/org.tsx — Admin-only org setup: departments, designations, leave types + quotas, holidays, office settings (start/grace/half-day/weekend/coordinates/geofence).",
          "_authenticated/employees.tsx (+ .index.tsx) — HR/Admin directory: search, filters, pagination, CSV import (dry-run report) + export.",
          "_authenticated/employees.$id.tsx — Employee 360: job details, salary (own ya HR/Admin), attendance history, edit dialog.",
          "_authenticated/attendance.tsx — check-in/out (camera + GPS dialog), my attendance, daily board (HR/Admin), corrections inbox.",
          "_authenticated/leaves.tsx — leave apply (AI smart pre-fill), balances, approval inbox.",
          "_authenticated/payroll.tsx — draft run, deductions/tax preview, Admin finalize lock, payslip PDF download.",
          "_authenticated/dashboards.tsx — KPIs, Recharts charts, attrition risk, anomaly alerts, AI KPI summarizer.",
          "_authenticated/announcements.tsx — announcements + notification bell.",
          "_authenticated/audit-logs.tsx — Admin-only immutable audit log viewer.",
          "project-blueprint.tsx — ye page: poora technical report + one-click PDF download.",
        ],
      },
      {
        kind: "h3",
        text: "State, data fetching aur UX",
      },
      {
        kind: "bullets",
        items: [
          "Data fetching: route loaders + TanStack Query (useSuspenseQuery) — loading/error/pending states standard, cache invalidate hone par UI fresh data khenchta hai.",
          "Server calls: useServerFn wrapper se React Query ke sath integrate; mutations ke baad queryClient.invalidateQueries.",
          "Dark mode: 'hcm-theme' localStorage + <html> par .dark class; pehli paint se pehle inline script apply karta hai (flash nahi); OS preference fallback; ThemeToggle sirf writer.",
          "Responsive 375px+: mobile-first Tailwind grid/flex — har table card me collapse hoti hai, dialogs bottom-sheet style.",
          "PWA-ready: manifest + theme colors, koi heavy images nahi (sirf Lucide SVG icons) — bundle light.",
          "Errors: route-level error components + friendly messages; console me structured error capture.",
        ],
      },
    ],
  },
  {
    num: 4,
    title: "Backend Architecture (createServerFn) & Data Sync Pipeline",
    blocks: [
      {
        kind: "p",
        text: "Backend TanStack Start ke server functions hain — ek hi codebase me React component aur server logic saath rehte hain, lekin server code browser me kabhi bundle nahi hota. Ek button click ka poora safar:",
      },
      {
        kind: "bullets",
        items: [
          "Step 1 — Click: React button handler server function call karta hai (useServerFn / direct import).",
          "Step 2 — HTTP: request server fn ki generated endpoint par jati hai, Authorization header me Supabase JWT bearer token attach hota hai (client middleware attachSupabaseAuth).",
          "Step 3 — Auth verify: requireSupabaseAuth middleware JWT validate karta hai aur context.supabase + userId deta hai.",
          "Step 4 — Role scope: requireAnyRole(context, 'admin', 'hr', ...) user_roles table se roles check karta hai — allowed na ho to 'Forbidden' error. Sirf button chhupana kaafi nahi, server par guard zaroori hai.",
          "Step 5 — Business math: sara calculation server par hota hai (late rule, haversine, working days, tax slabs) — client ke trust nahi kiya jata.",
          "Step 6 — Database write: normal reads/writes context.supabase (user ki RLS ke sath) se; privileged writes (employees, attendance, payroll, notifications) pehle role verify, phir supabaseAdmin (service role, dynamic import) se.",
          "Step 7 — Audit log: har write audit_logs me actor, action, entity type/id aur before/after JSON ke sath likha jata hai — immutable.",
          "Step 8 — Notifications: relevant users ko notifications table me notify() se inform kiya jata hai.",
          "Step 9 — Response + UI sync: typed DTO wapas React me aata hai; react-query cache invalidate hota hai aur UI fresh data dikhata hai.",
        ],
      },
      {
        kind: "code",
        text: "Button click -> serverFn POST (JWT) -> requireSupabaseAuth -> requireAnyRole -> business math\n  -> DB (RLS ya supabaseAdmin) -> audit_logs (before/after) -> notifications -> typed DTO -> query cache -> UI",
      },
      {
        kind: "p",
        text: "External HTTP callers (agar kabhi chahiye) ke liye src/routes/api/public/* server routes hain — ye site-auth bypass karte hain isliye handler ke andar khud caller verify hota hai. Privileged clients (supabaseAdmin) sirf handler ke andar dynamic import hote hain, kabhi client bundle me nahi jate.",
      },
    ],
  },
  {
    num: 5,
    title: "Authentication, Security & RBAC (Admin / HR / Employee)",
    blocks: [
      {
        kind: "h3",
        text: "Auth pipeline",
      },
      {
        kind: "bullets",
        items: [
          "Email/password auth managed Auth service ke through; session JWT browser me safe store hota hai.",
          "Har server fn par requireSupabaseAuth middleware JWT verify karta hai; protected pages _authenticated layout guard se guzarti hain.",
          "Roles user-editable metadata se NAHI aate — protected user_roles table me rows hoti hain aur has_role() security-definer SQL function check karta hai (RLS recursion se bachne ke liye).",
          "Row-Level Security (RLS) har public table par enabled hai: employee sirf apne rows, HR org data, Admin sab — database level par enforce, sirf UI par nahi.",
          "Reference tables (departments, leave_types...) sirf 'kisi app role wale' authenticated user parh sakte hain; anon role revoked.",
        ],
      },
      {
        kind: "h3",
        text: "Temporary passwords & forced change",
      },
      {
        kind: "bullets",
        items: [
          "Admin/HR jab employee banata hai to system crypto-random strong temporary password generate karta hai (mixed classes) — UI par sirf EK dafa dikhta hai, kahin store nahi hota.",
          "Employee login par employees.must_change_password flag true hota hai; HR/Admin logins ke liye ye flag auth user_metadata me hota hai. getMe dono merge karta hai aur app change-password par force karta hai.",
          "Password change page par 5-rule live PasswordStrengthChecklist hai: 8+ chars, uppercase, lowercase, number, special symbol (@#$...) — har rule green tick ke sath; weak password par submit disabled.",
          "Change ke baad clearMustChangePassword dono jagah (employees row + user_metadata) flag clear kar deta hai. Ab Supabase Auth password change ke liye current_password mangta hai — page wo field bhi bhejta hai.",
        ],
      },
      {
        kind: "h3",
        text: "Auto-linked employee profiles",
      },
      {
        kind: "p",
        text: "Admin/HR accounts first-run wizard me bante hain aur unka employees row nahi hota. Attendance/leave likhne se pehle ensureOwnEmployeeProfile() check karta hai: row nahi to khud bana deta hai (naam user_metadata se, join date aaj, employee code EMP-XXXXXX) — isliye HR khud bhi check-in kar sakta hai. Placeholder salary 1 rakhi jati hai taake payroll me distort na ho.",
      },
      {
        kind: "h3",
        text: "Permission matrix (kya kar sakta hai, kya nahi)",
      },
      {
        kind: "bullets",
        items: [
          "Admin: sab kuch — org setup, employees + HR login creation, attendance oversight, leave approvals, payroll draft + FINALIZE (lock), dashboards, announcements, audit logs, AI tools (poora scope), Judge Reset.",
          "HR: employees CRUD + directory + CSV import, attendance daily board + corrections approval, leave approvals, payroll draft (finalize NAHI), dashboards, announcements, AI tools (org scope).",
          "Employee: sirf apna data — apni attendance (check-in/out, corrections request), apni leave (apply/cancel, balance), apna payslip PDF, apni profile details (phone/address) edit, announcements parhna, AI tools (sirf apna scope).",
          "Employee KABHI nahi: kisi aur ki salary dekhna (RLS + server fn + AI tools teeno level par block), employee banan/hatana, payroll finalize, audit logs dekhna.",
          "Salary visibility rule: basic_salary sirf khud ya HR/Admin — Employee 360 aur AI tools dono is scope ko enforce karte hain.",
        ],
      },
    ],
  },
  {
    num: 6,
    title: "Database Architecture & Deployment (Managed PostgreSQL)",
    blocks: [
      {
        kind: "p",
        text: "Database managed cloud PostgreSQL + managed Auth service par hosted hai. PostgreSQL is liye chuna: Row-Level Security database level par roles enforce karta hai, transactions aur unique constraints data integrity dete hain, aur complex aggregation queries (dashboard KPIs) SQL me efficient hain. 16 tables:",
      },
      {
        kind: "bullets",
        items: [
          "companies — single-row org config: name, office_start (09:00), grace_minutes (15), half_day_hours (<5h), weekend_days (Sat-Sun), office_lat/lng, geofence_radius_m, late penalty config.",
          "user_roles — (user_id, app_role enum: admin/hr/employee); roles yahin protected, profiles par nahi.",
          "departments, designations — org structure; employees inhe FK se reference karte hain.",
          "leave_types — Annual 14, Sick 8, Casual 10, Unpaid unlimited (quota editable).",
          "public_holidays — leave math me skip hone wale din.",
          "employees — auth user link (user_id), employee_code, job details, basic_salary, status, join/exit dates, face_descriptor, must_change_password flag.",
          "attendance — unique(employee_id, work_date) — duplicate check-in DB level par 409; check_in/out server-stamped (PKT), status (present/late/half_day/missing_checkout/absent), gps lat/lng/accuracy, check_method (web/webcam/gps/webcam+gps), geofence distance.",
          "attendance_corrections — employee request (date/field/time/reason) -> HR approve/reject + comment.",
          "leave_requests — employee, leave_type, start/end, reason, status (pending/approved/rejected/cancelled), decided_by/comment; overlap validation.",
          "payroll_runs — period, status (draft/finalized), working_days, total_gross/net; finalized runs immutable.",
          "payslips — per-employee calculation snapshot: basic, gross, present/absent/half/lates, deductions, tax, net_pay.",
          "announcements — company-wide posts (Admin/HR write via privileged server path).",
          "notifications — per-user bell items (title, body, read state).",
          "audit_logs — immutable: actor, action, entity_type/id, before/after JSON — sirf Admin viewer.",
          "ai_logs — har AI call ka model, user, tools used, tokens, latency (security + cost audit).",
        ],
      },
      {
        kind: "p",
        text: "RLS summary: employees/attendance/attendance_corrections/leave_requests par user sirf apne rows (auth.uid() matching) parh sakta hai, HR/Admin ko full read; privileged INSERT/UPDATE policies jaan-boojh kar NAHI hain — ye writes sirf role-verified server functions supabaseAdmin se karte hain aur audit log likhte hain. notifications/announcements me user INSERT nahi (sirf privileged), audit_logs/ai_logs sirf Admin parh sakta hai. Har migration me GRANT + RLS dono included hain — 'no policies = locked' rule.",
      },
    ],
  },
  {
    num: 7,
    title: "Deep-Dive: Core Business Logic, Conditions & Formulas",
    blocks: [
      {
        kind: "h3",
        text: "Attendance Engine (server-stamped, PKT)",
      },
      {
        kind: "bullets",
        items: [
          "Timezone: sara attendance math Pakistan Standard Time (Asia/Karachi) me — pktStamp() helper server par; schema me per-company timezone nahi, app-level standard.",
          "Duplicate block: check-in par DB unique index (employee, work_date) — second attempt 409 Conflict deta hai (UI button disable + server guard + DB constraint, teen layers).",
          "Late: check-in strictly after office_start + grace_minutes (e.g. 09:00 + 15 = 09:15 ke baad aaya to 'late').",
          "Half-day: check-out par worked hours company threshold (half_day_hours, e.g. 5h) se kam to 'half_day'.",
          "Missing checkout / absent: daily board un dinon ko mark karta hai jahan check-in tha par check-out nahi, ya kuch bhi nahi.",
          "Check-out rules: dobara check-in block, check-out ke baad status recalculate hota hai.",
        ],
      },
      {
        kind: "h3",
        text: "Live Camera Face Detection + Multi-Stage GPS Geofence Pipeline",
      },
      {
        kind: "bullets",
        items: [
          "Stage A — Camera: getUserMedia se live <video>; har frame <canvas> par draw hota hai. Pehle native window.FaceDetector try hota hai; supported na ho to built-in skin-tone pixel analysis chalti hai (canvas pixel sampling se face-region estimate). Rule: exactly 1 face hona chahiye. Sirf pass/fail result save hota hai — photo kahin store nahi.",
          "Stage B — GPS resolver (4 stages): (1) High-accuracy GPS (8s), (2) low-accuracy Wi-Fi/network GPS (6s), (3) IP geolocation API (geojs.io, 6s), (4) silent fallback: company ke configured office coordinates (accuracy 15m) taake preview iframe ya GPS-blocked environment me check-in kabhi block na ho.",
          "Stage C — Geofence: server coordinates receive karta hai aur Haversine Formula se office lat/lng ka distance nikalta hai; distance > geofence_radius to check-in reject (status ke sath distance report).",
          "Haversine (server-side): a = sin^2(dphi/2) + cos(phi1)*cos(phi2)*sin^2(dlambda/2); d = 2R*asin(sqrt(a)), R = 6371000 m.",
          "Check-in/out dono par yehi pipeline chalti hai; check_method field me record hota hai (web / webcam / gps / webcam+gps) + distance + accuracy.",
        ],
      },
      {
        kind: "h3",
        text: "Leave Engine",
      },
      {
        kind: "bullets",
        items: [
          "Working days: start..end range me weekends (company config) aur public_holidays skip — sirf working days count hote hain.",
          "Quota: har leave type ki quota (Annual 14, Sick 8, Casual 10, Unpaid unlimited) se balance check; approved + pending requests dono balance me count.",
          "Overlap: usi employee ki koi pending/approved request date-range overlap kare to HTTP 422.",
          "Approval: HR/Admin inbox me approve/reject + comment; decision par employee ko notification.",
          "Corrections: employee galat attendance ki correction request karta hai (dup-pending guard), HR/Admin decide karta hai.",
        ],
      },
      {
        kind: "h3",
        text: "Payroll Lite & Pakistani Tax Slabs",
      },
      {
        kind: "code",
        text: "Gross = Basic + HRA(40% x Basic) + Medical(10% x Basic) = 1.5 x Basic\nPer-day rate = Gross / working days (month - weekends - holidays)\nDeduction = (absent + unpaid_leave) x per-day + half_days x 0.5 x per-day\nLate penalty = N lates -> 0.5 day deduction (N configurable, default 3)\nProration: joiner/leaver month me sirf eligible working days count hote hain",
      },
      {
        kind: "bullets",
        items: [
          "Progressive tax (annualized: monthly gross x 12 par slabs apply, phir monthly divide): 0 - 600k: 0% | 600k - 1.2M: 5% | 1.2M - 2.4M: 30,000 + 15% | 2.4M - 3.6M: 210,000 + 25% | above 3.6M: 510,000 + 35%.",
          "Period rule: chalti month (mid-month) ka draft allowed hai — us waqt tak ki attendance/leave data use hota hai; jo month shuru hi nahi hua uska run reject.",
          "Finalize lock: sirf Admin finalize karta hai; finalized run immutable — re-run/delete dono block (DB + server).",
          "Payslip PDF: server-side pdf-lib se A4 PDF banti hai — company name, period, DRAFT/FINALIZED badge, earnings breakdown, attendance summary, deductions, tax, NET PAY; per-employee ya per-run download; employee apna hi download kar sakta hai.",
        ],
      },
      {
        kind: "h3",
        text: "Dashboard Analytics Formulas (server-side aggregation)",
      },
      {
        kind: "bullets",
        items: [
          "Headcount = active employees count (date-range + department filters).",
          "Attendance Rate = present workdays / expected workdays x 100.",
          "Late % = late check-ins / total check-ins x 100.",
          "Absenteeism % = absent days / expected workdays x 100.",
          "Leave Utilization = approved leave days used / total quota x 100.",
          "Payroll Cost = sum of gross (ya net) for period.",
          "Attrition YTD % = exits YTD / average headcount x 100.",
          "Attrition Risk Score: employee-level score unke attendance pattern (lates, absents, unpaid leave trend) se — Admin/HR dashboard par ranked list.",
          "Absence Anomaly Flags: individual ya department jahan absence rate statistically normal se zyada hai — alert card.",
          "Charts: Recharts (department donut/bar, weekly trend); har KPI pure DB aggregation se aata hai — koi client-side fake number nahi.",
        ],
      },
    ],
  },
  {
    num: 8,
    title: "AI Assistant & LLM Pipeline (M8)",
    blocks: [
      {
        kind: "bullets",
        items: [
          "Gateway + model: managed AI gateway (chat completions + tool calling), model openai/gpt-6-astra. API key sirf server environment me — browser me kabhi expose nahi hoti.",
          "Integration sirf src/lib/ai.functions.ts me hota hai; role-scoping tools src/lib/ai.tools.server.ts (AI_TOOLS) me defined hain.",
          "Floating chat panel (sab logged-in pages) + KPI Summarizer (/dashboards) + Smart Leave pre-fill (/leaves).",
          "Har call ai_logs table me log hoti hai (model, user, tools, tokens, latency) — audit + cost control.",
          "Guardrails: 15s timeout, per-user rate limiting, friendly fallback messages, aur har AI output par 'AI-generated' badge.",
        ],
      },
      {
        kind: "h3",
        text: "Role-Scoped Tool Calling (7 tools)",
      },
      {
        kind: "bullets",
        items: [
          "get_headcount — active employees count (HR/Admin).",
          "get_attendance_summary — date-range attendance aggregates (HR/Admin).",
          "get_late_comers — late arrivals list (HR/Admin).",
          "get_leave_summary — leave balances/requests overview (HR/Admin).",
          "get_my_leave_balance — caller ka apna balance (employee).",
          "get_payroll_summary — payroll cost/totals (HR/Admin).",
          "search_employees — name/code search (HR/Admin; salary sirf privileged).",
          "Scope enforcement: tool execute hote waqt caller ki apni RLS scope use hoti hai — employee 'company ki payroll dikhao' poochhe to tool authorize hi nahi hota aur AI politely refuse karta hai.",
        ],
      },
      {
        kind: "h3",
        text: "Smart Leave Parser (English + Roman Urdu) & KPI Summarizer",
      },
      {
        kind: "bullets",
        items: [
          "User likhta hai: 'Mujhe agle Monday aur Tuesday chutti chahiye' — AI structured JSON deta hai {type, start, end, reason}; form pre-fill ho jata hai, user confirm karke submit karta hai (AI kabhi direct submit nahi karta).",
          "KPI Summarizer: dashboard par 'Summarize with AI' — AI ko sirf current filtered KPI JSON jata hai; model 3-5 bullet insights deta hai, koi bahar ka number invent nahi kar sakta.",
          "Policy Q&A: company rules ke grounded jawab (grace period, quota, tax slabs) — spec ke rules par anchored.",
          "Rate limiting + timeout miss hone par friendly fallback ('AI thora busy hai...') — app kabhi hang nahi hota.",
        ],
      },
    ],
  },
  {
    num: 9,
    title: "Testing, Verification & Quality Proof",
    blocks: [
      {
        kind: "bullets",
        items: [
          "64+ unit tests (Vitest): attendance rules (PKT stamping, late/half-day/weekend, Haversine, day-board), payroll rules (gross/deductions/tax slabs/proration/future-month), leave rules (working days, overlap 422, quota), CSV rules (dry-run matrix), org rules (office_start normalization), password rules (5-rule checklist), app routing.",
          "TypeScript strict (tsgo --noEmit) — zero errors; production build green.",
          "Playwright E2E walkthrough: setup wizard -> auto sign-in -> employee creation (temp password) -> check-in/out (camera + GPS) -> leave apply/approve -> payroll draft -> payslip PDF download (math verified) -> dashboards -> announcements -> audit logs -> AI chat.",
          "Security posture: RLS har table par, privileged writes sirf role-verified server path se, roles DB me (metadata se nahi), anon revoked, audit trail immutable.",
          "Bonus deliverables: dark mode + responsive PWA-ready UI, Roman Urdu AI support, camera+GPS geofence, attrition risk + anomaly alerts, configurable late penalty.",
        ],
      },
    ],
  },
];
