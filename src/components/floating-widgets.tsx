import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Bell, Bot, Send, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiChat, type ChatMessage } from "@/lib/ai.functions";
import { listMyNotifications, markNotificationsRead, type NotificationDto } from "@/lib/comms.functions";
import { useServerFn } from "@tanstack/react-start";

const PUBLIC_PATHS = ["/", "/welcome", "/auth", "/setup"];

/** Floating notification bell + AI assistant panel, visible on signed-in pages only. */
export function FloatingWidgets() {
  const location = useLocation();
  if (PUBLIC_PATHS.includes(location.pathname)) return null;
  return (
    <>
      <NotificationBell />
      <AiChatPanel />
    </>
  );
}

function NotificationBell() {
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listFn()
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [listFn]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await markFn();
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="fixed right-4 top-4 z-50 print:hidden">
      <Button variant="outline" size="icon" className="relative rounded-full bg-background shadow" onClick={toggle} aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border bg-background p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Notifications</p>
          <div className="max-h-80 space-y-1 overflow-auto">
            {items.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">No notifications yet.</p>}
            {items.map((n) => (
              <div key={n.id} className="rounded-md px-2 py-2 hover:bg-accent">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK_PROMPTS = [
  "What is my leave balance?",
  "How many employees are there?",
  "Company late policy kya hai?",
  "Who was late today?",
];

function AiChatPanel() {
  const chatFn = useServerFn(aiChat);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const res = await chatFn({ data: { messages: next.slice(-12) } });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "The assistant could not be reached right now. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full p-0 shadow-lg print:hidden"
        aria-label="AI assistant"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </Button>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-background shadow-2xl print:hidden">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">AI Assistant</span>
              <Badge variant="secondary" className="text-[10px]">AI-generated</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Assalam! Main aap ka HR assistant hoon. Leave balance, attendance, payroll ya policy ke baare mein poochein.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-full border border-input bg-background px-3 py-1 text-xs text-foreground hover:bg-accent"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={
                    m.role === "user"
                      ? "inline-block max-w-[85%] rounded-lg bg-primary px-3 py-2 text-left text-sm text-primary-foreground"
                      : "inline-block max-w-[90%] rounded-lg bg-muted px-3 py-2 text-left text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Soch raha hoon…</p>}
          </div>
          <form
            className="flex gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask anything… (English / Roman Urdu)"
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={busy} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
