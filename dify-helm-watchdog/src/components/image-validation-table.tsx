import { useMemo } from "react";
import { Info, RefreshCw } from "lucide-react";
import type {
  ImageValidationPayload,
  ImageValidationRecord,
  ImageVariantStatus,
} from "@/lib/types";

interface ImageValidationTableProps {
  version?: string;
  data: ImageValidationPayload | null;
  error: string | null;
  loading: boolean;
  hasAsset: boolean;
  onRetry: () => void;
}

const variantDotClasses: Record<ImageVariantStatus, string> = {
  found: "bg-emerald-400",
  missing: "bg-red-500",
  error: "bg-amber-400",
};

const variantLabels: Record<ImageVariantStatus, string> = {
  found: "Available",
  missing: "Missing",
  error: "Error",
};

const formatTimestamp = (input?: string | null) => {
  if (!input) {
    return null;
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const VariantCell = ({ record, name }: { record: ImageValidationRecord; name: "original" | "amd64" | "arm64" }) => {
  const variant = record.variants.find((entry) => entry.name === name);

  if (!variant) {
    return (
      <td className="px-4 py-3 align-top text-xs text-muted">n/a</td>
    );
  }

  return (
    <td className="px-4 py-3 align-top">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${variantDotClasses[variant.status]}`}
            aria-hidden="true"
          />
          <span className="font-mono text-[12px] text-foreground">
            {variant.tag}
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-widest text-muted">
          {variantLabels[variant.status]}
        </span>
        {variant.error ? (
          <span className="text-[11px] text-red-300/90">
            {variant.error}
          </span>
        ) : null}
      </div>
    </td>
  );
};

export function ImageValidationTable({
  version,
  data,
  error,
  loading,
  hasAsset,
  onRetry,
}: ImageValidationTableProps) {
  const lastChecked = data ? formatTimestamp(data.checkedAt) : null;

  const summary = useMemo(() => {
    if (!data) {
      return null;
    }

    return data.images.reduce(
      (acc, record) => {
        acc.total += 1;
        acc[record.status] += 1;
        return acc;
      },
      {
        total: 0,
        all_found: 0,
        partial: 0,
        missing: 0,
        error: 0,
      } as {
        total: number;
        all_found: number;
        partial: number;
        missing: number;
        error: number;
      },
    );
  }, [data]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-red-400/60 bg-transparent px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition hover:border-red-300 hover:bg-red-500/10"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!hasAsset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/30 p-6 text-center text-sm text-muted">
        <Info className="h-5 w-5 text-accent" />
        <p>
          This version has not been validated yet. The cron job will populate
          container availability checks on the next sync.
        </p>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/12 bg-black/30 p-6 text-center text-sm text-muted">
        <Info className="h-5 w-5 text-accent" />
        <p>
          Validation payload is not available yet. Try syncing again from the
          cron dashboard.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-muted transition hover:border-white/40 hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/12 bg-black/30 p-6 text-center text-sm text-muted">
        <Info className="h-5 w-5 text-accent" />
        <p>No docker images were detected in this chart release.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span>
            Validated against{" "}
            <span className="font-mono text-foreground">
              {data.host}/{data.namespace}
            </span>
          </span>
          {lastChecked ? (
            <span>
              Last checked:{" "}
              <span className="text-foreground">{lastChecked}</span>
            </span>
          ) : null}
          {version ? (
            <span>
              Chart version:{" "}
              <span className="font-semibold text-foreground">v{version}</span>
            </span>
          ) : null}
        </div>
        {summary ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-muted">
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1">
              {summary.total} images
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              {summary.all_found} ok
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              {summary.partial} partial
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              {summary.missing + summary.error} failing
            </span>
          </div>
        ) : null}
      </div>
      <div className="custom-scrollbar relative flex-1 overflow-auto rounded-2xl border border-white/12 bg-black/40">
        <table className="min-w-full divide-y divide-white/10 text-xs text-muted">
          <thead className="bg-black/40 text-[11px] uppercase tracking-[0.3em]">
            <tr className="text-muted">
              <th className="px-4 py-3 text-left text-muted">
                <span className="block">Source image</span>
                <span className="block text-[10px] uppercase tracking-[0.3em] text-muted">
                  Helm paths
                </span>
              </th>
              <th className="px-4 py-3 text-left text-muted">Original</th>
              <th className="px-4 py-3 text-left text-muted">amd64</th>
              <th className="px-4 py-3 text-left text-muted">arm64</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.images.map((record) => {
              const mirrorPath = `${data.host}/${data.namespace}/${record.targetImageName}`;
              return (
                <tr key={`${record.targetImageName}:${record.sourceTag}`}>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[12px] text-foreground">
                          {record.sourceRepository}:{record.sourceTag}
                        </span>
                        <span className="text-[11px] text-muted">
                          Mirror →{" "}
                          <span className="font-mono text-foreground">
                            {mirrorPath}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.paths.map((path) => (
                          <span
                            key={path}
                            className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-muted"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <VariantCell record={record} name="original" />
                  <VariantCell record={record} name="amd64" />
                  <VariantCell record={record} name="arm64" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
