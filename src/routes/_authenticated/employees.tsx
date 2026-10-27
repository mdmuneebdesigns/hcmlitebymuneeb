import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route: /employees/<id> (Employee 360) renders here, so this file
// must only render the Outlet — the HR/Admin gate lives on employees.index.
export const Route = createFileRoute("/_authenticated/employees")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
