import { revalidatePath } from "next/cache";
import {
  MissingBlobTokenError,
  type SyncResult,
  syncHelmData,
} from "@/lib/helm";

export const runtime = "nodejs";

const createStreamResponse = () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (message: string) =>
        controller.enqueue(encoder.encode(`${message}\n`));

      write("== dify-helm-watchdog cron =="); // banner

      let statusLine = "[status] ok";

      try {
        let syncResult: SyncResult | null = null;
        syncResult = await syncHelmData({
          log: (message) => write(`[sync] ${message}`),
        });

        write(
          `[result] processed=${syncResult.processed} created=${syncResult.created} skipped=${syncResult.skipped}`,
        );
        if (syncResult.versions.length > 0) {
          write(
            `[result] new_versions=${syncResult.versions
              .map((version) => `v${version}`)
              .join(", ")}`,
          );
        } else {
          write("[result] no new versions detected");
        }
        write(`[result] lastUpdated=${syncResult.lastUpdated}`);

        // Trigger ISR revalidation to rebuild the homepage with fresh data
        write("[revalidate] Triggering ISR revalidation for homepage...");
        try {
          revalidatePath("/", "page");
          write("[revalidate] Successfully triggered revalidation");
        } catch (revalError) {
          write(
            `[revalidate] Warning: Failed to trigger revalidation - ${revalError instanceof Error ? revalError.message : "unknown error"}`,
          );
        }
      } catch (error) {
        statusLine = "[status] failed";

        if (error instanceof MissingBlobTokenError) {
          write(`[error] ${error.message}`);
        } else if (error instanceof Error) {
          write(`[error] ${error.message}`);
        } else {
          write("[error] Unknown error occurred while syncing Helm data.");
        }

        console.error("[cron] unexpected error", error);
      } finally {
        write(statusLine);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export async function GET() {
  return createStreamResponse();
}

export async function POST() {
  return createStreamResponse();
}
