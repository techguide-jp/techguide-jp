import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { env } from "$lib/server/env";
import type { NotificationType } from "$lib/server/notifications/notificationTypes";

export type EmailPreviewMetadata = {
  id: string;
  createdAt: string;
  type: NotificationType;
  month: string;
  assigneeLogin: string;
  recipientLogin: string;
  recipientEmail: string | null;
  subject: string;
};

const baseDirectory = (): string => path.resolve(env.emailPreviewDir);

export const saveEmailPreview = async (input: {
  metadata: Omit<EmailPreviewMetadata, "id" | "createdAt">;
  text: string;
  html: string;
}): Promise<void> => {
  const id = `${Date.now()}-${randomUUID()}`;
  const directory = path.join(baseDirectory(), id);
  await mkdir(directory, { recursive: true });
  const metadata: EmailPreviewMetadata = {
    ...input.metadata,
    id,
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    writeFile(
      path.join(directory, "metadata.json"),
      JSON.stringify(metadata, null, 2),
    ),
    writeFile(path.join(directory, "message.txt"), input.text),
    writeFile(path.join(directory, "message.html"), input.html),
  ]);
};

export const listEmailPreviews = async (): Promise<EmailPreviewMetadata[]> => {
  try {
    const entries = await readdir(baseDirectory(), { withFileTypes: true });
    const previews = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return JSON.parse(
              await readFile(
                path.join(baseDirectory(), entry.name, "metadata.json"),
                "utf8",
              ),
            ) as EmailPreviewMetadata;
          } catch {
            return null;
          }
        }),
    );
    return previews
      .filter((entry): entry is EmailPreviewMetadata => entry !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

export const getEmailPreview = async (id: string) => {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    const directory = path.join(baseDirectory(), id);
    const [metadata, text, html] = await Promise.all([
      readFile(path.join(directory, "metadata.json"), "utf8"),
      readFile(path.join(directory, "message.txt"), "utf8"),
      readFile(path.join(directory, "message.html"), "utf8"),
    ]);
    return {
      metadata: JSON.parse(metadata) as EmailPreviewMetadata,
      text,
      html,
    };
  } catch {
    return null;
  }
};

export const cleanupEmailPreviews = async (maxAgeDays = 30, maxCount = 200) => {
  const previews = await listEmailPreviews();
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const targets = previews.filter(
    (preview, index) =>
      index >= maxCount || new Date(preview.createdAt).getTime() < cutoff,
  );
  await Promise.all(
    targets.map(async (preview) => {
      const target = path.join(baseDirectory(), preview.id);
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) await rm(target, { recursive: true });
    }),
  );
  return targets.length;
};
