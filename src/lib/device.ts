// ============= Persistent device fingerprint (1-device license lock) =============
// Combines browser/OS traits with a persistent local cryptographic token so a
// buyer cannot trivially reshare one license across devices. All browser reads
// stay inside the async function body — safe to import from SSR modules.

export interface DeviceIdentity {
  /** SHA-256 hash of the device traits + persistent token. */
  hash: string;
  /** Human-readable info, e.g. "Chrome on Windows 11 · Karachi · 1920x1080". */
  info: string;
}

const TOKEN_KEY = "hcm-device-token";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function persistentToken(): string {
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const token = randomToken();
    window.localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // Storage blocked (private mode / iframe): fall back to a per-session token.
    return randomToken();
  }
}

function browserName(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Browser";
}

function osName(ua: string, platform: string): string {
  const p = `${platform} ${ua}`;
  if (/windows/i.test(p)) return /win64|x64|wow64/i.test(ua) ? "Windows 10/11" : "Windows";
  if (/android/i.test(p)) return "Android";
  if (/iphone|ipad|ios/i.test(p)) return "iOS";
  if (/mac os|macintosh/i.test(p)) return "macOS";
  if (/linux/i.test(p)) return "Linux";
  return platform || "Unknown OS";
}

/**
 * Persistent device identity for the license device lock. Combines
 * userAgent, platform, screen resolution, timezone and a persistent local
 * cryptographic token, hashed with SHA-256.
 */
export async function getDeviceFingerprint(): Promise<DeviceIdentity> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform =
    typeof navigator !== "undefined"
      ? ((navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        "")
      : "";
  const screenPart =
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}x${screen.colorDepth}` : "no-screen";
  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "no-tz" : "no-tz";

  const token = persistentToken();
  const hash = await sha256Hex(`${platform}|${screenPart}|${timezone}|${token}`);

  const browser = browserName(ua);
  const os = osName(ua, platform);
  const shortTz = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;
  const info = `${browser} on ${os} · ${shortTz} · ${screen.width}x${screen.height}`;

  return { hash, info };
}
