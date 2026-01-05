"use client";

import { useState, useCallback } from "react";
import { Check, Copy, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface McpConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConfigType = "sse" | "http";

// MCP configuration generators
const getBaseUrl = () =>
  typeof window !== "undefined"
    ? window.location.origin
    : "https://dify-helm-watchdog.vercel.app";

const getMcpConfigs = () => {
  const baseUrl = getBaseUrl();

  return {
    sse: {
      "dify-helm-watchdog": {
        url: `${baseUrl}/api/v1/sse`,
        headers: {},
        timeout: 60,
        sse_read_timeout: 300,
      },
    },
    http: {
      "dify-helm-watchdog": {
        url: `${baseUrl}/api/v1/mcp`,
        headers: {},
        timeout: 60,
      },
    },
  };
};

export default function McpConfigModal({
  open,
  onOpenChange,
}: McpConfigModalProps) {
  const [copied, setCopied] = useState(false);
  const [configType, setConfigType] = useState<ConfigType>("http");

  const configs = getMcpConfigs();
  const config = configs[configType];
  const configJson = JSON.stringify(config, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [configJson]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand" />
            MCP Configuration
          </DialogTitle>
          <DialogDescription>
            Use this configuration with Dify MCP plugin or other MCP-compatible clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transport selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfigType("sse")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                configType === "sse"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border bg-card text-muted-foreground/60 hover:bg-accent/10"
              }`}
            >
              SSE Transport
              <span className="block text-[10px] font-normal opacity-60">For persistent connections</span>
            </button>
            <button
              type="button"
              onClick={() => setConfigType("http")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                configType === "http"
                  ? "border-brand bg-brand/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/10"
              }`}
            >
              Streamable HTTP
              <span className="block text-[10px] font-normal text-brand">✓ Recommended</span>
            </button>
          </div>

          {/* Configuration JSON */}
          <div className="relative">
            <pre className="custom-scrollbar overflow-auto rounded-lg border border-border bg-muted/50 p-4 text-xs font-mono leading-relaxed max-h-[200px]">
              <code className="text-foreground">{configJson}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 h-8 gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>

          {/* Available tools */}
          <div className="space-y-2 text-sm">
            <h4 className="font-medium text-foreground">Available Tools</h4>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>• list_versions</span>
              <span>• get_latest_version</span>
              <span>• get_version_details</span>
              <span>• list_images</span>
              <span>• validate_images</span>
            </div>
          </div>

          {/* Prompts */}
          <div className="space-y-2 text-sm">
            <h4 className="font-medium text-foreground">Available Prompts</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• <code className="bg-muted px-1 py-0.5 rounded">update_enterprise_to_version</code></div>
              <div>• <code className="bg-muted px-1 py-0.5 rounded">analyze_missing_images</code></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

