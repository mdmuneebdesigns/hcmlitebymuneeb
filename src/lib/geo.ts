// Client-safe multi-stage location resolver. Never throws and never toasts —
// callers render a single status badge / one toast on explicit button clicks.

export interface ResolvedLocation {
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: "gps" | "gps-low" | "ip" | "default";
}

/** Zaitoon Ashraf IT Park, Karachi — silent offline fallback. */
export const DEFAULT_OFFICE_LAT = "24.8607";
export const DEFAULT_OFFICE_LNG = "67.0011";

let cached: ResolvedLocation | null = null;

function tryGps(
  enableHighAccuracy: boolean,
  timeout: number,
  maximumAge: number,
): Promise<{ lat: number; lng: number; accuracyM: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}

/** Free CORS-enabled IP geolocation — works when iframes block real GPS. */
async function tryIpGeo(): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = (await res.json()) as { latitude?: string; longitude?: string };
    const lat = Number(j.latitude);
    const lng = Number(j.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the user's real location in stages:
 * 1. High-accuracy GPS (8s) → 2. low-accuracy Wi-Fi/network GPS (6s) →
 * 3. IP geolocation (blocked iframes) → 4. silent Karachi default.
 * Results are cached so punches / camera checks do not re-run every stage.
 */
export async function getRealUserLocation(force = false): Promise<ResolvedLocation> {
  if (cached && !force) return cached;

  const hi = await tryGps(true, 8000, 0);
  if (hi) {
    cached = { ...hi, source: "gps" };
    return cached;
  }
  const lo = await tryGps(false, 6000, 60000);
  if (lo) {
    cached = { ...lo, source: "gps-low" };
    return cached;
  }
  const ip = await tryIpGeo();
  if (ip) {
    cached = { lat: ip.lat, lng: ip.lng, accuracyM: null, source: "ip" };
    return cached;
  }
  cached = {
    lat: Number(DEFAULT_OFFICE_LAT),
    lng: Number(DEFAULT_OFFICE_LNG),
    accuracyM: null,
    source: "default",
  };
  return cached;
}
