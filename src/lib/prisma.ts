import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const relative = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  const url = path.isAbsolute(relative)
    ? `file:${relative}`
    : `file:${path.join(process.cwd(), "prisma", relative)}`;

  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
