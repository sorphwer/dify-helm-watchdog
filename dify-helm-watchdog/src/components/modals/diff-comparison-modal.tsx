"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Filter } from "lucide-react";
import { motion } from "framer-motion";
import ReactDiffViewer from "react-diff-viewer";
import type { ReactDiffViewerStylesOverride } from "react-diff-viewer";

interface DiffComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetVersion: string;
  baseVersion: string;
  activeTabId: string;
  tabs: Array<{ id: string; label: string }>;
  onTabChange: (tabId: string) => void;
  diffContent: {
    oldValue: string;
    newValue: string;
  };
  diffViewerStyles: ReactDiffViewerStylesOverride;
  theme: string | undefined;
  isLoading: boolean;
  error: string | null;
}

export default function DiffComparisonModal({
  isOpen,
  onClose,
  targetVersion,
  baseVersion,
  activeTabId,
  tabs,
  onTabChange,
  diffContent,
  diffViewerStyles,
  theme,
  isLoading,
  error,
}: DiffComparisonModalProps) {
  const [showDiffOnly, setShowDiffOnly] = useState(false);

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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-dialog-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-2xl transition-all max-h-[95vh] max-w-[95vw] w-full"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header buttons */}
        <div className="absolute right-4 top-4">
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition hover:border-accent hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close comparison dialog"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Header */}
        <header className="flex flex-col gap-2 pr-12">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Comparing cached artifacts
          </span>
          <h2
            id="diff-dialog-title"
            className="text-2xl font-semibold text-foreground"
          >
            v{targetVersion} ↔ v{baseVersion}
          </h2>
          <p className="text-sm text-muted-foreground">
            Review differences between releases using the same artifact tabs.
          </p>
        </header>

        {/* Tabs and Filter Toggle */}
        <div className="flex items-center gap-4">
          <div className="relative flex flex-[9] justify-center rounded-full bg-black/10 p-1 min-w-0 dark:bg-muted/50">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition-colors ${
                    isActive
                      ? "z-20 text-primary-foreground shadow-sm"
                      : "z-10 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="diff-tab-indicator"
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
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <motion.button
            type="button"
            onClick={() => setShowDiffOnly((prev) => !prev)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`group inline-flex items-center gap-2 overflow-hidden rounded-full border-none px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition-all whitespace-nowrap shrink-0 flex-[1] justify-center shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.4),inset_-1px_-1px_0_0_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur-[14px] backdrop-saturate-150 ${
              showDiffOnly
                ? "bg-primary text-primary-foreground shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.4),inset_-1px_-1px_0_0_rgba(0,0,0,0.2),0_4px_12px_rgba(var(--color-primary),0.4)]"
                : "bg-white/50 text-muted-foreground hover:bg-white/70 hover:text-foreground dark:bg-white/5 dark:hover:bg-white/10"
            }`}
            aria-label={showDiffOnly ? "Show all lines" : "Show diff only"}
          >
            {showDiffOnly && (
               <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.1),transparent_60%)]" />
            )}
            <Filter className={`h-3.5 w-3.5 ${showDiffOnly ? "drop-shadow-sm" : ""}`} />
            <span className={showDiffOnly ? "drop-shadow-sm" : ""}>Diff Only</span>
          </motion.button>
        </div>

        {/* Error message */}
        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        {/* Diff content */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted max-h-[calc(95vh-200px)]"
        >
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 backdrop-blur"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </motion.div>
          ) : null}
          <div
            className="custom-scrollbar flex-1 overflow-auto rounded-xl bg-muted p-4 max-h-[calc(95vh-200px)]"
          >
            <div className="min-w-fit">
              <ReactDiffViewer
                oldValue={diffContent.oldValue}
                newValue={diffContent.newValue}
                splitView
                styles={diffViewerStyles}
                useDarkTheme={theme === "dark"}
                showDiffOnly={showDiffOnly}
                leftTitle={`v${targetVersion}`}
                rightTitle={`v${baseVersion}`}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

