"use client";

import { useCallback, useMemo, useState } from "react";
import { Highlight, Language, themes } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";

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
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/80 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted">
        <span>
          {label ?? language}
          {version && <span className="ml-2">v{version}</span>}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-full border border-white/12 bg-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-white/40 hover:bg-white/10 hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-accent" />
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
        theme={{
          ...themes.vsDark,
          plain: {
            ...themes.vsDark.plain,
            backgroundColor: "rgba(0, 0, 0, 0)",
            color: "#f5f5f5",
          },
        }}
        language={highlightLanguage}
        code={value}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} custom-scrollbar flex-1 overflow-auto bg-black/70 p-4 text-sm leading-relaxed`}
            style={style}
          >
            <code className="font-mono text-[13px]">
              {tokens.map((line, lineIndex) => (
                <div key={lineIndex} {...getLineProps({ line })}>
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
