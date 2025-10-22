import { VersionExplorer } from "@/components/version-explorer";
import { loadCache } from "@/lib/helm";

// Revalidate every 24 hours (aligned with daily cron schedule)
// This enables ISR (Incremental Static Regeneration) for optimal performance
// Combined with on-demand revalidation from cron job for immediate updates
export const revalidate = 86400; // 24 hours

export default async function Home() {
  const cache = await loadCache();

  return (
    <main className="relative z-10 flex h-[100vh] w-full">
      <VersionExplorer data={cache} />
    </main>
  );
}
