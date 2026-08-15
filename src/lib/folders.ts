import { prisma } from "@/lib/prisma";

export const MAX_FOLDER_DEPTH = 3;

/** Depth of a folder: root = 1, nested up to MAX_FOLDER_DEPTH. */
export async function getFolderDepth(folderId: string | null): Promise<number> {
  if (!folderId) return 0;

  let depth = 0;
  let currentId: string | null = folderId;

  while (currentId) {
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH + 1) {
      throw new Error("Folder hierarchy exceeds maximum depth");
    }
    const folder: { parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    if (!folder) throw new Error("Folder not found");
    currentId = folder.parentId;
  }

  return depth;
}

export async function assertCanCreateChild(
  parentId: string | null,
): Promise<void> {
  const parentDepth = await getFolderDepth(parentId);
  if (parentDepth >= MAX_FOLDER_DEPTH) {
    throw new Error(
      `Folders can only nest ${MAX_FOLDER_DEPTH} levels deep`,
    );
  }
}

export async function getBreadcrumb(
  folderId: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];

  const crumbs: { id: string; name: string }[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    crumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }

  return crumbs;
}
