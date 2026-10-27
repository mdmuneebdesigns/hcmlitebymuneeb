import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BLUEPRINT_SECTIONS,
  REPORT_SUBTITLE,
  REPORT_TITLE,
  type BlueprintBlock,
} from "@/lib/blueprint-report";

// Standard-font safe text (Helvetica/Courier use WinAnsi).
function sanitize(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

interface PageRef {
  page: import("pdf-lib").PDFPage;
}

async function buildBlueprintPdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();

  const W = 595;
  const H = 842;
  const M = 50;
  const CW = W - M * 2; // 495
  const BOTTOM = 64;

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const dark = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.44, 0.5);
  const accent = rgb(0.16, 0.34, 0.78);

  let page = doc.addPage([W, H]);
  let y = H - M;

  const wrap = (text: string, f: typeof font, size: number, max: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const candidate = cur.length > 0 ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) <= max) {
        cur = candidate;
      } else {
        if (cur.length > 0) lines.push(cur);
        // single very long token: hard-split
        if (f.widthOfTextAtSize(w, size) > max) {
          let piece = "";
          for (const ch of w) {
            if (f.widthOfTextAtSize(piece + ch, size) > max) {
              lines.push(piece);
              piece = ch;
            } else piece += ch;
          }
          cur = piece;
        } else cur = w;
      }
    }
    if (cur.length > 0) lines.push(cur);
    return lines;
  };

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };

  const drawLines = (
    lines: string[],
    x: number,
    f: typeof font,
    size: number,
    lh: number,
    color = dark,
  ) => {
    for (const line of lines) {
      page.drawText(line, { x, y, size, font: f, color });
      y -= lh;
    }
  };

  // ---------- Cover ----------
  page.drawRectangle({ x: 0, y: H - 210, width: W, height: 210, color: accent });
  const titleLines = wrap(REPORT_TITLE, bold, 22, CW);
  let ty = H - 90 - titleLines.length * 28;
  for (const line of titleLines) {
    page.drawText(line, { x: M, y: ty, size: 22, font: bold, color: rgb(1, 1, 1) });
    ty += 28;
  }
  for (const line of wrap(REPORT_SUBTITLE, font, 11, CW)) {
    page.drawText(line, { x: M, y: ty, size: 11, font, color: rgb(0.9, 0.93, 1) });
    ty += 16;
  }
  y = H - 260;
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  for (const line of [
    "Document: Technical Architecture, Analysis & System Blueprint (A-to-Z)",
    `Generated: ${now} (Pakistan Standard Time)`,
    "App: HCM Lite — AI-assisted Human Capital Management (Saylani Hackathon)",
    "Stack: TanStack Start (React 19) + Lovable Cloud (PostgreSQL/Auth/RLS) + Lovable AI Gateway",
    "This PDF is generated server-side with pdf-lib — no external service involved.",
  ]) {
    for (const l of wrap(line, font, 10, CW)) {
      page.drawText(l, { x: M, y, size: 10, font, color: muted });
      y -= 16;
    }
    y -= 4;
  }

  // ---------- Sections ----------
  const drawBlock = (block: BlueprintBlock) => {
    if (block.kind === "h3") {
      need(34);
      y -= 8;
      drawLines(wrap(block.text, bold, 11, CW), M, bold, 11, 15);
      y -= 2;
      return;
    }
    if (block.kind === "p") {
      const lines = wrap(block.text, font, 9.5, CW);
      need(lines.length * 13 + 8);
      y -= 4;
      drawLines(lines, M, font, 9.5, 13);
      y -= 2;
      return;
    }
    if (block.kind === "bullets") {
      for (const item of block.items) {
        const lines = wrap(item, font, 9.5, CW - 16);
        need(lines.length * 13 + 2);
        page.drawText("\u2022", { x: M + 2, y, size: 9.5, font, color: accent });
        drawLines(lines, M + 16, font, 9.5, 13);
        y -= 2;
      }
      return;
    }
    if (block.kind === "kv") {
      const LK = 185;
      const VK = CW - LK - 14;
      for (const row of block.rows) {
        const keyLines = wrap(row.k, bold, 9.5, LK);
        const valLines = wrap(row.v, font, 9.5, VK);
        const h = Math.max(keyLines.length, valLines.length) * 13;
        need(h + 6);
        page.drawRectangle({ x: M - 4, y: y - h + 9, width: CW + 8, height: h + 2, color: rgb(0.97, 0.975, 0.99) });
        // row top is at y; draw key column then value column
        let ky = y;
        for (const l of keyLines) {
          page.drawText(l, { x: M, y: ky, size: 9.5, font: bold, color: dark });
          ky -= 13;
        }
        let vy = y;
        for (const l of valLines) {
          page.drawText(l, { x: M + LK + 14, y: vy, size: 9.5, font, color: muted });
          vy -= 13;
        }
        y -= h + 4;
      }
      return;
    }
    // code
    const lines: string[] = [];
    for (const raw of block.text.split("\n")) lines.push(...wrap(raw, mono, 8.5, CW - 12));
    need(lines.length * 11 + 10);
    y -= 4;
    page.drawRectangle({ x: M - 4, y: y - lines.length * 11 + 2, width: CW + 8, height: lines.length * 11 + 4, color: rgb(0.94, 0.95, 0.97) });
    for (const l of lines) {
      page.drawText(l, { x: M + 4, y, size: 8.5, font: mono, color: rgb(0.2, 0.25, 0.4) });
      y -= 11;
    }
    y -= 4;
  };

  for (const section of BLUEPRINT_SECTIONS) {
    need(60);
    y -= 10;
    const head = `${section.num}. ${section.title}`;
    drawLines(wrap(head, bold, 13, CW), M, bold, 13, 17);
    page.drawLine({
      start: { x: M, y: y + 4 },
      end: { x: W - M, y: y + 4 },
      thickness: 0.8,
      color: rgb(0.85, 0.87, 0.92),
    });
    y -= 8;
    for (const block of section.blocks) drawBlock(block);
  }

  // ---------- Footers ----------
  const pages: PageRef[] = doc.getPages().map((p) => ({ page: p }));
  const total = pages.length;
  pages.forEach((p, i) => {
    p.page.drawText(sanitize(`HCM Lite Technical Blueprint | page ${i + 1}/${total}`), {
      x: M,
      y: 34,
      size: 7.5,
      font,
      color: muted,
    });
  });

  return doc.save();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const getBlueprintPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true; filename: string; base64: string } | { ok: false; error: string }> => {
    // The blueprint is non-sensitive documentation; any signed-in user may download it.
    try {
      const bytes = await buildBlueprintPdf();
      return { ok: true, filename: "HCM_Lite_Technical_Blueprint.pdf", base64: toBase64(bytes) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "PDF generation failed" };
    }
  });
