import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveSqliteUrl(raw: string): string {
  const withoutScheme = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (path.isAbsolute(withoutScheme)) {
    return `file:${withoutScheme}`;
  }
  return `file:${path.resolve(process.cwd(), withoutScheme)}`;
}

function createPrismaClient() {
  const url = resolveSqliteUrl(process.env.DATABASE_URL ?? "file:./prisma/dev.db");
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
