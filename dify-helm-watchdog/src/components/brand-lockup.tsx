import Image from "next/image";
import Link from "next/link";

const familySites = [
  {
    label: "Dify EE Release",
    href: "https://ee.langgenius.workers.dev/",
  },
  {
    label: "Dify EE Helm",
    href: "https://langgenius.github.io/dify-helm/#/",
  },
] as const;

function ExternalArrowIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="h-3 w-3 shrink-0 opacity-55 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100"
      fill="none"
    >
      <path
        d="M3 9L9 3M4.25 3H9V7.75"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:gap-x-4">
      <Link
        href="/"
        aria-label="helm-watchdog home"
        className="inline-flex max-w-full items-center gap-[7px] no-underline transition-opacity hover:opacity-90"
      >
        <span className="relative flex h-[21px] w-[48px] shrink-0 items-center">
          <Image
            src="/images/logo-light.svg"
            alt="Dify logo"
            width={59}
            height={26}
            priority
            className="h-full w-full object-contain dark:hidden"
          />
          <Image
            src="/images/logo-dark.svg"
            alt="Dify logo"
            width={48}
            height={22}
            priority
            className="hidden h-full w-full object-contain dark:block"
          />
        </span>
        <span
          aria-hidden="true"
          className="text-[16px] leading-[1.4] text-muted-foreground/60"
        >
          /
        </span>
        <span className="pt-px text-[12px] font-semibold uppercase leading-none tracking-[0.05em] text-muted-foreground">
          helm-watchdog
        </span>
      </Link>

      <nav
        aria-label="Family sites"
        className="inline-flex w-fit flex-wrap items-center gap-0.5 rounded-[11px] border border-border/65 bg-card/55 p-[3px] text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:ml-1 md:text-[12px]"
      >
        {familySites.map((site) => (
          <a
            key={site.label}
            href={site.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-muted-foreground no-underline transition-[color,background-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:bg-accent/8 hover:text-foreground"
          >
            <span className="font-medium tracking-[0.01em]">{site.label}</span>
            <ExternalArrowIcon />
          </a>
        ))}
      </nav>
    </div>
  );
}
