"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, Info, Loader2, RefreshCw } from "lucide-react";
import type { CachePayload, StoredVersion } from "@/lib/types";
import { CodeBlock } from "@/components/ui/code-block";

interface VersionExplorerProps {
  data: CachePayload | null;
}

const formatDate = (input?: string | null) => {
  if (!input) {
    return "unknown";
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

export function VersionExplorer({ data }: VersionExplorerProps) {
  const versions = useMemo(() => data?.versions ?? [], [data?.versions]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(
    versions[0]?.version ?? null,
  );
  const [activeArtifact, setActiveArtifact] = useState<"values" | "images">(
    "values",
  );
  const [valuesContent, setValuesContent] = useState<string>("");
  const [imagesContent, setImagesContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [reloadTarget, setReloadTarget] = useState<string | null>(null);
  const [processedReload, setProcessedReload] = useState(0);

  const versionMap = useMemo(() => {
    return new Map<string, StoredVersion>(
      versions.map((entry) => [entry.version, entry]),
    );
  }, [versions]);

  useEffect(() => {
    if (!selectedVersion) {
      setValuesContent("");
      setImagesContent("");
      setLoading(false);
      return;
    }

    const version = versionMap.get(selectedVersion);
    if (!version) {
      return;
    }

    const isReloading =
      reloadTarget === selectedVersion && reloadFlag > processedReload;
    
    // With ISR optimization, inline content is preloaded on the server
    // This eliminates client-side fetch requests in production
    const hasLocalValues = typeof version.values.inline === "string";
    const hasLocalImages = typeof version.images.inline === "string";

    if (hasLocalValues) {
      setValuesContent(version.values.inline ?? "");
    } else {
      setValuesContent("");
    }

    if (hasLocalImages) {
      setImagesContent(version.images.inline ?? "");
    } else {
      setImagesContent("");
    }

    // Fallback: fetch from Blob only if inline content is missing
    // This should rarely happen with ISR, but provides resilience
    const shouldFetchValues = !hasLocalValues;
    const shouldFetchImages = !hasLocalImages;

    if (!shouldFetchValues && !shouldFetchImages && !isReloading) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const loadContent = async () => {
      try {
        if (shouldFetchValues || shouldFetchImages || isReloading) {
          setLoading(true);
        }
        setError(null);

        const [valuesText, imagesText] = await Promise.all([
          shouldFetchValues || isReloading
            ? fetch(version.values.url).then((response) => {
                if (!response.ok) {
                  throw new Error("Failed to download cached YAML artifacts");
                }
                return response.text();
              })
            : Promise.resolve(version.values.inline ?? ""),
          shouldFetchImages || isReloading
            ? fetch(version.images.url).then((response) => {
                if (!response.ok) {
                  throw new Error("Failed to download cached YAML artifacts");
                }
                return response.text();
              })
            : Promise.resolve(version.images.inline ?? ""),
        ]);

        if (!cancelled) {
          setValuesContent(valuesText);
          setImagesContent(imagesText);
        }
      } catch (thrown) {
        if (!cancelled) {
          setError(
            thrown instanceof Error
              ? thrown.message
              : "Unexpected error while loading YAML artifacts.",
          );
          if (shouldFetchValues || isReloading) {
            setValuesContent("");
          }
          if (shouldFetchImages || isReloading) {
            setImagesContent("");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (isReloading) {
            setProcessedReload((prev) =>
              reloadFlag > prev ? reloadFlag : prev,
            );
          }
        }
      }
    };

    if (shouldFetchValues || shouldFetchImages || isReloading) {
      void loadContent();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedVersion, versionMap, reloadFlag, reloadTarget, processedReload]);

  const handleRetry = () => {
    setReloadTarget(selectedVersion);
    setReloadFlag((value) => value + 1);
  };

  const artifactTabs = useMemo(
    () => [
      {
        id: "values" as const,
        label: "values.yaml",
        content:
          valuesContent || "# Sync job has not cached this artifact yet.",
        language: "yaml",
      },
      {
        id: "images" as const,
        label: "image versions",
        content:
          imagesContent || "# Sync job has not cached this artifact yet.",
        language: "yaml",
      },
    ],
    [valuesContent, imagesContent],
  );

  const activeTab =
    artifactTabs.find((tab) => tab.id === activeArtifact) ??
    artifactTabs[0];

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 overflow-hidden px-4 py-6 md:px-6 lg:px-8">
      <header className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <a
            href="https://langgenius.github.io/dify-helm/#/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
          >
            <ArrowUpRight className="h-3 w-3" />
            Dify Helm
          </a>
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
            Dify Helm Nightly Cheatsheet
          </h1>
          <p className="max-w-2xl text-sm text-muted md:text-base">
            Automatic daily snapshots of Helm chart default values and container image
            version references to support your helm upgrade process.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-black px-4 py-3 text-sm text-muted/80">
          <CalendarClock className="h-5 w-5 text-accent" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-widest text-muted">
              Last sync
            </span>
            <span className="text-sm text-foreground">
              {data?.lastUpdated ? formatDate(data.lastUpdated) : "pending"}
            </span>
          </div>
        </div>
      </header>

      <section className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-[320px_1fr]">
        <aside className="relative flex h-full w-full flex-col gap-4 overflow-hidden rounded-3xl border border-white/12 bg-black p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted">
            <span>Published Versions</span>
            <span>{versions.length}</span>
          </div>
          <div className="custom-scrollbar -mx-3 flex-1 overflow-y-auto px-1">
            {versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black p-6 text-center text-sm text-muted">
                <Info className="h-6 w-6 text-accent" />
                <p>
                  No cached releases yet. Trigger the cron endpoint or wait for
                  the daily sync.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {versions.map((version) => {
                  const isActive = version.version === selectedVersion;
                  return (
                    <li key={version.version} className="mb-2 last:mb-0">
                      <button
                        type="button"
                        onClick={() => setSelectedVersion(version.version)}
                        className={`group flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                          isActive
                            ? "border-[#03f] bg-[#03f] text-white"
                            : "border-white/12 bg-transparent text-muted hover:border-white/40 hover:bg-white/5 hover:text-foreground"
                        }`}
                      >
                        <span className={`text-base font-semibold tracking-wide ${isActive ? "text-white" : "text-foreground"}`}>
                          v{version.version}
                        </span>
                        <div className={`flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.2em] ${isActive ? "text-white/90" : "text-muted"}`}>
                          {version.appVersion && (
                            <span className={`rounded-full border px-2 py-0.5 ${isActive ? "border-white/30 bg-white/10 text-white" : "border-white/15 bg-white/5 text-muted"}`}>
                              App {version.appVersion}
                            </span>
                          )}
                          {version.createdAt && (
                            <span>{formatDate(version.createdAt)}</span>
                          )}
                          <span className={`ml-auto text-[10px] font-mono tracking-widest ${isActive ? "text-white/80" : "text-muted/80"}`}>
                            sha256:{version.values.hash.slice(0, 7)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <article className="flex h-full flex-col gap-6 overflow-hidden">
          {error ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-red-500/40 bg-black p-6 text-sm text-red-200">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="h-4 w-4" />
                {error}
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-red-400/60 bg-transparent px-4 py-1 text-xs uppercase tracking-[0.3em] text-red-200 transition hover:border-red-300 hover:bg-red-500/10"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : null}

          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-center gap-4">
              <div className="flex w-full justify-center rounded-full border border-white/12 bg-black/60 p-1">
                {artifactTabs.map((tab) => {
                  const isActive = tab.id === activeTab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveArtifact(tab.id)}
                      className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition ${
                        isActive
                          ? "border border-white bg-white text-black"
                          : "border border-transparent text-muted hover:border-white/30 hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              )}
              <CodeBlock
                label={activeTab.label}
                value={activeTab.content}
                language={activeTab.language}
                version={selectedVersion ?? undefined}
                className="mx-auto h-full w-full max-w-4xl"
              />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
