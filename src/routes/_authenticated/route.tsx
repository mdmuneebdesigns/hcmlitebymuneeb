import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Every authenticated view is a private, per-tenant surface — never indexed.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  staticData: { sitemap: "exclude-subtree" },
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", replace: true });
    }
  },
  component: () => <Outlet />,
});
