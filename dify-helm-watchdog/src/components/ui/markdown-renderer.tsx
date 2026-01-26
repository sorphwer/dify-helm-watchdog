"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const withClassName = (base: string, extra?: string) =>
  extra ? `${base} ${extra}` : base;

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={withClassName(
        "h-full overflow-auto custom-scrollbar",
        className,
      )}
    >
      <article className="flex w-full flex-col gap-4 px-[15px] py-6 text-sm leading-6 text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ className: headingClass, ...props }) => (
              <h1
                {...props}
                className={withClassName(
                  "mt-2 text-2xl font-semibold tracking-tight text-foreground",
                  headingClass,
                )}
              />
            ),
            h2: ({ className: headingClass, ...props }) => (
              <h2
                {...props}
                className={withClassName(
                  "mt-6 text-xl font-semibold tracking-tight text-foreground",
                  headingClass,
                )}
              />
            ),
            h3: ({ className: headingClass, ...props }) => (
              <h3
                {...props}
                className={withClassName(
                  "mt-6 text-lg font-semibold tracking-tight text-foreground",
                  headingClass,
                )}
              />
            ),
            p: ({ className: paragraphClass, ...props }) => (
              <p
                {...props}
                className={withClassName(
                  "text-sm leading-6 text-foreground/90",
                  paragraphClass,
                )}
              />
            ),
            a: ({ className: linkClass, ...props }) => (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                className={withClassName(
                  "text-primary underline underline-offset-4 transition hover:text-primary/80",
                  linkClass,
                )}
              />
            ),
            ul: ({ className: listClass, ...props }) => (
              <ul
                {...props}
                className={withClassName("ml-5 list-disc space-y-1", listClass)}
              />
            ),
            ol: ({ className: listClass, ...props }) => (
              <ol
                {...props}
                className={withClassName(
                  "ml-5 list-decimal space-y-1",
                  listClass,
                )}
              />
            ),
            li: ({ className: listItemClass, ...props }) => (
              <li
                {...props}
                className={withClassName(
                  "text-sm leading-6 text-foreground/90",
                  listItemClass,
                )}
              />
            ),
            blockquote: ({ className: quoteClass, ...props }) => (
              <blockquote
                {...props}
                className={withClassName(
                  "border-l-2 border-border pl-4 text-sm italic text-muted-foreground",
                  quoteClass,
                )}
              />
            ),
            hr: ({ className: hrClass, ...props }) => (
              <hr {...props} className={withClassName("my-6 border-border", hrClass)} />
            ),
            table: ({ className: tableClass, ...props }) => (
              <div className="overflow-auto">
                <table
                  {...props}
                  className={withClassName(
                    "w-full border-separate border-spacing-0 text-sm",
                    tableClass,
                  )}
                />
              </div>
            ),
            thead: ({ className: headClass, ...props }) => (
              <thead {...props} className={withClassName("bg-muted/40", headClass)} />
            ),
            th: ({ className: thClass, ...props }) => (
              <th
                {...props}
                className={withClassName(
                  "border border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  thClass,
                )}
              />
            ),
            td: ({ className: tdClass, ...props }) => (
              <td
                {...props}
                className={withClassName(
                  "border border-border px-3 py-2 align-top text-sm text-foreground/90",
                  tdClass,
                )}
              />
            ),
            pre: ({ className: preClass, ...props }) => (
              <pre
                {...props}
                className={withClassName(
                  "my-4 overflow-auto rounded-lg border border-border bg-card p-4 text-xs leading-5 text-foreground",
                  preClass,
                )}
              />
            ),
            code: ({ inline, className: codeClass, ...props }) => (
              <code
                {...props}
                className={withClassName(
                  inline
                    ? "rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
                    : "font-mono text-xs text-foreground",
                  codeClass,
                )}
              />
            ),
            img: ({ className: imgClass, ...props }) => (
              <img
                {...props}
                className={withClassName(
                  "max-w-full rounded-lg border border-border",
                  imgClass,
                )}
              />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
