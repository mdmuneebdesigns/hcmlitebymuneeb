import { Check, Circle } from "lucide-react";

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: PasswordRule[] = [
  { label: "Minimum 8 characters", test: (p) => p.length >= 8 },
  { label: "At least one uppercase letter (e.g. A-Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "At least one lowercase letter (e.g. a-z)", test: (p) => /[a-z]/.test(p) },
  { label: "At least one number (e.g. 123)", test: (p) => /[0-9]/.test(p) },
  { label: "At least one special symbol (e.g. @, #, $, !, %)", test: (p) => /[!@#$%^&*(),.?":{}|<>_\-]/.test(p) },
];

/** True only when every checklist rule passes — used to gate submit buttons. */
export function isPasswordStrong(password: string): boolean {
  return RULES.every((r) => r.test(password));
}

/**
 * Live strength bar + 5-rule checklist shown under every password
 * creation/update field. Circles turn into emerald checkmarks as the
 * user types.
 */
export function PasswordStrengthChecklist({ password }: { password: string }) {
  const met = RULES.map((r) => r.test(password));
  const score = met.filter(Boolean).length;
  const barClass = score >= 5 ? "bg-emerald-500" : score >= 3 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all duration-300 ${barClass}`}
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
      <ul className="space-y-1">
        {RULES.map((rule, i) => (
          <li
            key={rule.label}
            className={`flex items-center gap-2 text-xs ${
              met[i] ? "font-medium text-emerald-700" : "text-muted-foreground"
            }`}
          >
            {met[i] ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
