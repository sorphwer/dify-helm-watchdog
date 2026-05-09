"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const OPTIONS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
] as const;

interface WindowToggleProps {
  current: "7d" | "30d" | "90d";
}

export function WindowToggle({ current }: WindowToggleProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setWindow = (next: string) => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.set("window", next);
    startTransition(() => {
      router.replace(`/dashboard?${sp.toString()}`);
    });
  };

  return (
    <div
      className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-900/40 p-0.5"
      role="tablist"
      aria-label="Time window"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={pending}
            onClick={() => setWindow(opt.value)}
            className={[
              "px-3 py-1 text-xs font-mono transition-colors",
              active
                ? "rounded bg-emerald-500/15 text-emerald-300"
                : "text-zinc-400 hover:text-zinc-100",
              pending ? "opacity-60" : "",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
