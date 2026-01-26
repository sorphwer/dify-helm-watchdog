"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  BookOpenText,
  CalendarClock,
  Copy,
  FileDiff,
  FileJson,
  Info,
  Loader2,
  MapPinned,
  RefreshCw,
  ScrollText,
  Settings2,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { ReactDiffViewerStylesOverride } from "react-diff-viewer";
import YAML from "yaml";
import type {
  CachePayload,
  ImageValidationPayload,
  StoredVersion,
} from "@/lib/types";
import { CodeBlock } from "@/components/ui/code-block";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { ImageValidationTable } from "@/components/image-validation-table";
import { ThemeToggle } from "@/components/theme-toggle";
import ValuesWizardModal from "@/components/modals/values-wizard-modal";
import DiffComparisonModal from "@/components/modals/diff-comparison-modal";
import McpConfigModal from "@/components/modals/mcp-config-modal";
import WorkflowLogsModal from "@/components/modals/workflow-logs-modal";

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
      codeFoldContentColor: "oklch(65% 0 0)",
      diffViewerTitleBackground: "oklch(16% 0 0)",
      diffViewerTitleColor: "oklch(95% 0 0)",
      diffViewerTitleBorderColor: "oklch(28% 0 0)",
    },
  },
  gutter: {
    color: "rgba(148,163,184,0.65)",
    padding: "0 4px",
    minWidth: "36px",
    width: "36px",
    textAlign: "right",
    fontSize: "10px",
  },
  marker: {
    padding: "0 4px",
    width: "20px",
    fontSize: "10px",
  },
  diffContainer: {
    borderRadius: "16px",
    overflow: "hidden",
    width: "100%",
  },
  titleBlock: {
    padding: "8px 12px",
  },
  content: {
    width: "auto",
  },
  contentText: {
    padding: "0 8px",
    fontSize: "11px",
    lineHeight: "1.4",
  },
  line: {
    padding: "0",
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

const formatDateParts = (
  input?: string | null,
): { date: string; time: string } => {
  if (!input) {
    return { date: "pending", time: "" };
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return { date: input, time: "" };
  }

  return {
    date: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date),
    time: new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(date),
  };
};

import { normalizeValidationPayload } from "@/lib/validation";

const parseValidationPayload = (
  raw: string | undefined | null,
): { payload: ImageValidationPayload | null; error: string | null } => {
  if (!raw) {
    return { payload: null, error: null };
  }

  try {
    const parsed = JSON.parse(raw) as ImageValidationPayload;
    return { payload: normalizeValidationPayload(parsed), error: null };
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

const DOCS_BASE_URL = "https://langgenius.github.io/dify-helm/";

const normalizeDocsMarkdown = (content: string): string =>
  content.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
    (_match, rawHref: string, label: string) => {
      const trimmedHref = rawHref.trim();
      const normalizedHref =
        /^https?:\/\//i.test(trimmedHref)
          ? trimmedHref
          : `${DOCS_BASE_URL}${trimmedHref.replace(/^\.\//, "")}`;
      return `[${label}](${normalizedHref})`;
    },
  );

// Helper for parsing image metadata
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface ImageTagEntry {
  repository?: string;
  tag?: string;
}

// Version status from official Dify Helm docs sidebar
type VersionStatus = "non-skippable" | "archived" | "deprecated";

const parseSidebarMd = (content: string): Map<string, VersionStatus> => {
  const map = new Map<string, VersionStatus>();
  const lines = content.split("\n");

  for (const line of lines) {
    // Extract version number from markdown link
    const versionMatch = line.match(/\[v([\d.]+(?:-[^\]]+)?)/);
    if (!versionMatch) continue;

    const version = versionMatch[1];

    // Identify status by emoji
    if (line.includes("⚠️")) {
      map.set(version, "non-skippable");
    } else if (line.includes("📦")) {
      map.set(version, "archived");
    } else if (line.includes("🗑️")) {
      map.set(version, "deprecated");
    }
  }

  return map;
};

export function VersionExplorer({ data }: VersionExplorerProps) {
  const { resolvedTheme } = useTheme();
  const versions = useMemo(() => data?.versions ?? [], [data?.versions]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(
    versions[0]?.version ?? null,
  );
  const [activeArtifact, setActiveArtifact] = useState<
    "values" | "images" | "validation" | "details"
  >("values");
  const [valuesContent, setValuesContent] = useState<string>("");
  const [imagesContent, setImagesContent] = useState<string>("");
  const [validationData, setValidationData] =
    useState<ImageValidationPayload | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasValidationAsset, setHasValidationAsset] = useState(false);
  const [detailsContent, setDetailsContent] = useState<string>("");
  const [detailsStatus, setDetailsStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsReloadKey, setDetailsReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [reloadTarget, setReloadTarget] = useState<string | null>(null);
  const [processedReload, setProcessedReload] = useState(0);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
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
  const detailsRequestRef = useRef(0);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);

  // MCP config modal state
  const [mcpModalOpen, setMcpModalOpen] = useState(false);

  // Workflow logs modal state
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  // Version status from official docs (fetched async)
  const [versionStatusMap, setVersionStatusMap] = useState<Map<string, VersionStatus>>(new Map());

  const versionMap = useMemo(() => {
    return new Map<string, StoredVersion>(
      versions.map((entry) => [entry.version, entry]),
    );
  }, [versions]);

  const imageTagMap = useMemo(() => {
    if (!imagesContent) {
      return null;
    }

    try {
      const parsed = YAML.parse(imagesContent);
      if (!isRecord(parsed)) {
        return null;
      }

      return parsed as Record<string, ImageTagEntry>;
    } catch (error) {
      console.warn("[version-explorer] Failed to parse image tag manifest", error);
      return null;
    }
  }, [imagesContent]);

  // Fetch version status from official Dify Helm docs
  useEffect(() => {
    const controller = new AbortController();

    fetch("https://langgenius.github.io/dify-helm/_sidebar.md", {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then(parseSidebarMd)
      .then(setVersionStatusMap)
      .catch(() => {
        // Silent fail - don't modify UI if request fails
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedVersion) {
      setDetailsContent("");
      setDetailsStatus("idle");
      setDetailsError(null);
      return;
    }

    const controller = new AbortController();
    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;

    setDetailsStatus("loading");
    setDetailsError(null);
    setDetailsContent("");

    const docsVersion = selectedVersion.replace(/\./g, "_");

    fetch(`https://langgenius.github.io/dify-helm/pages/${docsVersion}.md`, {
      signal: controller.signal,
    })
      .then((res) =>
        res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((text) => {
        if (detailsRequestRef.current !== requestId) {
          return;
        }
        setDetailsContent(normalizeDocsMarkdown(text));
        setDetailsStatus("success");
      })
      .catch((thrown) => {
        if (detailsRequestRef.current !== requestId) {
          return;
        }
        if (thrown instanceof Error && thrown.name === "AbortError") {
          return;
        }
        setDetailsStatus("error");
        setDetailsError(`Failed to load details for v${selectedVersion}.`);
      });

    return () => controller.abort();
  }, [selectedVersion, detailsReloadKey]);

  // Wizard handlers
  const handleOpenWizard = useCallback(() => {
    setWizardOpen(true);
  }, []);

  const handleCloseWizard = useCallback(() => {
    setWizardOpen(false);
  }, []);

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

  const handleDetailsRetry = useCallback(() => {
    setDetailsReloadKey((value) => value + 1);
  }, []);

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
      {
        id: "details" as const,
        label: "Details",
        type: "markdown" as const,
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

  const lastSync = formatDateParts(data?.updateTime);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-3">
            <a
              href="https://langgenius.github.io/dify-helm/#/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-primary/20 active:bg-primary active:text-primary-foreground"
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
        <div className="flex shrink-0 flex-wrap items-stretch justify-end gap-2">
          <button
            type="button"
            onClick={() => setLogsModalOpen(true)}
            className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/10"
          >
            <div className="flex flex-col items-start leading-tight">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                Last sync
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap text-left">
                {lastSync.date}
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap text-left">
                {lastSync.time || "\u00A0"}
              </span>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:bg-accent group-hover:text-foreground">
              <ScrollText className="h-5 w-5" />
            </span>
          </button>

          <Link
            href="/swagger"
            className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/10"
          >
            <div className="flex flex-col leading-tight">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                <BookOpenText className="h-3.5 w-3.5 shrink-0" />
                Docs
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                Swagger
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                UI
              </span>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:bg-accent group-hover:text-foreground">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          </Link>

          <Link
            href="/openapi.json"
            className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/10"
          >
            <div className="flex flex-col leading-tight">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                <FileJson className="h-3.5 w-3.5 shrink-0" />
                Spec
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                OpenAPI
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                JSON
              </span>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:bg-accent group-hover:text-foreground">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMcpModalOpen(true)}
            className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/10"
          >
            <div className="flex flex-col leading-tight text-left">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                Connect
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                MCP
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                Server
              </span>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:bg-accent group-hover:text-foreground">
              <Copy className="h-5 w-5" />
            </span>
          </button>

          <div className="flex min-h-[64px] items-center justify-center rounded-xl border border-border bg-card px-3 py-3">
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
                  const showWizardButton = isActive;
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
                          className={`group relative flex min-h-[92px] w-full flex-col gap-1 overflow-hidden rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-transparent text-muted-foreground hover:border-accent hover:bg-accent/10 hover:text-foreground"
                            }`}
                        >
                          {/* Decorative background icon for special status versions */}
                          {versionStatusMap.get(version.version) === "archived" && (
                            <Archive 
                              className={`pointer-events-none absolute -right-6 -top-2 z-0 h-28 w-28 transition-all duration-200 ${
                                isActive 
                                  ? "text-white/10" 
                                  : "text-zinc-200 dark:text-zinc-700"
                              }`}
                              strokeWidth={1.7}
                            />
                          )}
                          {versionStatusMap.get(version.version) === "deprecated" && (
                            <Trash2 
                              className={`pointer-events-none absolute -right-6 -top-2 z-0 h-28 w-28 transition-all duration-200 ${
                                isActive 
                                  ? "text-white/10" 
                                  : "text-rose-200 dark:text-rose-900"
                              }`}
                              strokeWidth={1.7}
                            />
                          )}
                          {versionStatusMap.get(version.version) === "non-skippable" && (
                            <AlertTriangle 
                              className={`pointer-events-none absolute -right-6 -top-2 z-0 h-28 w-28 transition-all duration-200 ${
                                isActive 
                                  ? "text-white/10" 
                                  : "text-amber-200 dark:text-yellow-900"
                              }`}
                              strokeWidth={1.7}
                            />
                          )}
                          <div className="relative z-10 flex items-baseline justify-between gap-3">
                            <span
                              className={`text-base font-semibold tracking-wide ${isActive
                                  ? "text-primary-foreground"
                                  : versionStatusMap.get(version.version) === "archived" || versionStatusMap.get(version.version) === "deprecated"
                                    ? "text-muted-foreground"
                                    : "text-foreground"
                                }`}
                            >
                              v{version.version}
                            </span>
                            <span
                              className={`text-[10px] font-mono uppercase tracking-widest ${isActive ? "text-primary-foreground/90" : "text-muted-foreground"
                                }`}
                            >
                              sha256:{version.values.hash.slice(0, 7)}
                            </span>
                          </div>
                          <div
                            className={`relative z-10 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.2em] ${isActive ? "text-primary-foreground/90" : "text-muted-foreground"
                              }`}
                          >
                            {version.appVersion && (
                              <span
                                className={`text-[10px] font-semibold tracking-normal ${isActive
                                    ? "text-primary-foreground"
                                    : "text-muted-foreground"
                                  }`}
                              >
                                App {version.appVersion}
                              </span>
                            )}
                            {versionStatusMap.get(version.version) === "non-skippable" && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal ${isActive
                                    ? "text-primary-foreground"
                                    : "text-amber-600 dark:text-amber-400"
                                  }`}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Non-skippable
                              </span>
                            )}
                            {versionStatusMap.get(version.version) === "archived" && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal ${isActive
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground/70"
                                  }`}
                              >
                                <Archive className="h-2.5 w-2.5" />
                                Archived
                              </span>
                            )}
                            {versionStatusMap.get(version.version) === "deprecated" && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal ${isActive
                                    ? "text-primary-foreground"
                                    : "text-red-600 dark:text-red-400"
                                  }`}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                                Deprecated
                              </span>
                            )}
                          </div>
                          {version.createTime && (
                            <span
                              className={`relative z-10 mt-1 text-[9px] uppercase tracking-[0.05em] ${isActive ? "text-primary-foreground/80" : "text-muted-foreground/80"
                                }`}
                            >
                              {formatDate(version.createTime)}
                            </span>
                          )}
                        </motion.button>
                        {showWizardButton ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenWizard();
                            }}
                            className="group/wizard absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 overflow-hidden rounded-full border-none bg-white/20 px-3 py-1 text-[10px] font-medium text-white shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.6),inset_-1px_-1px_0_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)] backdrop-blur-[14px] backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:bg-white/30 hover:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.8),inset_-1px_-1px_0_0_rgba(255,255,255,0.5),0_6px_20px_rgba(0,0,0,0.25)] active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            aria-label="Open tag update wizard"
                            title="Open tag update wizard"
                          >
                            <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.3),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.15),transparent_50%)] opacity-100 transition-opacity group-hover/wizard:opacity-100" />
                            <MapPinned className="h-3.5 w-3.5 drop-shadow-sm" />
                            <span className="drop-shadow-sm">update tag to this</span>
                          </button>
                        ) : null}
                        {showDiffIcon ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDiffModal(version.version);
                            }}
                            className="group/diff absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 overflow-hidden rounded-full border-none bg-white/20 px-3 py-1 text-[10px] font-medium text-foreground shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.7),inset_-1px_-1px_0_0_rgba(0,0,0,0.05),0_4px_12px_rgba(0,0,0,0.05)] backdrop-blur-[4px] backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:bg-white/30 hover:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.9),inset_-1px_-1px_0_0_rgba(0,0,0,0.1),0_6px_16px_rgba(0,0,0,0.1)] active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:bg-white/8 dark:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.3),inset_-1px_-1px_0_0_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.2)] dark:hover:bg-white/15 dark:hover:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.4),inset_-1px_-1px_0_0_rgba(255,255,255,0.15),0_6px_16px_rgba(0,0,0,0.3)]"
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
                            <span className="absolute inset-0 -z-20 rounded-full bg-white/15 dark:bg-white/5 backdrop-blur-[4px] backdrop-saturate-150" />
                            <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.4),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.1),transparent_50%)] opacity-0 transition-opacity group-hover/diff:opacity-100 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_50%)]" />
                            <FileDiff className="h-3.5 w-3.5 drop-shadow-sm" />
                            <span className="drop-shadow-sm">diff</span>
                          </button>
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
            <div className="relative z-30 flex items-center justify-center gap-4 py-2">
              <div className="relative flex w-full justify-center rounded-full bg-black/10 p-1 shadow-[6px_6px_18px_rgba(0,0,0,0.12)] dark:bg-muted/50">
                {artifactTabs.map((tab) => {
                  const isActive = tab.id === activeTab.id;
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveArtifact(tab.id)}
                      className={`relative flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition-colors ${isActive
                          ? "z-20 text-primary-foreground shadow-sm"
                          : "z-10 text-muted-foreground hover:text-foreground"
                        }`}
                      whileHover={
                        !isActive
                          ? {
                            scale: 1.02,
                          }
                          : {}
                      }
                      whileTap={{
                        scale: 0.98,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    >
                      {/* 激活状态的背景指示器 - Liquid Glass Style */}
                      {isActive && (
                        <motion.div
                          layoutId="artifact-tab-indicator"
                          className="absolute inset-0 rounded-full bg-primary shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.4),inset_-1px_-1px_0_0_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-md"
                          initial={{ scale: 1, filter: "blur(0px)" }}
                          animate={{ 
                            scale: [1, 1.4, 1],
                            filter: ["blur(0px) brightness(1)", "blur(12px) brightness(2)", "blur(0px) brightness(1)"] 
                          }}
                          transition={{
                            layout: {
                              type: "spring",
                              stiffness: 350,
                              damping: 40,
                            },
                            scale: {
                              duration: 0.25,
                              ease: "easeInOut",
                              times: [0, 0.35, 1]
                            },
                            filter: {
                              duration: 0.25,
                              ease: "easeInOut",
                              times: [0, 0.35, 1]
                            }
                          }}
                        >
                           <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.1),transparent_60%)]" />
                        </motion.div>
                      )}
                      {/* Hover 状态的微妙高光效果 */}
                      {!isActive && (
                        <motion.div
                          className="pointer-events-none absolute inset-0 rounded-full bg-accent/30"
                          initial={{ opacity: 0 }}
                          whileHover={{ opacity: 1 }}
                          transition={{
                            duration: 0.2,
                          }}
                        />
                      )}
                      <span className="pointer-events-none relative z-10">{tab.label}</span>
                    </motion.button>
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
                    className="h-full w-full"
                  />
                ) : activeTab.type === "markdown" ? (
                  detailsStatus === "success" ? (
                    <MarkdownRenderer
                      content={detailsContent}
                      className="h-full w-full"
                    />
                  ) : detailsStatus === "loading" || detailsStatus === "idle" ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card/30">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span>Loading details...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card/30 p-6">
                      <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
                        <div className="flex items-center gap-2 text-foreground/90">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span>
                            {detailsError ??
                              `Failed to load details for v${selectedVersion ?? ""}.`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleDetailsRetry}
                          className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-transparent px-4 py-1 text-xs uppercase tracking-[0.3em] text-foreground transition hover:border-primary/70 hover:bg-primary/10"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Refresh
                        </button>
                      </div>
                    </div>
                  )
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
      <DiffComparisonModal
        isOpen={diffModalOpen && Boolean(diffMeta)}
        onClose={closeDiffModal}
        targetVersion={diffMeta?.targetVersion ?? ""}
        baseVersion={diffMeta?.baseVersion ?? ""}
        activeTabId={diffActiveTabId}
        tabs={codeTabs}
        onTabChange={(tabId) =>
          setActiveArtifact(tabId as "values" | "images" | "validation")
        }
        diffContent={diffActiveContent}
        diffViewerStyles={diffViewerStyles}
        theme={resolvedTheme}
        isLoading={diffLoading}
        error={diffError}
      />

      <ValuesWizardModal
        isOpen={wizardOpen}
        onClose={handleCloseWizard}
        selectedVersion={selectedVersion}
        imageTagMap={imageTagMap}
        templateValuesYaml={valuesContent}
      />

      <McpConfigModal
        open={mcpModalOpen}
        onOpenChange={setMcpModalOpen}
      />

      <WorkflowLogsModal
        open={logsModalOpen}
        onOpenChange={setLogsModalOpen}
      />
    </div>
  );
}
