import { Badge } from "@/components/ui/badge";

/** Shared status chip for attendance / directory / corrections states. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    present: { label: "Present", className: "bg-emerald-100 text-emerald-800" },
    late: { label: "Late", className: "bg-amber-100 text-amber-800" },
    half_day: { label: "Half day", className: "bg-orange-100 text-orange-800" },
    missing_checkout: { label: "Missing checkout", className: "bg-sky-100 text-sky-800" },
    absent: { label: "Absent", className: "bg-red-100 text-red-800" },
    active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
    inactive: { label: "Inactive", className: "bg-zinc-100 text-zinc-700" },
    exited: { label: "Exited", className: "bg-zinc-100 text-zinc-700" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  };
  const entry = map[status];
  return (
    <Badge variant="secondary" className={entry?.className}>
      {entry?.label ?? status}
    </Badge>
  );
}
