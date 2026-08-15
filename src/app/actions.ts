"use server";

import { revalidatePath } from "next/cache";
import {
  assertCanCreateChild,
  getBreadcrumb,
  getFolderDepth,
  MAX_FOLDER_DEPTH,
} from "@/lib/folders";
import { prisma } from "@/lib/prisma";

export type FolderDTO = {
  id: string;
  name: string;
  parentId: string | null;
  childCount: number;
  todoCount: number;
  canNest: boolean;
};

export type TodoDTO = {
  id: string;
  text: string;
  done: boolean;
  folderId: string | null;
  position: number;
};

export type AppSnapshot = {
  currentFolderId: string | null;
  breadcrumbs: { id: string; name: string }[];
  folders: FolderDTO[];
  todos: TodoDTO[];
  depth: number;
  canCreateSubfolder: boolean;
};

async function ensureAppState() {
  await prisma.appState.upsert({
    where: { id: 1 },
    create: { id: 1, lastOpenedFolderId: null },
    update: {},
  });
}

export async function getSnapshot(
  folderId?: string | null,
): Promise<AppSnapshot> {
  await ensureAppState();

  const state = await prisma.appState.findUniqueOrThrow({ where: { id: 1 } });
  let currentFolderId =
    folderId === undefined ? state.lastOpenedFolderId : folderId;

  if (currentFolderId) {
    const exists = await prisma.folder.findUnique({
      where: { id: currentFolderId },
      select: { id: true },
    });
    if (!exists) currentFolderId = null;
  }

  const [folders, todos, breadcrumbs, depth] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: currentFolderId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { children: true, todos: true } },
      },
    }),
    prisma.todo.findMany({
      where: { folderId: currentFolderId },
      orderBy: [{ done: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    }),
    getBreadcrumb(currentFolderId),
    getFolderDepth(currentFolderId),
  ]);

  return {
    currentFolderId,
    breadcrumbs,
    depth,
    canCreateSubfolder: depth < MAX_FOLDER_DEPTH,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      childCount: f._count.children,
      todoCount: f._count.todos,
      canNest: depth + 1 < MAX_FOLDER_DEPTH,
    })),
    todos: todos.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      folderId: t.folderId,
      position: t.position,
    })),
  };
}

export async function openFolder(folderId: string | null) {
  await ensureAppState();

  if (folderId) {
    const exists = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true },
    });
    if (!exists) throw new Error("Folder not found");
  }

  await prisma.appState.update({
    where: { id: 1 },
    data: { lastOpenedFolderId: folderId },
  });

  revalidatePath("/");
  return getSnapshot(folderId);
}

export async function createFolder(name: string, parentId: string | null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  await assertCanCreateChild(parentId);

  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error("Parent folder not found");
  }

  await prisma.folder.create({
    data: { name: trimmed, parentId },
  });

  revalidatePath("/");
  return getSnapshot(parentId);
}

export async function renameFolder(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  const folder = await prisma.folder.findUnique({ where: { id } });
  if (!folder) throw new Error("Folder not found");

  await prisma.folder.update({
    where: { id },
    data: { name: trimmed },
  });

  revalidatePath("/");
  return getSnapshot(folder.parentId);
}

export async function deleteFolder(id: string) {
  const folder = await prisma.folder.findUnique({
    where: { id },
    include: { _count: { select: { children: true, todos: true } } },
  });
  if (!folder) throw new Error("Folder not found");

  if (folder._count.children > 0 || folder._count.todos > 0) {
    throw new Error(
      "Folder is not empty. Move or delete its contents first.",
    );
  }

  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (state?.lastOpenedFolderId === id) {
    await prisma.appState.update({
      where: { id: 1 },
      data: { lastOpenedFolderId: folder.parentId },
    });
  }

  await prisma.folder.delete({ where: { id } });

  revalidatePath("/");
  return getSnapshot(folder.parentId);
}

export async function createTodo(text: string, folderId: string | null) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Task text is required");

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new Error("Folder not found");
  }

  const max = await prisma.todo.aggregate({
    where: { folderId, done: false },
    _max: { position: true },
  });

  await prisma.todo.create({
    data: {
      text: trimmed,
      folderId,
      position: (max._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/");
  return getSnapshot(folderId);
}

export async function toggleTodo(id: string) {
  const todo = await prisma.todo.findUnique({ where: { id } });
  if (!todo) throw new Error("Todo not found");

  await prisma.todo.update({
    where: { id },
    data: { done: !todo.done },
  });

  revalidatePath("/");
  return getSnapshot(todo.folderId);
}

export async function deleteTodo(id: string) {
  const todo = await prisma.todo.findUnique({ where: { id } });
  if (!todo) throw new Error("Todo not found");

  await prisma.todo.delete({ where: { id } });

  revalidatePath("/");
  return getSnapshot(todo.folderId);
}

export async function moveTodo(id: string, targetFolderId: string | null) {
  const todo = await prisma.todo.findUnique({ where: { id } });
  if (!todo) throw new Error("Todo not found");

  if (targetFolderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: targetFolderId },
    });
    if (!folder) throw new Error("Target folder not found");
  }

  if (todo.folderId === targetFolderId) {
    return getSnapshot(todo.folderId);
  }

  const max = await prisma.todo.aggregate({
    where: { folderId: targetFolderId, done: false },
    _max: { position: true },
  });

  await prisma.todo.update({
    where: { id },
    data: {
      folderId: targetFolderId,
      position: (max._max.position ?? -1) + 1,
      done: false,
    },
  });

  revalidatePath("/");
  return getSnapshot(todo.folderId);
}

export async function getMoveTargets(excludeFolderId?: string | null) {
  const folders = await prisma.folder.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true },
  });

  const byParent = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }

  const options: { id: string | null; label: string; depth: number }[] = [
    { id: null, label: "Inbox", depth: 0 },
  ];

  function walk(parentId: string | null, depth: number, prefix: string) {
    const kids = byParent.get(parentId) ?? [];
    for (const kid of kids) {
      if (kid.id === excludeFolderId) continue;
      const label = prefix ? `${prefix} / ${kid.name}` : kid.name;
      options.push({ id: kid.id, label, depth });
      walk(kid.id, depth + 1, label);
    }
  }

  walk(null, 1, "");
  return options;
}

export async function importLegacyTodos(
  items: { text: string; done: boolean }[],
) {
  if (!items.length) return getSnapshot(null);

  const max = await prisma.todo.aggregate({
    where: { folderId: null },
    _max: { position: true },
  });

  let position = (max._max.position ?? -1) + 1;
  await prisma.todo.createMany({
    data: items
      .filter((i) => i.text?.trim())
      .map((i) => ({
        text: i.text.trim(),
        done: Boolean(i.done),
        folderId: null,
        position: position++,
      })),
  });

  revalidatePath("/");
  return getSnapshot(null);
}
