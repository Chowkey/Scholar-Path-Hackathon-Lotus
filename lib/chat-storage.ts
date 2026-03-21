import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type StoredChatSession = {
  id: string;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  profile: unknown;
  shortlistIds: string[];
  recommendations: string[];
};

const STORAGE_DIR = path.join(process.cwd(), "data");
const STORAGE_FILE = path.join(STORAGE_DIR, "chat-sessions.json");

async function readSessions(): Promise<StoredChatSession[]> {
  try {
    const raw = await readFile(STORAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function saveChatSession(session: Omit<StoredChatSession, "id" | "createdAt">) {
  await mkdir(STORAGE_DIR, { recursive: true });

  const existing = await readSessions();
  existing.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...session,
  });

  await writeFile(STORAGE_FILE, JSON.stringify(existing, null, 2), "utf8");
}
