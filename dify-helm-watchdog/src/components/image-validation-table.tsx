import { useMemo } from "react";
import { Info, RefreshCw } from "lucide-react";
import type {
  ImageValidationPayload,
  ImageValidationRecord,
  ImageVariantName,
  ImageVariantStatus,
} from "@/lib/types";
import { countValidationStatuses } from "@/lib/validation";

interface ImageValidationTableProps {
  version?: string;
  data: ImageValidationPayload | null;
  error: string | null;
  loading: boolean;
  hasAsset: boolean;
  onRetry: () => void;
}

const variantDotClasses: Record<ImageVariantStatus, string> = {
  FOUND: "bg-success",
  MISSING: "bg-destructive",
  ERROR: "bg-warning",
};

const variantLabels: Record<ImageVariantStatus, string> = {
  FOUND: "Available",
  MISSING: "Missing",
  ERROR: "Error",
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

const variantCellClasses: Record<ImageVariantStatus, string> = {
  FOUND: "bg-success/5 border-success/20",
  MISSING: "bg-destructive/5 border-destructive/20",
  ERROR: "bg-warning/5 border-warning/20",
};

const variantTextClasses: Record<ImageVariantStatus, string> = {
  FOUND: "text-success",
  MISSING: "text-destructive",
  ERROR: "text-warning",
};

const VariantCell = ({ record, name }: { record: ImageValidationRecord; name: ImageVariantName }) => {
  const variant = record.variants.find((entry) => entry.name === name);

  if (!variant) {
    return (
      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
        <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
          <span className="text-muted-foreground">n/a</span>
        </div>
      </td>
    );
  }

  // If original (multi-arch) exists and is found, treat arch-specific variants as available
  // even if -amd64/-arm64 specific tags don't exist
  const originalVariant = record.variants.find((v) => v.name === "ORIGINAL");
  const isMultiArchAvailable = originalVariant?.status === "FOUND" && name !== "ORIGINAL";
  const isOverriddenByMultiArch = isMultiArchAvailable && variant.status === "MISSING";
  const effectiveStatus: ImageVariantStatus = isOverriddenByMultiArch ? "FOUND" : variant.status;

  return (
    <td className="px-4 py-3 align-top">
      <div className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 ${variantCellClasses[effectiveStatus]}`}>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${variantDotClasses[effectiveStatus]}`}
            aria-hidden="true"
          />
          <span className={`font-mono text-[12px] font-semibold ${variantTextClasses[effectiveStatus]}`}>
            {isMultiArchAvailable && variant.status === "MISSING" ? record.sourceTag : variant.tag}
          </span>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${variantTextClasses[effectiveStatus]}`}>
          {isMultiArchAvailable && variant.status === "MISSING"
            ? "Available (multi-arch)"
            : variantLabels[effectiveStatus]}
        </span>
        {variant.error && !isMultiArchAvailable ? (
          <span className="text-[11px] text-destructive">
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
  const lastChecked = data ? formatTimestamp(data.checkTime) : null;

  const summary = useMemo(() => {
    if (!data) {
      return null;
    }

    return countValidationStatuses(data.images);
  }, [data]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive-foreground">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-destructive bg-transparent px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition hover:border-destructive/80 hover:bg-destructive/20"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!hasAsset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-6 text-center text-sm text-muted-foreground">
        <Info className="h-5 w-5 text-primary" />
        <p>
          This version has not been validated yet. The cron job will populate
          container availability checks on the next sync.
        </p>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
        <Info className="h-5 w-5 text-primary" />
        <p>
          Validation payload is not available yet. Try syncing again from the
          cron dashboard.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-muted-foreground transition hover:border-accent hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
        <Info className="h-5 w-5 text-primary" />
        <p>No docker images were detected in this chart release.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
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
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="rounded-full border border-border bg-muted px-3 py-1">
              {summary.total} images
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-success" />
              {summary.allFound} ok
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-warning" />
              {summary.partial} partial
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
              {summary.missing + summary.error} failing
            </span>
          </div>
        ) : null}
      </div>
      <div className="custom-scrollbar relative flex-1 overflow-auto rounded-2xl border border-border bg-muted">
        <table className="min-w-full divide-y divide-border text-xs text-muted-foreground">
          <thead className="bg-muted text-[11px] uppercase tracking-[0.3em]">
            <tr className="text-muted-foreground">
              <th className="px-4 py-3 text-left text-muted-foreground">
                <span className="block">Source image</span>
                <span className="block text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Helm paths
                </span>
              </th>
              <th className="px-4 py-3 text-left text-muted-foreground">Original</th>
              <th className="px-4 py-3 text-left text-muted-foreground">amd64</th>
              <th className="px-4 py-3 text-left text-muted-foreground">arm64</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.images.map((record) => {
              const mirrorPath = `${data.host}/${data.namespace}/${record.targetImageName}`;
              return (
                <tr key={`${record.targetImageName}:${record.sourceTag}`}>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[12px] font-semibold text-foreground">
                          {record.sourceRepository}:{record.sourceTag}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Mirror →{" "}
                          <span className="font-mono text-muted-foreground">
                            {mirrorPath}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.paths.map((path) => (
                          <span
                            key={path}
                            className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <VariantCell record={record} name="ORIGINAL" />
                  <VariantCell record={record} name="AMD64" />
                  <VariantCell record={record} name="ARM64" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
