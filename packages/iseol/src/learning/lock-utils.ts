import { readFile, unlink } from "node:fs/promises";

export async function removeOwnedLearningLock(path: string, token: string): Promise<void> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { token?: unknown };
    if (value.token !== token) return;
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
  }
}
