"use client";

import { useCallback, useMemo, useState } from "react";
import { Highlight, Language, themes } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";
import { useTheme } from "next-themes";

interface CodeBlockProps {
  value: string;
  language?: string;
  label?: string;
  version?: string;
  className?: string;
}

const supportedLanguages = new Set<Language>([
  "yaml",
  "json",
  "bash",
  "shell",
  "javascript",
  "typescript",
]);

export function CodeBlock({
  value,
  language = "yaml",
  label,
  version,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();

  const highlightLanguage = useMemo<Language>(() => {
    if (supportedLanguages.has(language as Language)) {
      return language as Language;
    }

    return "yaml";
  }, [language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Failed to copy to clipboard", error);
    }
  }, [value]);

  return (
    <div
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-muted ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <span>
          {label ?? language}
          {version && <span className="ml-2">v{version}</span>}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-full border border-border bg-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-accent hover:bg-accent/10 hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <Highlight
        theme={
          resolvedTheme === "dark"
            ? {
                ...themes.vsDark,
                plain: {
                  ...themes.vsDark.plain,
                  backgroundColor: "transparent",
                  color: "oklch(95% 0 0)",
                },
              }
            : {
                ...themes.vsLight,
                plain: {
                  ...themes.vsLight.plain,
                  backgroundColor: "transparent",
                  color: "oklch(15% 0 0)",
                },
              }
        }
        language={highlightLanguage}
        code={value}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} custom-scrollbar flex-1 overflow-auto p-4 text-sm leading-relaxed`}
            style={{ 
              ...style, 
              backgroundColor: "transparent",
              background: "transparent",
            }}
          >
            <code className="font-mono text-[13px]" style={{ background: "transparent", backgroundColor: "transparent" }}>
              {tokens.map((line, lineIndex) => (
                <div key={lineIndex} {...getLineProps({ line })} style={{ background: "transparent" }}>
                  {line.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      {...getTokenProps({ token })}
                      className="text-[13px] leading-6"
                    />
                  ))}
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}
