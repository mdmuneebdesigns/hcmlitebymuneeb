import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getMe, type Me } from "@/lib/auth.functions";
import { createAnnouncement, listAnnouncements, type AnnouncementDto } from "@/lib/comms.functions";

export const Route = createFileRoute("/_authenticated/announcements")({
  staticData: { sitemap: false },
  loader: () => getMe(),
  component: AnnouncementsPage,
  head: () => ({
    meta: [
      { title: "Announcements — HCM Lite" },
      { name: "description", content: "Company-wide announcements board for HR and Admin." },
    ],
  }),
});

function AnnouncementsPage() {
  const me = Route.useLoaderData() as Me;
  const router = useRouter();
  const listFn = useServerFn(listAnnouncements);
  const createFn = useServerFn(createAnnouncement);
  const isPrivileged = me.roles.includes("admin") || me.roles.includes("hr");

  const [items, setItems] = useState<AnnouncementDto[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listFn()
      .then(setItems)
      .catch(() => toast.error("Could not load announcements"))
      .finally(() => setLoading(false));
  }, [listFn]);

  async function post(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the announcement a title");
      return;
    }
    setBusy(true);
    try {
      const res = await createFn({ data: { title, body } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Announcement posted — everyone has been notified");
      setTitle("");
      setBody("");
      setItems(await listFn());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Megaphone className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">Announcements</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut().then(() => router.navigate({ to: "/auth", replace: true }))}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {isPrivileged && (
          <Card>
            <CardHeader>
              <CardTitle>Post an announcement</CardTitle>
              <CardDescription>All signed-in users see this in their feed and get a notification.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={post}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
                <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message (optional)" />
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Post announcement
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">No announcements yet.</CardContent>
          </Card>
        ) : (
          items.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle>{a.title}</CardTitle>
                <CardDescription>
                  {a.author_name} · {new Date(a.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              {a.body && <CardContent className="text-sm text-foreground">{a.body}</CardContent>}
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
