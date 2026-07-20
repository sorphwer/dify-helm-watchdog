import Link from "next/link";
import semver from "semver";
import { AlertTriangle, ArrowUpRight, FileCode2 } from "lucide-react";
import { BrandLockup } from "@/components/brand-lockup";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpgradePathSelector } from "@/components/upgrade-path-selector";
import { fetchEeCatalog } from "@/lib/ee-catalog";
import {
  computeUpgradePath,
  InvalidRangeError,
  UnknownVersionError,
  type UpgradeHop,
  type UpgradePathNote,
  type UpgradePathResult,
} from "@/lib/upgrade-path";

// Matches the catalog's own revalidate window in fetchEeCatalog.
export const revalidate = 3600;

const NOTE_CLASSES: Record<UpgradePathNote["kind"], string> = {
  "clamped-to-floor": "border-warning/40 bg-warning/10 text-warning",
  "direct-upgrade": "border-success/40 bg-success/10 text-success",
};

interface PageProps {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}

const firstParam = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : null;
};

function HopCard({ hop }: { hop: UpgradeHop }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-medium text-foreground">
          {hop.version}
        </span>
        {hop.unskippable && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            Non-skippable
          </span>
        )}
        {hop.isTarget && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Target
          </span>
        )}
        {hop.stopKinds.map((stopKind) => (
          <span
            key={stopKind.kind}
            className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
          >
            {stopKind.label}
          </span>
        ))}
      </div>

      {hop.stopSummary && (
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          {hop.stopSummary}
        </p>
      )}

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
        {hop.lockUrl && (
          <a
            href={hop.lockUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            versions.lock.yaml
          </a>
        )}
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

      {result.hops.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {result.hops.map((hop) => (
            <HopCard key={hop.version} hop={hop} />
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function UpgradePathPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const from = firstParam(params.from);
  const to = firstParam(params.to);

  let versions: string[] = [];
  let result: UpgradePathResult | null = null;
  let errorMessage: string | null = null;

  try {
    const releases = await fetchEeCatalog();
    // The catalog is ordered by release date, which interleaves LTS patches
    // with later minors. Order the picker by version instead, newest first.
    versions = releases
      .map((release) => release.version)
      .filter((version) => semver.valid(version))
      .sort((a, b) => semver.rcompare(a, b));

    if (from && to) {
      result = computeUpgradePath(releases, from, to);
    }
  } catch (error) {
    errorMessage =
      error instanceof UnknownVersionError || error instanceof InvalidRangeError
        ? error.message
        : "The ee.dify.ai release catalog is unavailable right now.";
  }

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <BrandLockup />
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-3xl font-medium leading-tight text-foreground">
          Upgrade path
        </h1>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Pick your current and target version to see the releases that must not
          be skipped between them. Their migration steps have to run before you
          can continue past them.
        </p>
      </div>

      <UpgradePathSelector versions={versions} from={from} to={to} />

      {errorMessage && (
        <p className="m-0 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
          {errorMessage}
        </p>
      )}

      {!errorMessage && !result && (
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Select both versions to plan an upgrade.
        </p>
      )}

      {result && <PathResult result={result} />}

      <Link
        href="/"
        className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to versions
      </Link>
    </main>
  );
}
