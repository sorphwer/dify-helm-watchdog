"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileDiff,
  FileUp,
  Info,
  Loader2,
  MapPinned,
  RefreshCw,
  X,
} from "lucide-react";
import ReactDiffViewer from "react-diff-viewer";
import type { ReactDiffViewerStylesOverride } from "react-diff-viewer";
import type {
  CachePayload,
  ImageValidationPayload,
  StoredVersion,
} from "@/lib/types";
import { CodeBlock } from "@/components/ui/code-block";
import { ImageValidationTable } from "@/components/image-validation-table";
import YAML from "yaml";

const diffViewerStyles: ReactDiffViewerStylesOverride = {
  variables: {
    dark: {
      diffViewerBackground: "transparent",
      diffViewerColor: "rgba(235,235,245,0.85)",
      addedBackground: "rgba(34,197,94,0.18)",
      addedColor: "rgba(74,222,128,0.95)",
      removedBackground: "rgba(248,113,113,0.2)",
      removedColor: "rgba(252,165,165,0.95)",
      wordAddedBackground: "rgba(34,197,94,0.35)",
      wordRemovedBackground: "rgba(248,113,113,0.35)",
      gutterBackground: "rgba(15,15,15,0.7)",
      gutterBackgroundDark: "rgba(15,15,15,0.7)",
      highlightBackground: "rgba(59,130,246,0.2)",
      highlightGutterBackground: "rgba(59,130,246,0.2)",
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
    fontSize: "11px",
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeScalar = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

type WizardStepId = 1 | 2 | 3;

interface ImageTagEntry {
  repository?: string;
  tag?: string;
}

interface TagChange {
  key: string;
  path: string;
  repository?: string;
  oldTag: string | null;
  newTag: string;
  status: "updated" | "unchanged" | "missing";
}

const WIZARD_STEPS: Array<{ id: WizardStepId; label: string }> = [
  { id: 1, label: "Upload file" },
  { id: 2, label: "Review tags" },
  { id: 3, label: "Copy result" },
];

const applyImageTagUpdates = (
  rawYaml: string,
  imageMap: Record<string, ImageTagEntry>,
): { changes: TagChange[]; updatedYaml: string } => {
  const doc = YAML.parseDocument(rawYaml);
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }

  const changes: TagChange[] = [];

  for (const [key, entry] of Object.entries(imageMap)) {
    if (!isRecord(entry)) {
      continue;
    }

    const nextTag = normalizeScalar(entry.tag);
    if (!nextTag) {
      continue;
    }

    const segments = key.split(".");
    const imagePath = [...segments, "image", "tag"];
    const directPath = [...segments, "tag"];

    let status: TagChange["status"] = "missing";
    let previousValue: string | null = null;
    let usedPath: string[] | null = null;

    if (doc.hasIn(imagePath)) {
      const current = doc.getIn(imagePath);
      previousValue = normalizeScalar(current);
      doc.setIn(imagePath, nextTag);
      status = previousValue === nextTag ? "unchanged" : "updated";
      usedPath = imagePath;
    } else if (doc.hasIn(directPath)) {
      const current = doc.getIn(directPath);
      previousValue = normalizeScalar(current);
      doc.setIn(directPath, nextTag);
      status = previousValue === nextTag ? "unchanged" : "updated";
      usedPath = directPath;
    }

    changes.push({
      key,
      path: (usedPath ?? imagePath).join("."),
      repository: normalizeScalar(entry.repository) ?? undefined,
      oldTag: previousValue,
      newTag: nextTag,
      status,
    });
  }

  return {
    changes,
    updatedYaml: doc.toString(),
  };
};

export function VersionExplorer({ data }: VersionExplorerProps) {
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

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStepId>(1);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedValuesText, setUploadedValuesText] = useState<string>("");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [tagChanges, setTagChanges] = useState<TagChange[]>([]);
  const [updatedValuesYaml, setUpdatedValuesYaml] = useState<string>("");
  const [wizardProcessing, setWizardProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const resetWizardState = useCallback(() => {
    setWizardStep(1);
    setUploadedFileName(null);
    setUploadedValuesText("");
    setTagChanges([]);
    setUpdatedValuesYaml("");
    setWizardError(null);
    setWizardProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    resetWizardState();
  }, [resetWizardState]);

  useEffect(() => {
    resetWizardState();
    setWizardOpen(false);
  }, [selectedVersion, resetWizardState]);

  const handleOpenWizard = useCallback(() => {
    resetWizardState();
    if (!imageTagMap || Object.keys(imageTagMap).length === 0) {
      setWizardError(
        "Image metadata for this release has not loaded yet. Once the artifacts are ready you can try again.",
      );
    }
    setWizardOpen(true);
  }, [imageTagMap, resetWizardState]);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];
      if (!file) {
        return;
      }

      setWizardProcessing(true);
      setWizardError(null);

      try {
        if (!imageTagMap || Object.keys(imageTagMap).length === 0) {
          throw new Error(
            "Image metadata has not loaded yet for this release. Wait for the artifacts to finish syncing and try again.",
          );
        }

        const text = await file.text();
        const { changes, updatedYaml } = applyImageTagUpdates(text, imageTagMap);

        setUploadedFileName(file.name);
        setUploadedValuesText(text);
        setTagChanges(changes);
        setUpdatedValuesYaml(updatedYaml);
        setWizardStep(2);
      } catch (thrown) {
        const message =
          thrown instanceof Error
            ? thrown.message
            : "Failed to process the uploaded values.yaml file.";
        setWizardError(message);
        setUploadedFileName(null);
        setUploadedValuesText("");
        setTagChanges([]);
        setUpdatedValuesYaml("");
      } finally {
        setWizardProcessing(false);
        if (event.target) {
          // Allow uploading the same file again
          event.target.value = "";
        }
      }
    },
    [imageTagMap],
  );

  const handleWizardPrev = useCallback(() => {
    setWizardError(null);
    setWizardStep((current) => (current > 1 ? ((current - 1) as WizardStepId) : current));
  }, []);

  const handleWizardNext = useCallback(() => {
    if (wizardProcessing) {
      return;
    }

    if (wizardStep === 1) {
      if (!uploadedValuesText) {
        setWizardError("Upload a values.yaml file to continue.");
        return;
      }
      setWizardError(null);
      setWizardStep(2);
      return;
    }

    if (wizardStep === 2) {
      if (!updatedValuesYaml) {
        setWizardError(
          "We could not generate an updated values.yaml file. Upload it again to retry.",
        );
        return;
      }
      setWizardError(null);
      setWizardStep(3);
      return;
    }

    closeWizard();
  }, [closeWizard, updatedValuesYaml, uploadedValuesText, wizardProcessing, wizardStep]);

  const imageMetadataReady = Boolean(
    imageTagMap && Object.keys(imageTagMap).length > 0,
  );

  let wizardStepBody: JSX.Element;
  if (wizardStep === 1) {
    wizardStepBody = (
      <div className="flex flex-col gap-4 rounded-2xl border border-white/12 bg-black/40 p-5">
        <p className="text-sm text-muted">
          Upload your existing <span className="font-mono text-foreground">values.yaml</span>.
          The file never leaves your browser and is processed locally.
        </p>
        {!imageMetadataReady ? (
          <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-xs text-amber-100">
            Image tag metadata for this release is still syncing. Once the artifacts are ready you
            can rerun this helper.
          </div>
        ) : null}
        <div className="flex flex-col items-start gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,text/yaml,application/x-yaml"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={wizardProcessing || !imageMetadataReady}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted transition hover:border-white/40 hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            Select values.yaml
          </button>
          {uploadedFileName ? (
            <span className="text-xs text-muted">
              Selected file:
              <span className="ml-1 font-mono text-foreground">{uploadedFileName}</span>
            </span>
          ) : null}
          {wizardProcessing ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Processing in your browser...
            </span>
          ) : null}
        </div>
      </div>
    );
  } else if (wizardStep === 2) {
    if (!uploadedValuesText) {
      wizardStepBody = (
        <div className="rounded-2xl border border-white/12 bg-black/40 p-6 text-sm text-muted">
          Upload a values.yaml file to review tag changes.
        </div>
      );
    } else {
      const summary = tagChanges.reduce(
        (acc, change) => {
          acc[change.status] += 1;
          return acc;
        },
        { updated: 0, unchanged: 0, missing: 0 } as Record<
          TagChange["status"],
          number
        >,
      );

      wizardStepBody = (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-emerald-100">
              Updated {summary.updated}
            </span>
            <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">
              Already current {summary.unchanged}
            </span>
            <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-amber-100">
              Missing {summary.missing}
            </span>
          </div>
          <div className="custom-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {tagChanges.length === 0 ? (
              <div className="rounded-2xl border border-white/12 bg-black/40 p-6 text-sm text-muted">
                No Docker image tags were detected in your values.yaml file.
              </div>
            ) : (
              tagChanges.map((change) => {
                const isMissing = change.status === "missing";
                const isUpdated = change.status === "updated";
                const statusLabel =
                  change.status === "updated"
                    ? "Updated"
                    : change.status === "unchanged"
                      ? "Already current"
                      : "Not found";
                const badgeClasses = isMissing
                  ? "border border-amber-400/60 bg-amber-500/15 text-amber-100"
                  : isUpdated
                    ? "border border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : "border border-white/20 bg-white/5 text-muted";
                const StatusIcon = isMissing ? AlertTriangle : CheckCircle2;

                return (
                  <div
                    key={change.key}
                    className="flex flex-col gap-3 rounded-2xl border border-white/12 bg-black/40 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-foreground">
                          {change.key}
                        </span>
                        {change.repository ? (
                          <span className="flex items-center text-xs text-muted">
                            Repository:
                            <span className="ml-1 font-mono text-foreground">
                              {change.repository}
                            </span>
                          </span>
                        ) : null}
                        <span className="block font-mono text-[11px] text-muted">
                          Path: {change.path}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${badgeClasses}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusLabel}
                      </span>
                    </div>
                    {isMissing ? (
                      <p className="text-xs text-amber-100">
                        We could not find {change.path} in your overrides. Update it manually if needed.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-foreground">
                        <span className="text-muted">was</span>
                        <span>{change.oldTag ?? "—"}</span>
                        <ArrowRight className="h-3 w-3 text-muted" />
                        <span>{change.newTag}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }
  } else {
    wizardStepBody = updatedValuesYaml ? (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Copy the refreshed <span className="font-mono text-foreground">values.yaml</span>. Use the
          copy button to paste it back into your environment.
        </p>
        <CodeBlock
          label="values.yaml"
          value={updatedValuesYaml}
          language="yaml"
          version={selectedVersion ?? undefined}
          className="max-h-[420px]"
        />
      </div>
    ) : (
      <div className="rounded-2xl border border-white/12 bg-black/40 p-6 text-sm text-muted">
        Upload your values.yaml file to generate an updated version.
      </div>
    );
  }


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
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-6 overflow-hidden px-4 py-6 md:px-6 lg:px-8">
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
                  const showDiffIcon = !isActive && Boolean(selectedVersion);
                  const showWizardButton = isActive;
                  return (
                    <li key={version.version} className="mb-2 last:mb-0">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedVersion(version.version)}
                          className={`group flex min-h-[92px] w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                            isActive
                              ? "border-[#03f] bg-[#03f] text-white"
                              : "border-white/12 bg-transparent text-muted hover:border-white/40 hover:bg-white/5 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`text-base font-semibold tracking-wide ${
                                isActive ? "text-white" : "text-foreground"
                              }`}
                            >
                              v{version.version}
                            </span>
                            <span
                              className={`text-[10px] font-mono uppercase tracking-widest ${
                                isActive ? "text-white/90" : "text-muted"
                              }`}
                            >
                              sha256:{version.values.hash.slice(0, 7)}
                            </span>
                          </div>
                          <div
                            className={`flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.2em] ${
                              isActive ? "text-white/90" : "text-muted"
                            }`}
                          >
                            {version.appVersion && (
                              <span
                                className={`rounded-full border px-2 py-0.5 ${
                                  isActive
                                    ? "border-white/30 bg-white/10 text-white"
                                    : "border-white/15 bg-white/5 text-muted"
                                }`}
                              >
                                App {version.appVersion}
                              </span>
                            )}
                          </div>
                          {version.createdAt && (
                            <span
                              className={`mt-1 text-[10px] uppercase tracking-[0.08em] ${
                                isActive ? "text-white/80" : "text-muted/80"
                              }`}
                            >
                              {formatDate(version.createdAt)}
                            </span>
                          )}
                        </button>
                        {showWizardButton ? (
                          <button
                            type="button"
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              handleOpenWizard();
                            }}
                            className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-[10px] font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-500/30 hover:text-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                            aria-label="Open tag update wizard"
                            title="Open tag update wizard"
                          >
                            <MapPinned className="h-3.5 w-3.5" />
                            update tag to this
                          </button>
                        ) : null}
                        {showDiffIcon ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDiffModal(version.version);
                            }}
                            className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[10px] font-semibold text-muted transition hover:border-white/40 hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
                            <FileDiff className="h-3.5 w-3.5" />
                            diff
                          </button>
                        ) : null}
                      </div>
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
              {activeTab.type === "code" ? (
                <CodeBlock
                  label={activeTab.label}
                  value={activeTab.content}
                  language={activeTab.language}
                  version={selectedVersion ?? undefined}
                  className="h-full w-full"
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
            </div>
          </div>
        </article>
      </section>
      {wizardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeWizard}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wizard-dialog-title"
        >
          <div
            className="relative flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-white/12 bg-[#080808] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeWizard}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Close update wizard"
            >
              <X className="h-4 w-4" />
            </button>
            <header className="flex flex-col gap-2 pr-12">
              <span className="text-xs uppercase tracking-[0.3em] text-muted">
                Synchronize image tags
              </span>
              <h2 id="wizard-dialog-title" className="text-2xl font-semibold text-foreground">
                v{selectedVersion ?? "?"} values.yaml helper
              </h2>
              <p className="text-sm text-muted">
                Refresh Docker image tags from the selected release without leaving your browser.
              </p>
            </header>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {WIZARD_STEPS.map((step, index) => {
                    const isComplete = wizardStep > step.id;
                    const isActive = wizardStep === step.id;
                    const isLit = isActive || isComplete;
                    return (
                      <div key={step.id} className="flex flex-1 items-center gap-3">
                        <span
                          className={`inline-flex h-3.5 w-3.5 rounded-full transition-colors ${
                            isLit
                              ? "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.65)]"
                              : "bg-white/15"
                          }`}
                        />
                        {index < WIZARD_STEPS.length - 1 ? (
                          <span
                            className={`h-px flex-1 ${
                              isComplete ? "bg-emerald-400/60" : "bg-white/12"
                            }`}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-[0.35em] text-muted">
                  {WIZARD_STEPS.map((step) => {
                    const isLit = wizardStep >= step.id;
                    return (
                      <span
                        key={step.id}
                        className={`flex-1 text-center ${isLit ? "text-emerald-200" : ""}`}
                      >
                        {step.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              {wizardStepBody}
              {wizardError ? (
                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {wizardError}
                </div>
              ) : null}
            </div>
            <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleWizardPrev}
                disabled={wizardStep === 1}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted transition hover:border-white/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous
              </button>
              <div className="flex items-center gap-2 text-xs text-muted">
                {wizardProcessing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    Working...
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleWizardNext}
                disabled={wizardProcessing}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-500/30 hover:text-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {wizardStep === 3 ? "Finish" : "Next"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {diffModalOpen && diffMeta ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeDiffModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="diff-dialog-title"
        >
          <div
            className="relative flex w-full max-w-[calc(100%-2rem)] flex-col gap-5 rounded-3xl border border-white/12 bg-[#080808] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeDiffModal}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Close comparison dialog"
            >
              <X className="h-4 w-4" />
            </button>
            <header className="flex flex-col gap-2 pr-12">
              <span className="text-xs uppercase tracking-[0.3em] text-muted">
                Comparing cached artifacts
              </span>
              <h2
                id="diff-dialog-title"
                className="text-2xl font-semibold text-foreground"
              >
                v{diffMeta.targetVersion} ↔ v{diffMeta.baseVersion}
              </h2>
              <p className="text-sm text-muted">
                Review differences between releases using the same artifact tabs.
              </p>
            </header>
            <div className="flex items-center justify-center gap-4">
              <div className="flex w-full justify-center rounded-full border border-white/12 bg-black/60 p-1">
                {codeTabs.map((tab) => {
                  const isActive = tab.id === diffActiveTabId;
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
            {diffError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {diffError}
              </div>
            ) : null}
            <div className="relative flex max-h-[65vh] flex-1 flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/80">
              {diffLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 backdrop-blur">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : null}
              <div className="custom-scrollbar max-h-[65vh] flex-1 overflow-auto p-4">
                <ReactDiffViewer
                  oldValue={diffActiveContent.oldValue}
                  newValue={diffActiveContent.newValue}
                  splitView
                  styles={diffViewerStyles}
                  useDarkTheme
                  showDiffOnly={false}
                  leftTitle={`v${diffMeta.targetVersion}`}
                  rightTitle={`v${diffMeta.baseVersion}`}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
