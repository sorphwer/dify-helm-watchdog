"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const SELECT_CLASSES =
  "min-w-[200px] rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm text-foreground transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-ring";

const LABEL_CLASSES =
  "text-[10px] uppercase tracking-widest text-muted-foreground";

interface Props {
  versions: string[];
  from: string | null;
  to: string | null;
}

export function UpgradePathSelector({ versions, from, to }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (next: { from: string | null; to: string | null }) => {
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/upgrade-path?${query}` : "/upgrade-path");
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-4" data-pending={isPending}>
      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Current version</span>
        <select
          className={SELECT_CLASSES}
          value={from ?? ""}
          onChange={(event) =>
            navigate({ from: event.target.value || null, to })
          }
        >
          <option value="">Select…</option>
          {versions.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Target version</span>
        <select
          className={SELECT_CLASSES}
          value={to ?? ""}
          onChange={(event) =>
            navigate({ from, to: event.target.value || null })
          }
        >
          <option value="">Select…</option>
          {versions.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
