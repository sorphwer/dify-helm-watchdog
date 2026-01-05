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

// MCP configuration for Dify SSE plugin
const getMcpConfig = () => {
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://dify-helm-watchdog.vercel.app";

  return {
    "dify-helm-watchdog": {
      url: `${baseUrl}/api/v1/sse`,
      headers: {},
      timeout: 60,
      sse_read_timeout: 300,
    },
  };
};

export default function McpConfigModal({
  open,
  onOpenChange,
}: McpConfigModalProps) {
  const [copied, setCopied] = useState(false);

  const config = getMcpConfig();
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
            Use this configuration with Dify MCP SSE plugin or other MCP-compatible clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Configuration JSON */}
          <div className="relative">
            <pre className="custom-scrollbar overflow-auto rounded-lg border border-border bg-muted/50 p-4 text-xs font-mono leading-relaxed max-h-[300px]">
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

          {/* Endpoints info */}
          <div className="space-y-2 text-sm">
            <h4 className="font-medium text-foreground">Available Endpoints</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/v1/sse</code>
                <span>— SSE Transport</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/v1/mcp</code>
                <span>— Streamable HTTP</span>
              </li>
            </ul>
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

