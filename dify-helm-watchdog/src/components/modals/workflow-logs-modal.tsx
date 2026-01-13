"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  RefreshCw,
  ScrollText,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  WorkflowLogsPayload,
  WorkflowLogEntry,
} from "@/lib/workflow-logs";

interface WorkflowLogsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Browser cache key for workflow logs
const CACHE_KEY = "dify-helm-watchdog:workflow-logs";

/**
 * Load workflow logs from browser localStorage
 */
function loadFromBrowserCache(): WorkflowLogsPayload | null {
  if (typeof window === "undefined") return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as WorkflowLogsPayload;
  } catch (error) {
    console.warn("[workflow-logs] Failed to load from browser cache:", error);
    return null;
  }
}

/**
 * Save workflow logs to browser localStorage
 */
function saveToBrowserCache(payload: WorkflowLogsPayload): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[workflow-logs] Failed to save to browser cache:", error);
  }
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatElapsedTime = (seconds: number): string => {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
};

const StatusBadge = ({
  status,
}: {
  status: WorkflowLogEntry["workflow_run"]["status"];
}) => {
  const config = {
    succeeded: {
      icon: CheckCircle2,
      className: "bg-green-500/10 text-green-600 border-green-500/30",
      label: "Succeeded",
    },
    failed: {
      icon: XCircle,
      className: "bg-red-500/10 text-red-600 border-red-500/30",
      label: "Failed",
    },
    stopped: {
      icon: AlertCircle,
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
      label: "Stopped",
    },
    running: {
      icon: Loader2,
      className: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      label: "Running",
    },
  };

  const { icon: Icon, className, label } = config[status] ?? config.stopped;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`}
      />
      {label}
    </span>
  );
};

const LogEntry = ({ entry }: { entry: WorkflowLogEntry }) => {
  const { workflow_run, created_at } = entry;

  return (
    <div className="group grid grid-cols-5 items-center rounded-xl border border-border bg-card px-4 py-3 transition-all hover:bg-accent/5 hover:shadow-sm">
      {/* Timestamp */}
      <span className="text-xs font-medium text-foreground whitespace-nowrap">
        {formatTimestamp(created_at)}
      </span>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <StatusBadge status={workflow_run.status} />
        {workflow_run.exceptions_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3" />
            {workflow_run.exceptions_count}
          </span>
        )}
      </div>

      {/* Duration */}
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {formatElapsedTime(workflow_run.elapsed_time)}
        </span>
      </div>

      {/* Tokens */}
      <div className="flex items-center gap-1.5">
        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-mono font-medium text-foreground">
          {(workflow_run.total_tokens ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1.5">
        <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {workflow_run.total_steps}
        </span>
      </div>
    </div>
  );
};

export default function WorkflowLogsModal({
  open,
  onOpenChange,
}: WorkflowLogsModalProps) {
  const [data, setData] = useState<WorkflowLogsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Load from browser cache on mount
  useEffect(() => {
    const cached = loadFromBrowserCache();
    if (cached) {
      setData(cached);
      setIsFromCache(true);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/workflow-logs");
      if (!response.ok) {
        throw new Error("Failed to load workflow logs");
      }
      const payload = (await response.json()) as WorkflowLogsPayload;
      setData(payload);
      setIsFromCache(false);
      
      // Save to browser cache
      saveToBrowserCache(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/workflow-logs", {
        method: "POST",
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const minutes = retryAfter
          ? Math.ceil(parseInt(retryAfter, 10) / 60)
          : 5;
        setError(`Rate limited. Please wait ${minutes} minute(s).`);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message ?? "Failed to refresh workflow logs",
        );
      }

      const payload = (await response.json()) as WorkflowLogsPayload;
      setData(payload);
      setIsFromCache(false);
      
      // Save to browser cache
      saveToBrowserCache(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh logs");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchLogs();
    }
  }, [open, fetchLogs]);

  const lastUpdate = data?.updateTime
    ? new Date(data.updateTime).toLocaleString()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[70vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <ScrollText className="h-5 w-5 text-brand" />
                Dify Workflow Execution Logs
              </DialogTitle>
              <DialogDescription>
                Recent workflow execution history and status from Dify.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-4">
              {lastUpdate && (
                <div className="text-right hidden sm:block">
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Last Synced {isFromCache && "(cached)"}
                  </span>
                  <span className="text-xs font-medium">{lastUpdate}</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh logs"
              >
                <RefreshCw
                  className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/10 p-6">
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive-foreground">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Fetching latest logs...</p>
            </div>
          ) : data?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center text-muted-foreground">
              <div className="rounded-full bg-muted p-4">
                <ScrollText className="h-8 w-8 opacity-50" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">No workflow logs available</p>
                <p className="text-sm">Click refresh to fetch the latest execution history from Dify.</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Loading overlay when refreshing with existing data */}
              {(loading || refreshing) && data && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>{refreshing ? "Refreshing..." : "Loading..."}</span>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {/* Table Header */}
                <div className="grid grid-cols-5 items-center px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <span>Time</span>
                  <span>Status</span>
                  <span>Duration</span>
                  <span>Tokens</span>
                  <span>Steps</span>
                </div>
                {/* Log Entries */}
                {data?.data.map((entry) => (
                  <LogEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="border-t border-border bg-muted/20 px-6 py-3 text-[10px] text-muted-foreground flex justify-between items-center">
          <span>
            Showing latest {data?.data.length ?? 0} executions
            {isFromCache && " (from browser cache)"}
          </span>
          <span className="font-mono opacity-50">data source: cloud.dify.ai</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
