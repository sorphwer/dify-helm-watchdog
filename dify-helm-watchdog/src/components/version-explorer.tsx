"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Diff,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import ReactDiffViewer from "react-diff-viewer";
import type { ReactDiffViewerStylesOverride } from "react-diff-viewer";
import type {
  CachePayload,
  ImageValidationPayload,
  StoredVersion,
} from "@/lib/types";
import { CodeBlock } from "@/components/ui/code-block";
import { ImageValidationTable } from "@/components/image-validation-table";
import { ThemeToggle } from "@/components/theme-toggle";

// Diff viewer styles - 绿增红减配色
const diffViewerStyles: ReactDiffViewerStylesOverride = {
  variables: {
    light: {
      diffViewerBackground: "oklch(99% 0 0)", // card background
      diffViewerColor: "oklch(15% 0 0)", // foreground
      // 绿色 - 新增内容
      addedBackground: "rgba(34, 197, 94, 0.08)", // 淡绿色背景
      addedColor: "oklch(25% 0 0)", // 深色文字
      addedGutterBackground: "rgba(34, 197, 94, 0.12)",
      wordAddedBackground: "rgba(34, 197, 94, 0.2)", // 高亮绿色
      // 红色 - 删除内容
      removedBackground: "rgba(239, 68, 68, 0.08)", // 淡红色背景
      removedColor: "oklch(25% 0 0)", // 深色文字
      removedGutterBackground: "rgba(239, 68, 68, 0.12)",
      wordRemovedBackground: "rgba(239, 68, 68, 0.2)", // 高亮红色
      // 其他
      gutterBackground: "oklch(97% 0 0)",
      gutterBackgroundDark: "oklch(95% 0 0)",
      gutterColor: "oklch(50% 0 0)",
      highlightBackground: "rgba(0, 51, 255, 0.08)", // brand blue
      highlightGutterBackground: "rgba(0, 51, 255, 0.12)",
      codeFoldGutterBackground: "oklch(95% 0 0)",
      codeFoldBackground: "oklch(97% 0 0)",
      emptyLineBackground: "oklch(98% 0 0)",
      gutterColorLight: "oklch(60% 0 0)",
      gutterColorDark: "oklch(40% 0 0)",
      codeFoldContentColor: "oklch(50% 0 0)",
      diffViewerTitleBackground: "oklch(97% 0 0)",
      diffViewerTitleColor: "oklch(25% 0 0)",
      diffViewerTitleBorderColor: "oklch(86% 0 0)",
    },
    dark: {
      diffViewerBackground: "oklch(18% 0 0)", // card background
      diffViewerColor: "oklch(95% 0 0)", // foreground
      // 绿色 - 新增内容
      addedBackground: "rgba(34, 197, 94, 0.15)", // 淡绿色背景
      addedColor: "oklch(95% 0 0)", // 亮色文字
      addedGutterBackground: "rgba(34, 197, 94, 0.2)",
      wordAddedBackground: "rgba(34, 197, 94, 0.3)", // 高亮绿色
      // 红色 - 删除内容
      removedBackground: "rgba(239, 68, 68, 0.15)", // 淡红色背景
      removedColor: "oklch(95% 0 0)", // 亮色文字
      removedGutterBackground: "rgba(239, 68, 68, 0.2)",
      wordRemovedBackground: "rgba(239, 68, 68, 0.3)", // 高亮红色
      // 其他
      gutterBackground: "oklch(16% 0 0)",
      gutterBackgroundDark: "oklch(14% 0 0)",
      gutterColor: "oklch(65% 0 0)",
      highlightBackground: "rgba(0, 51, 255, 0.15)", // brand blue
      highlightGutterBackground: "rgba(0, 51, 255, 0.2)",
      codeFoldGutterBackground: "oklch(20% 0 0)",
      codeFoldBackground: "oklch(18% 0 0)",
      emptyLineBackground: "oklch(17% 0 0)",
      gutterColorLight: "oklch(55% 0 0)",
      gutterColorDark: "oklch(75% 0 0)",
      codeFoldContentColor: "oklch(65% 0 0)",
      diffViewerTitleBackground: "oklch(16% 0 0)",
      diffViewerTitleColor: "oklch(95% 0 0)",
      diffViewerTitleBorderColor: "oklch(28% 0 0)",
    },
  },
  gutter: {
    padding: "0 8px",
    minWidth: "48px",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "12px",
  },
  marker: {
    padding: "0 8px",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "13px",
    fontWeight: "600",
  },
  diffContainer: {
    borderRadius: "12px",
    overflow: "hidden",
    width: "100%",
    border: "1px solid oklch(28% 0 0)", // dark mode border
  },
  titleBlock: {
    padding: "10px 16px",
    fontFamily: "var(--font-geist-sans), sans-serif",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  content: {
    width: "auto",
  },
  contentText: {
    padding: "0 12px",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  line: {
    padding: "2px 0",
  },
  splitView: {
    width: "100%",
  },
};

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

const parseValidationPayload = (
  raw: string | undefined | null,
): { payload: ImageValidationPayload | null; error: string | null } => {
  if (!raw) {
    return { payload: null, error: null };
  }

  try {
    const parsed = JSON.parse(raw) as ImageValidationPayload;
    return { payload: parsed, error: null };
  } catch (thrown) {
    return {
      payload: null,
      error:
        thrown instanceof Error
          ? `Failed to parse image validation data: ${thrown.message}`
          : "Failed to parse image validation data.",
    };
  }
};

const ensureImageTagsQuoted = (input: string): string =>
  input.replace(
    /^(\s*tag:\s*)([^"'#\n][^#\n]*?)(\s*)(#.*)?$/gm,
    (match, prefix, rawValue, spacing = "", comment = "") => {
      const trimmed = rawValue.trim();
      if (!trimmed || trimmed.startsWith('"') || trimmed.startsWith("'")) {
        return match;
      }

      const escaped = trimmed
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      return `${prefix}"${escaped}"${spacing}${comment}`;
    },
  );

export function VersionExplorer({ data }: VersionExplorerProps) {
  const { resolvedTheme } = useTheme();
  const versions = useMemo(() => data?.versions ?? [], [data?.versions]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(
    versions[0]?.version ?? null,
  );
  const [activeArtifact, setActiveArtifact] = useState<
    "values" | "images" | "validation"
  >("values");
  const [valuesContent, setValuesContent] = useState<string>("");
  const [imagesContent, setImagesContent] = useState<string>("");
  const [validationData, setValidationData] =
    useState<ImageValidationPayload | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasValidationAsset, setHasValidationAsset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [reloadTarget, setReloadTarget] = useState<string | null>(null);
  const [processedReload, setProcessedReload] = useState(0);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffModalFullscreen, setDiffModalFullscreen] = useState(false);
  const [diffMeta, setDiffMeta] = useState<{
    baseVersion: string;
    targetVersion: string;
  } | null>(null);
  const [diffValuesContent, setDiffValuesContent] = useState<{
    oldValue: string;
    newValue: string;
  }>({ oldValue: "", newValue: "" });
  const [diffImagesContent, setDiffImagesContent] = useState<{
    oldValue: string;
    newValue: string;
  }>({ oldValue: "", newValue: "" });
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const diffRequestRef = useRef(0);

  const versionMap = useMemo(() => {
    return new Map<string, StoredVersion>(
      versions.map((entry) => [entry.version, entry]),
    );
  }, [versions]);


  useEffect(() => {
    if (!selectedVersion) {
      setValuesContent("");
      setImagesContent("");
      setValidationData(null);
      setValidationError(null);
      setHasValidationAsset(false);
      setError(null);
      setLoading(false);
      return;
    }

    const version = versionMap.get(selectedVersion);
    if (!version) {
      return;
    }

    const isReloading =
      reloadTarget === selectedVersion && reloadFlag > processedReload;

    const hasLocalValues = typeof version.values.inline === "string";
    const hasLocalImages = typeof version.images.inline === "string";
    const validationAsset = version.imageValidation;
    const hasAsset = Boolean(validationAsset);
    setHasValidationAsset(hasAsset);

    const hasLocalValidation =
      hasAsset && typeof validationAsset?.inline === "string";

    setValuesContent(hasLocalValues ? version.values.inline ?? "" : "");
    setImagesContent(
      hasLocalImages ? ensureImageTagsQuoted(version.images.inline ?? "") : "",
    );

    if (hasLocalValidation) {
      const { payload, error: inlineError } = parseValidationPayload(
        validationAsset?.inline ?? null,
      );
      setValidationData(payload);
      setValidationError(inlineError);
      setError(inlineError);
    } else {
      setValidationData(null);
      setValidationError(null);
      if (!hasAsset) {
        setError(null);
      }
    }

    const shouldFetchValues = !hasLocalValues;
    const shouldFetchImages = !hasLocalImages;
    const shouldFetchValidation =
      hasAsset && (!hasLocalValidation || isReloading);

    if (
      !shouldFetchValues &&
      !shouldFetchImages &&
      !shouldFetchValidation &&
      !isReloading
    ) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadContent = async () => {
      try {
        if (
          shouldFetchValues ||
          shouldFetchImages ||
          shouldFetchValidation ||
          isReloading
        ) {
          setLoading(true);
        }
        setError(null);

        const [valuesText, imagesText, validationText] = await Promise.all([
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
          shouldFetchValidation
            ? fetch(validationAsset!.url).then((response) => {
                if (!response.ok) {
                  throw new Error("Failed to download image validation payload");
                }
                return response.text();
              })
            : Promise.resolve(
                typeof validationAsset?.inline === "string"
                  ? validationAsset.inline
                  : null,
              ),
        ]);

        if (!cancelled) {
          setValuesContent(valuesText);
          setImagesContent(ensureImageTagsQuoted(imagesText));

          if (hasAsset) {
            const { payload, error: parsedError } = parseValidationPayload(
              validationText,
            );
            setValidationData(payload);
            setValidationError(parsedError);
            setError(parsedError);
          } else {
            setValidationData(null);
            setValidationError(null);
            setError(null);
          }
        }
      } catch (thrown) {
        if (!cancelled) {
          const message =
            thrown instanceof Error
              ? thrown.message
              : "Unexpected error while loading cached artifacts.";
          setError(message);

          if (shouldFetchValues || isReloading) {
            setValuesContent("");
          }
          if (shouldFetchImages || isReloading) {
            setImagesContent("");
          }
          if (hasAsset) {
            setValidationData(null);
            setValidationError(message);
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

    if (
      shouldFetchValues ||
      shouldFetchImages ||
      shouldFetchValidation ||
      isReloading
    ) {
      void loadContent();
    }

    return () => {
      cancelled = true;
    };
  }, [
    selectedVersion,
    versionMap,
    reloadFlag,
    reloadTarget,
    processedReload,
  ]);

  const handleRetry = () => {
    setReloadTarget(selectedVersion);
    setReloadFlag((value) => value + 1);
  };

  const codeTabs = useMemo(
    () => [
      {
        id: "values" as const,
        label: "values.yaml",
        type: "code" as const,
        content:
          valuesContent || "# Sync job has not cached this artifact yet.",
        language: "yaml",
      },
      {
        id: "images" as const,
        label: "image versions",
        type: "code" as const,
        content:
          imagesContent || "# Sync job has not cached this artifact yet.",
        language: "yaml",
      },
    ],
    [valuesContent, imagesContent],
  );

  const artifactTabs = useMemo(
    () => [
      ...codeTabs,
      {
        id: "validation" as const,
        label: "image availability",
        type: "validation" as const,
      },
    ],
    [codeTabs],
  );

  const loadVersionArtifacts = async (version: StoredVersion) => {
    const resolveAsset = async (asset: StoredVersion["values"]) => {
      if (typeof asset.inline === "string") {
        return asset.inline;
      }
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error("Failed to download cached YAML artifacts");
      }
      return response.text();
    };

    const [valuesText, imagesText] = await Promise.all([
      resolveAsset(version.values),
      resolveAsset(version.images),
    ]);

    return {
      values: valuesText,
      images: ensureImageTagsQuoted(imagesText),
    };
  };

  const openDiffModal = (targetVersionId: string) => {
    if (!selectedVersion) {
      return;
    }

    const baseVersionEntry = versionMap.get(selectedVersion);
    const targetVersionEntry = versionMap.get(targetVersionId);

    if (!baseVersionEntry || !targetVersionEntry) {
      return;
    }

    const requestId = diffRequestRef.current + 1;
    diffRequestRef.current = requestId;

    setDiffModalOpen(true);
    setDiffMeta({
      baseVersion: baseVersionEntry.version,
      targetVersion: targetVersionEntry.version,
    });
    setDiffLoading(true);
    setDiffError(null);
    setDiffValuesContent({ oldValue: "", newValue: "" });
    setDiffImagesContent({ oldValue: "", newValue: "" });

    void (async () => {
      try {
        const [baseArtifacts, targetArtifacts] = await Promise.all([
          loadVersionArtifacts(baseVersionEntry),
          loadVersionArtifacts(targetVersionEntry),
        ]);

        if (diffRequestRef.current !== requestId) {
          return;
        }

        setDiffValuesContent({
          oldValue: targetArtifacts.values,
          newValue: baseArtifacts.values,
        });
        setDiffImagesContent({
          oldValue: targetArtifacts.images,
          newValue: baseArtifacts.images,
        });
      } catch (thrown) {
        if (diffRequestRef.current !== requestId) {
          return;
        }

        setDiffError(
          thrown instanceof Error
            ? thrown.message
            : "Unexpected error while comparing cached artifacts.",
        );
      } finally {
        if (diffRequestRef.current !== requestId) {
          return;
        }
        setDiffLoading(false);
      }
    })();
  };

  const closeDiffModal = () => {
    diffRequestRef.current += 1;
    setDiffModalOpen(false);
    setDiffMeta(null);
    setDiffError(null);
    setDiffLoading(false);
    setDiffValuesContent({ oldValue: "", newValue: "" });
    setDiffImagesContent({ oldValue: "", newValue: "" });
  };

  const activeTab =
    artifactTabs.find((tab) => tab.id === activeArtifact) ??
    artifactTabs[0];
  const diffActiveTabId =
    activeArtifact === "images" ? "images" : "values";
  const diffActiveContent =
    diffActiveTabId === "images" ? diffImagesContent : diffValuesContent;

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-3">
            <a
              href="https://langgenius.github.io/dify-helm/#/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary transition hover:bg-primary/20 active:bg-primary active:text-primary-foreground"
            >
              <ArrowUpRight className="h-2.5 w-2.5" />
              Dify Helm
            </a>
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">
              Dify Helm Nightly Cheatsheet
            </h1>
          </div>
          <p className="max-w-2xl text-xs text-muted-foreground md:text-sm">
            Automatic daily snapshots of Helm chart default values and container image
            version references to support your helm upgrade process.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Last sync
              </span>
              <span className="text-xs font-medium text-foreground">
                {data?.lastUpdated ? formatDate(data.lastUpdated) : "pending"}
              </span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-[320px_1fr]">
        <aside className="relative flex h-full w-full flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-card p-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground"
          >
            <span>Published Versions</span>
            <motion.span
              key={versions.length}
              initial={{ scale: 1.5, color: "rgb(0, 51, 255)" }}
              animate={{ scale: 1, color: "inherit" }}
              transition={{ duration: 0.3 }}
            >
              {versions.length}
            </motion.span>
          </motion.div>
          <div className="custom-scrollbar -mx-3 flex-1 overflow-y-auto px-1">
            {versions.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-6 text-center text-sm text-muted-foreground"
              >
                <Info className="h-6 w-6 text-primary" />
                <p>
                  No cached releases yet. Trigger the cron endpoint or wait for
                  the daily sync.
                </p>
              </motion.div>
            ) : (
              <ul className="flex flex-col">
                {versions.map((version, index) => {
                  const isActive = version.version === selectedVersion;
                  const showDiffIcon = !isActive && Boolean(selectedVersion);
                  return (
                    <motion.li
                      key={version.version}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.3,
                        delay: index * 0.05,
                        ease: "easeOut",
                      }}
                      className="mb-2 last:mb-0"
                    >
                      <div className="relative">
                        <motion.button
                          type="button"
                          onClick={() => setSelectedVersion(version.version)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className={`group flex min-h-[92px] w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-transparent text-muted-foreground hover:border-accent hover:bg-accent/10 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`text-base font-semibold tracking-wide ${
                                isActive ? "text-primary-foreground" : "text-foreground"
                              }`}
                            >
                              v{version.version}
                            </span>
                            <span
                              className={`text-[10px] font-mono uppercase tracking-widest ${
                                isActive ? "text-primary-foreground/90" : "text-muted-foreground"
                              }`}
                            >
                              sha256:{version.values.hash.slice(0, 7)}
                            </span>
                          </div>
                          <div
                            className={`flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.2em] ${
                              isActive ? "text-primary-foreground/90" : "text-muted-foreground"
                            }`}
                          >
                            {version.appVersion && (
                              <span
                                className={`rounded-full border px-2 py-0.5 ${
                                  isActive
                                    ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                                    : "border-border bg-muted text-muted-foreground"
                                }`}
                              >
                                App {version.appVersion}
                              </span>
                            )}
                          </div>
                          {version.createdAt && (
                            <span
                              className={`mt-1 text-[10px] uppercase tracking-[0.2em] ${
                                isActive ? "text-primary-foreground/80" : "text-muted-foreground/80"
                              }`}
                            >
                              {formatDate(version.createdAt)}
                            </span>
                          )}
                        </motion.button>
                        {showDiffIcon ? (
                          <motion.button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDiffModal(version.version);
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            className="absolute bottom-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/70 text-xs text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={
                              selectedVersion
                                ? `Compare v${version.version} with v${selectedVersion}`
                                : `Compare v${version.version}`
                            }
                            title={
                              selectedVersion
                                ? `Compare v${version.version} with v${selectedVersion}`
                                : "Compare versions"
                            }
                          >
                            <Diff className="h-4 w-4" />
                          </motion.button>
                        ) : null}
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <article className="flex h-full flex-col gap-6 overflow-hidden">
          {error ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive-foreground">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="h-4 w-4" />
                {error}
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-destructive bg-transparent px-4 py-1 text-xs uppercase tracking-[0.3em] text-destructive-foreground transition hover:border-destructive/80 hover:bg-destructive/20"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : null}

          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-center gap-4">
              <div className="relative flex w-full justify-center rounded-full border border-border bg-muted p-1">
                {artifactTabs.map((tab) => {
                  const isActive = tab.id === activeTab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveArtifact(tab.id)}
                      className={`relative z-10 flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition-colors ${
                        isActive
                          ? "text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="artifact-tab-indicator"
                          className="absolute inset-0 rounded-full border border-primary bg-primary"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                          }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden">
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </motion.div>
              )}
              <motion.div
                key={activeTab.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {activeTab.type === "code" ? (
                  <CodeBlock
                    label={activeTab.label}
                    value={activeTab.content}
                    language={activeTab.language}
                    version={selectedVersion ?? undefined}
                    className="mx-auto h-full w-full max-w-4xl"
                  />
                ) : (
                  <ImageValidationTable
                    version={selectedVersion ?? undefined}
                    data={validationData}
                    error={validationError}
                    loading={loading}
                    hasAsset={hasValidationAsset}
                    onRetry={handleRetry}
                  />
                )}
              </motion.div>
            </div>
          </div>
        </article>
      </section>
      {diffModalOpen && diffMeta ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeDiffModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="diff-dialog-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`relative flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-2xl transition-all ${
              diffModalFullscreen
                ? "h-[95vh] w-[95vw] max-w-none"
                : "w-full max-w-6xl"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <motion.button
                type="button"
                onClick={() => setDiffModalFullscreen(!diffModalFullscreen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition hover:border-accent hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={diffModalFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={diffModalFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {diffModalFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </motion.button>
              <motion.button
                type="button"
                onClick={closeDiffModal}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition hover:border-accent hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close comparison dialog"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>
            <header className="flex flex-col gap-2 pr-12">
              <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Comparing cached artifacts
              </span>
              <h2
                id="diff-dialog-title"
                className="text-2xl font-semibold text-foreground"
              >
                v{diffMeta.targetVersion} ↔ v{diffMeta.baseVersion}
              </h2>
              <p className="text-sm text-muted-foreground">
                Review differences between releases using the same artifact tabs.
              </p>
            </header>
            <div className="flex items-center justify-center gap-4">
              <div className="relative flex w-full justify-center rounded-full border border-border bg-muted p-1">
                {codeTabs.map((tab) => {
                  const isActive = tab.id === diffActiveTabId;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveArtifact(tab.id)}
                      className={`relative z-10 flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition-colors ${
                        isActive
                          ? "text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="diff-tab-indicator"
                          className="absolute inset-0 rounded-full border border-primary bg-primary"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                          }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {diffError ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                {diffError}
              </div>
            ) : null}
            <div
              className={`relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted ${
                diffModalFullscreen ? "max-h-[calc(95vh-200px)]" : "max-h-[65vh]"
              }`}
            >
              {diffLoading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 backdrop-blur"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </motion.div>
              ) : null}
              <div
                className={`custom-scrollbar flex-1 overflow-auto rounded-xl bg-muted p-4 ${
                  diffModalFullscreen ? "max-h-[calc(95vh-200px)]" : "max-h-[65vh]"
                }`}
              >
                <ReactDiffViewer
                  oldValue={diffActiveContent.oldValue}
                  newValue={diffActiveContent.newValue}
                  splitView
                  styles={diffViewerStyles}
                  useDarkTheme={resolvedTheme === "dark"}
                  showDiffOnly={false}
                  leftTitle={`v${diffMeta.targetVersion}`}
                  rightTitle={`v${diffMeta.baseVersion}`}
                />
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
