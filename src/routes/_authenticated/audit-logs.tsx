import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Loader2, ScrollText, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getMe, type Me } from "@/lib/auth.functions";
import { listAuditLogs, type AuditLogDto } from "@/lib/comms.functions";

export const Route = createFileRoute("/_authenticated/audit-logs")({
  loader: () => getMe(),
  component: AuditLogsPage,
  head: () => ({
    meta: [
      { title: "Audit Logs — HCM Lite" },
      { name: "description", content: "Admin-only audit trail viewer with before/after change details." },
    ],
  }),
});

function AuditLogsPage() {
  const me = Route.useLoaderData() as Me;
  const router = useRouter();
  const isAdmin = me.roles.includes("admin");
  const listFn = useServerFn(listAuditLogs);

  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listFn({ data: { query: "" } })
      .then(setLogs)
      .catch(() => toast.error("Could not load audit logs"))
      .finally(() => setLoading(false));
  }, [listFn, isAdmin]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      setLogs(await listFn({ data: { query } }));
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-sm text-center">
          <CardHeader>
            <CardTitle>Admin only</CardTitle>
            <CardDescription>The audit trail is visible to Admin accounts only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ScrollText className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">Audit logs</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut().then(() => router.navigate({ to: "/auth", replace: true }))}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <form className="flex gap-2" onSubmit={search}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by action, entity or actor email…"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">No audit entries match this search.</CardContent>
          </Card>
        ) : (
          logs.map((log) => (
            <Card key={log.id}>
              <CardHeader
                className="cursor-pointer pb-0"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      {log.action} <span className="text-muted-foreground">· {log.entity}</span>
                      {log.entity_id && <span className="font-mono text-xs text-muted-foreground"> #{log.entity_id.slice(0, 8)}</span>}
                    </CardTitle>
                    <CardDescription>
                      {log.actor_email} · {new Date(log.created_at).toLocaleString()}
                    </CardDescription>
                  </div>
                  {expanded === log.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              {expanded === log.id && (
                <CardContent className="space-y-2 pt-3">
                  {(log.before_json || log.after_json) && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
                        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
                          {JSON.stringify(log.before_json ?? null, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
                        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
                          {JSON.stringify(log.after_json ?? null, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  {log.metadata_json && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Metadata</p>
                      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(log.metadata_json, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.entity === "" && null}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
