import { VersionExplorer } from "@/components/version-explorer";
import { loadCache } from "@/lib/helm";

// Revalidate every 24 hours (aligned with daily cron schedule)
// This enables ISR (Incremental Static Regeneration) for optimal performance
export const revalidate = 86400;

export default async function Home() {
  const cache = await loadCache();

  return (
    <main className="relative z-10 flex h-[100vh] w-full">
      <VersionExplorer data={cache} />
    </main>
  );
}
