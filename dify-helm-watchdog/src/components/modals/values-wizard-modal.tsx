"use client";

import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import YAML from "yaml";
import { CodeBlock } from "@/components/ui/code-block";

// Types
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

interface ValuesWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVersion: string | null;
  imageTagMap: Record<string, ImageTagEntry> | null;
}

// Constants
const WIZARD_STEPS: Array<{ id: WizardStepId; label: string }> = [
  { id: 1, label: "Upload file" },
  { id: 2, label: "Review tags" },
  { id: 3, label: "Copy result" },
];

// Helper functions
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

export default function ValuesWizardModal({
  isOpen,
  onClose,
  selectedVersion,
  imageTagMap,
}: ValuesWizardModalProps) {
  const [wizardStep, setWizardStep] = useState<WizardStepId>(1);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedValuesText, setUploadedValuesText] = useState<string>("");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [tagChanges, setTagChanges] = useState<TagChange[]>([]);
  const [updatedValuesYaml, setUpdatedValuesYaml] = useState<string>("");
  const [wizardProcessing, setWizardProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imageMetadataReady = Boolean(
    imageTagMap && Object.keys(imageTagMap).length > 0,
  );

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

  useEffect(() => {
    if (!isOpen) {
      resetWizardState();
    }
  }, [isOpen, resetWizardState]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

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

    onClose();
  }, [onClose, updatedValuesYaml, uploadedValuesText, wizardProcessing, wizardStep]);

  let wizardStepBody: ReactElement;
  if (wizardStep === 1) {
    wizardStepBody = (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Upload your existing <span className="font-mono text-foreground">values.yaml</span>.
          The file never leaves your browser and is processed locally.
        </p>
        {!imageMetadataReady ? (
          <div className="rounded-xl border border-warning bg-warning/15 px-4 py-3 text-xs font-medium text-warning">
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
            className="inline-flex items-center gap-2 rounded-full border border-border bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            Select values.yaml
          </button>
          {uploadedFileName ? (
            <span className="text-xs text-muted-foreground">
              Selected file:
              <span className="ml-1 font-mono text-foreground">{uploadedFileName}</span>
            </span>
          ) : null}
          {wizardProcessing ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Processing in your browser...
            </span>
          ) : null}
        </div>
      </div>
    );
  } else if (wizardStep === 2) {
    if (!uploadedValuesText) {
      wizardStepBody = (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Upload a values.yaml file to review tag changes.
        </div>
      );
    } else {
      const summary = tagChanges.reduce(
        (acc, change) => {
          acc[change.status] += 1;
          return acc;
        },
        { updated: 0, unchanged: 0, missing: 0 } as Record<TagChange["status"], number>,
      );

      wizardStepBody = (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.3em]">
            <span className="rounded-full border border-success bg-success/20 px-3 py-1 font-semibold text-success">
              Updated {summary.updated}
            </span>
            <span className="rounded-full border border-border bg-muted px-3 py-1 font-semibold text-foreground">
              Already current {summary.unchanged}
            </span>
            <span className="rounded-full border border-warning bg-warning/20 px-3 py-1 font-semibold text-warning">
              Missing {summary.missing}
            </span>
          </div>
          <div className="custom-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {tagChanges.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
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
                  ? "border border-warning bg-warning/20 text-warning font-semibold"
                  : isUpdated
                    ? "border border-success bg-success/20 text-success font-semibold"
                    : "border border-border bg-muted text-foreground font-semibold";
                const StatusIcon = isMissing ? AlertTriangle : CheckCircle2;

                return (
                  <div
                    key={change.key}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-foreground">
                          {change.key}
                        </span>
                        {change.repository ? (
                          <span className="flex items-center text-xs text-muted-foreground">
                            Repository:
                            <span className="ml-1 font-mono text-foreground">
                              {change.repository}
                            </span>
                          </span>
                        ) : null}
                        <span className="block font-mono text-[11px] text-muted-foreground">
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
                      <p className="text-xs font-medium text-warning">
                        We could not find {change.path} in your overrides. Update it manually if
                        needed.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-foreground">
                        <span className="text-muted-foreground">was</span>
                        <span>{change.oldTag ?? "—"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
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
        <p className="text-sm text-muted-foreground">
          Copy the refreshed <span className="font-mono text-foreground">values.yaml</span>. Use
          the copy button to paste it back into your environment.
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
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Upload your values.yaml file to generate an updated version.
      </div>
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-dialog-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <motion.button
          type="button"
          onClick={onClose}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close update wizard"
        >
          <X className="h-4 w-4" />
        </motion.button>
        <header className="flex flex-col gap-2 pr-12">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Synchronize image tags
          </span>
          <h2 id="wizard-dialog-title" className="text-2xl font-semibold text-foreground">
            v{selectedVersion ?? "?"} values.yaml helper
          </h2>
          <p className="text-sm text-muted-foreground">
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
                        isLit ? "bg-success shadow-[0_0_12px_rgba(34,197,94,0.65)]" : "bg-muted"
                      }`}
                    />
                    {index < WIZARD_STEPS.length - 1 ? (
                      <span
                        className={`h-px flex-1 ${isComplete ? "bg-success/60" : "bg-border"}`}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              {WIZARD_STEPS.map((step) => {
                const isLit = wizardStep >= step.id;
                return (
                  <span
                    key={step.id}
                    className={`flex-1 text-center ${isLit ? "text-success-foreground" : ""}`}
                  >
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>
          {wizardStepBody}
          {wizardError ? (
            <div className="rounded-2xl border border-destructive bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive">
              {wizardError}
            </div>
          ) : null}
        </div>
        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <motion.button
            type="button"
            onClick={handleWizardPrev}
            disabled={wizardStep === 1}
            whileHover={wizardStep > 1 ? { scale: 1.02 } : {}}
            whileTap={wizardStep > 1 ? { scale: 0.98 } : {}}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </motion.button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {wizardProcessing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Working...
              </span>
            ) : null}
          </div>
          <motion.button
            type="button"
            onClick={handleWizardNext}
            disabled={wizardProcessing}
            whileHover={!wizardProcessing ? { scale: 1.02 } : {}}
            whileTap={!wizardProcessing ? { scale: 0.98 } : {}}
            className="inline-flex items-center gap-2 rounded-full border border-success/60 bg-success/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-success-foreground transition hover:border-success/80 hover:bg-success/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success disabled:cursor-not-allowed disabled:opacity-60"
          >
            {wizardStep === 3 ? "Finish" : "Next"}
          </motion.button>
        </footer>
      </motion.div>
    </div>
  );
}

