import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBlueprintPdf } from "@/lib/blueprint.functions";
import { BLUEPRINT_SECTIONS, type BlueprintBlock } from "@/lib/blueprint-report";

export const Route = createFileRoute("/_authenticated/project-blueprint")({
  head: () => ({
    meta: [
      { title: "Project Blueprint — HCM Lite" },
      { name: "description", content: "Complete A-to-Z technical architecture report of HCM Lite with one-click PDF download." },
      { property: "og:title", content: "Project Blueprint — HCM Lite" },
      { property: "og:description", content: "Complete A-to-Z technical architecture report of HCM Lite with one-click PDF download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlueprintPage,
});

function Block({ block }: { block: BlueprintBlock }) {
  if (block.kind === "h3") {
    return <h3 className="mt-6 text-sm font-semibold tracking-tight text-foreground">{block.text}</h3>;
  }
  if (block.kind === "p") {
    return <p className="text-sm leading-relaxed text-muted-foreground">{block.text}</p>;
  }
  if (block.kind === "bullets") {
    return (
      <ul className="space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "kv") {
    return (
      <div className="overflow-hidden rounded-lg border">
        <dl className="divide-y">
          {block.rows.map((row, i) => (
            <div key={i} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(140px,190px)_1fr] sm:gap-3">
              <dt className="text-xs font-semibold text-foreground">{row.k}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">{row.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      {block.text}
    </pre>
  );
}

function BlueprintPage() {
  const pdfFn = useServerFn(getBlueprintPdf);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf(): Promise<void> {
    setDownloading(true);
    try {
      const res = await pdfFn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("Blueprint PDF downloaded");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <Button size="sm" onClick={downloadPdf} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Complete Project Report (PDF)
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div>
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3 w-3" /> Technical documentation
          </Badge>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            HCM Lite — Technical Architecture, Analysis &amp; System Blueprint
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Poori app ka A-to-Z analysis: tech stack, routing, backend pipeline, security/RBAC, database,
            business logic formulas, AI pipeline aur testing — Roman Urdu me. Neeche poora report parh sakte
            hain, upar button se PDF download karein.
          </p>
        </div>

        {BLUEPRINT_SECTIONS.map((section) => (
          <Card key={section.num}>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {section.num}. {section.title}
              </h2>
              <div className="space-y-3">
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
