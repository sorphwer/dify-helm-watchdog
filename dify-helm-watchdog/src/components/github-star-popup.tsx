"use client";

import { useEffect, useState } from "react";
import { Github, Star, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/sorphwer/dify-helm-watchdog";
const STORAGE_KEY = "helm-watchdog:star-prompt";
const SHOW_DELAY_MS = 4000;
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function GithubStarPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode / blocked) — fall through and show
    }
    if (raw === "dismissed") return;
    if (raw) {
      const until = Number(raw);
      if (Number.isFinite(until) && Date.now() < until) return;
    }
    const timer = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = (value: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore write failures
    }
  };

  const handleSnooze = () => {
    persist(String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };

  const handleStar = () => {
    persist("dismissed");
    window.open(REPO_URL, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleSnooze();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden rounded-3xl border border-white/25 bg-background/75 p-0 shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.45),inset_-1px_-1px_0_0_rgba(255,255,255,0.12),0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl backdrop-saturate-150 sm:max-w-md dark:border-white/10 dark:bg-background/65 dark:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.16),inset_-1px_-1px_0_0_rgba(255,255,255,0.04),0_24px_70px_rgba(0,0,0,0.45)]"
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.34),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(0,51,255,0.10),transparent_42%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(153,179,255,0.12),transparent_42%)]" />
        <DialogClose className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/20 text-muted-foreground shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.55),0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-[12px] transition-all hover:-translate-y-0.5 hover:bg-white/30 hover:text-foreground active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader className="relative z-10 px-6 pb-2 pt-6">
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full border border-amber-200/45 bg-amber-300/15 text-amber-400 shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.65),inset_-1px_-1px_0_0_rgba(255,255,255,0.22),0_6px_18px_rgba(245,158,11,0.18)] backdrop-blur-[14px] backdrop-saturate-150 dark:border-amber-200/20 dark:bg-amber-300/10 dark:text-amber-300 dark:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.22),0_6px_18px_rgba(245,158,11,0.22)]">
            <Star className="h-5 w-5 fill-current drop-shadow-sm" />
          </div>
          <DialogTitle className="text-balance text-xl tracking-tight">
            Enjoying Dify Helm Watchdog?
          </DialogTitle>
          <DialogDescription className="max-w-[38ch] text-pretty leading-6">
            This tool is open source and maintained in spare time. A GitHub star
            helps others discover it and keeps the daily snapshots coming.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="relative z-10 gap-2 px-6 pb-6 pt-2 sm:justify-start">
          <Button
            variant="ghost"
            onClick={handleSnooze}
            className="rounded-full border border-border/70 bg-background/35 px-4 text-muted-foreground shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.28)] backdrop-blur-[10px] transition-all hover:-translate-y-0.5 hover:bg-background/55 hover:text-foreground active:translate-y-0 active:scale-95 dark:bg-white/5 dark:hover:bg-white/10"
          >
            Maybe later
          </Button>
          <Button
            onClick={handleStar}
            className="group relative overflow-hidden rounded-full border border-white/25 bg-primary/90 px-4 text-primary-foreground shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.45),inset_-1px_-1px_0_0_rgba(0,0,0,0.16),0_8px_24px_rgba(0,51,255,0.20)] backdrop-blur-[14px] backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:bg-primary hover:shadow-[inset_1px_1px_0_0_rgba(255,255,255,0.6),inset_-1px_-1px_0_0_rgba(0,0,0,0.18),0_10px_28px_rgba(0,51,255,0.26)] active:translate-y-0 active:scale-95"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.36),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.16),transparent_50%)] opacity-80 transition-opacity group-hover:opacity-100" />
            <Github className="h-4 w-4 drop-shadow-sm" />
            <span className="drop-shadow-sm">Star on GitHub</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
