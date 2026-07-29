"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowUpRight, FileCode2, MapPinned } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  UpgradeHop,
  UpgradePathNote,
  UpgradePathResult,
} from "@/lib/upgrade-path";

const NOTE_CLASSES: Record<UpgradePathNote["kind"], string> = {
  "clamped-to-floor": "border-warning/40 bg-warning/10 text-warning",
  "direct-upgrade": "border-success/40 bg-success/10 text-success",
};

const SELECT_CLASSES =
  "w-full min-w-0 rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm text-foreground transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60 sm:min-w-[200px]";

const LABEL_CLASSES =
  "text-[10px] uppercase tracking-widest text-muted-foreground";

interface UpgradePathModalProps {
  open: boolean;
}

interface OptionsResponse {
  versions: string[];
}

interface ErrorResponse {
  error?: { message?: string };
}

const getErrorMessage = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
  return payload?.error?.message ?? `Request failed with status ${response.status}`;
};

function HopCard({ hop }: { hop: UpgradeHop }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-medium text-foreground">
          {hop.version}
        </span>
        {hop.unskippable ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            Non-skippable
          </span>
        ) : null}
        {hop.isTarget ? (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Target
          </span>
        ) : null}
        {hop.stopKinds.map((stopKind) => (
          <span
            key={stopKind.kind}
            className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
          >
            {stopKind.label}
          </span>
        ))}
      </div>

      {hop.stopSummary ? (
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          {hop.stopSummary}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <a
          href={hop.notesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          Release notes
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
        {hop.lockUrl ? (
          <a
            href={hop.lockUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            versions.lock.yaml
          </a>
        ) : null}
      </div>
    </li>
  );
}

function PathResult({ result }: { result: UpgradePathResult }) {
  return (
    <div className="flex flex-col gap-4">
      {result.notes.map((note) => (
        <p
          key={note.kind}
          className={`m-0 rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTE_CLASSES[note.kind]}`}
        >
          {note.message}
        </p>
      ))}

      {result.hops.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {result.hops.map((hop) => (
            <HopCard key={hop.version} hop={hop} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export default function UpgradePathModal({ open }: UpgradePathModalProps) {
  const searchParams = useSearchParams();
  const [versions, setVersions] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [result, setResult] = useState<UpgradePathResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  const from = searchParams.get("from")?.trim() || null;
  const to = searchParams.get("to")?.trim() || null;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError(null);

    fetch("/api/v1/upgrade-path/options", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getErrorMessage(response));
        return response.json() as Promise<OptionsResponse>;
      })
      .then((payload) => setVersions(payload.versions))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setOptionsError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || !from || !to) {
      setResult(null);
      setResultError(null);
      setResultLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });
    setResultLoading(true);
    setResultError(null);

    fetch(`/api/v1/upgrade-path?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getErrorMessage(response));
        return response.json() as Promise<UpgradePathResult>;
      })
      .then(setResult)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setResult(null);
          setResultError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResultLoading(false);
      });

    return () => controller.abort();
  }, [from, open, to]);

  const replaceQuery = (next: { from: string | null; to: string | null }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("upgrade-plan", "true");
    if (next.from) url.searchParams.set("from", next.from);
    else url.searchParams.delete("from");
    if (next.to) url.searchParams.set("to", next.to);
    else url.searchParams.delete("to");
    window.history.replaceState(null, "", url);
  };

  const close = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("upgrade-plan");
    url.searchParams.delete("from");
    url.searchParams.delete("to");
    window.history.replaceState(null, "", url);
  };

  const busy = optionsLoading;
  const errorMessage = optionsError ?? resultError;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[min(90vh,800px)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MapPinned className="h-5 w-5 text-primary" />
            Upgrade plan
          </DialogTitle>
          <DialogDescription className="max-w-2xl leading-relaxed">
            Pick your current and target version to see every release that must
            not be skipped. This plan is encoded in the URL so you can share it.
          </DialogDescription>
        </DialogHeader>

        <div className="custom-scrollbar flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            data-pending={busy}
            aria-busy={busy}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={LABEL_CLASSES}>Current version</span>
              <select
                className={SELECT_CLASSES}
                value={from ?? ""}
                disabled={busy}
                onChange={(event) =>
                  replaceQuery({ from: event.target.value || null, to })
                }
              >
                <option value="">
                  {optionsLoading ? "Loading versions…" : "Select…"}
                </option>
                {versions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={LABEL_CLASSES}>Target version</span>
              <select
                className={SELECT_CLASSES}
                value={to ?? ""}
                disabled={busy}
                onChange={(event) =>
                  replaceQuery({ from, to: event.target.value || null })
                }
              >
                <option value="">
                  {optionsLoading ? "Loading versions…" : "Select…"}
                </option>
                {versions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {errorMessage ? (
            <p className="m-0 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
              {errorMessage}
            </p>
          ) : null}

          {resultLoading ? (
            <div
              className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none"
              aria-label="Loading upgrade plan"
            >
              <div className="h-12 rounded-xl bg-muted" />
              <div className="h-24 rounded-2xl bg-muted" />
            </div>
          ) : null}

          {!errorMessage && !resultLoading && !result ? (
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
              Select both versions to plan an upgrade.
            </p>
          ) : null}

          {!resultLoading && result ? <PathResult result={result} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
