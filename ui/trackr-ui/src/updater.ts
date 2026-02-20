import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "downloading"; progress: number }
  | { state: "ready" }
  | { state: "up-to-date" }
  | { state: "error"; message: string };

export async function checkForUpdate(
  onStatus: (status: UpdateStatus) => void
): Promise<void> {
  onStatus({ state: "checking" });

  try {
    const update = await check();

    if (!update) {
      onStatus({ state: "up-to-date" });
      return;
    }

    onStatus({ state: "available", version: update.version });

    let totalBytes = 0;
    let downloadedBytes = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started" && event.data.contentLength) {
        totalBytes = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        const progress = totalBytes > 0 ? downloadedBytes / totalBytes : 0;
        onStatus({ state: "downloading", progress });
      } else if (event.event === "Finished") {
        onStatus({ state: "ready" });
      }
    });

    await relaunch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatus({ state: "error", message });
  }
}
