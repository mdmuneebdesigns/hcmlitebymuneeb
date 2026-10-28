// Server-only Google Gemini client for the public website assistant.
// The API key lives in the secret store (GEMINI_API_KEY) and is read inside
// the request path only — it never reaches the browser bundle.

const GEMINI_MODEL = "gemini-2.5-flash"; // latest low-cost fast model
const TIMEOUT_MS = 15_000;

export interface GeminiTurn {
  role: "user" | "assistant";
  content: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

/**
 * Grounded Gemini call. Returns the reply text, or null when the key is not
 * configured or the call fails — callers fall back to the Lovable AI Gateway.
 */
export async function callGemini(instructions: string, turns: GeminiTurn[]): Promise<string | null> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: turns.map((t) => ({
          role: t.role === "assistant" ? "model" : "user",
          parts: [{ text: t.content }],
        })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[gemini] HTTP", res.status);
      return null;
    }
    const json = (await res.json()) as GeminiResponse;
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.error("[gemini]", e);
    return null;
  }
}
