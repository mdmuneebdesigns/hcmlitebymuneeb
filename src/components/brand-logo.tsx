import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * HCM Lite brand mark: indigo→emerald gradient squircle, stylized "H"
 * fused with a biometric scan frame and an AI spark node.
 * Pure vector SVG — no raster assets.
 */
export function BrandLogo({
  size = 40,
  showWordmark = false,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  const uid = useId();
  const gradId = `${uid}-hcm-gradient`;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="HCM Lite logo"
      >
        <defs>
          <linearGradient id={gradId} x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4f46e5" />
            <stop offset="0.55" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Gradient squircle badge */}
        <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${gradId})`} />
        {/* Biometric scan frame — three corners; the fourth is the AI spark */}
        <path d="M14 20.5V17a3 3 0 0 1 3-3h3.5" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M14 27.5V31a3 3 0 0 0 3 3h3.5" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M34 27.5V31a3 3 0 0 1-3 3h-3.5" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.2" strokeLinecap="round" />
        {/* Stylized H */}
        <path d="M19 17v14M29 17v14M19 24h10" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
        {/* AI spark node (top-right corner) */}
        <path
          d="M33.4 9.6l1.05 2.55 2.55 1.05-2.55 1.05-1.05 2.55-1.05-2.55-2.55-1.05 2.55-1.05z"
          fill="#ffffff"
        />
      </svg>
      {showWordmark && (
        <span className="flex items-center gap-1.5 leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground">HCM</span>
          <span className="rounded-md gradient-brand px-1.5 py-0.5 text-xs font-bold text-white">Lite</span>
        </span>
      )}
    </span>
  );
}
