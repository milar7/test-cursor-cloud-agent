"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Check,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Inbox,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useOptimistic, useState, useTransition } from "react";
import {
  AppSnapshot,
  createFolder,
  createTodo,
  deleteFolder,
  deleteTodo,
  getMoveTargets,
  importLegacyTodos,
  moveTodo,
  openFolder,
  renameFolder,
  toggleTodo,
  TodoDTO,
} from "@/app/actions";

type Props = {
  initial: AppSnapshot;
};

type OptimisticAction =
  | { type: "replace"; snapshot: AppSnapshot }
  | { type: "toggle"; id: string }
  | { type: "removeTodo"; id: string };

function applyOptimistic(
  state: AppSnapshot,
  action: OptimisticAction,
): AppSnapshot {
  if (action.type === "replace") return action.snapshot;
  if (action.type === "toggle") {
    return {
      ...state,
      todos: state.todos.map((t) =>
        t.id === action.id ? { ...t, done: !t.done } : t,
      ),
    };
  }
  return {
    ...state,
    todos: state.todos.filter((t) => t.id !== action.id),
  };
}

export function TodoApp({ initial }: Props) {
  const [snapshot, setSnapshot] = useState(initial);
  const [optimistic, dispatch] = useOptimistic(snapshot, applyOptimistic);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [todoText, setTodoText] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [moveMenuTodoId, setMoveMenuTodoId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<
    { id: string | null; label: string; depth: number }[]
  >([]);
  const [activeTodo, setActiveTodo] = useState<TodoDTO | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    const key = "todos-migrated-v1";
    if (typeof window === "undefined") return;
    if (localStorage.getItem(key)) return;
    try {
      const raw = localStorage.getItem("todos");
      if (!raw) {
        localStorage.setItem(key, "1");
        return;
      }
      const parsed = JSON.parse(raw) as { text: string; done: boolean }[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(key, "1");
        return;
      }
      startTransition(async () => {
        const next = await importLegacyTodos(parsed);
        setSnapshot(next);
        dispatch({ type: "replace", snapshot: next });
        localStorage.setItem(key, "1");
      });
    } catch {
      localStorage.setItem(key, "1");
    }
  }, [dispatch]);

  function run(action: () => Promise<AppSnapshot>) {
    setError(null);
    startTransition(async () => {
      try {
        const next = await action();
        setSnapshot(next);
        dispatch({ type: "replace", snapshot: next });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function navigate(folderId: string | null) {
    run(() => openFolder(folderId));
  }

  function onAddTodo(e: FormEvent) {
    e.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    setTodoText("");
    run(() => createTodo(text, optimistic.currentFolderId));
  }

  function onAddFolder(e: FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderName("");
    setShowNewFolder(false);
    run(() => createFolder(name, optimistic.currentFolderId));
  }

  function onRenameFolder(id: string) {
    const name = editName.trim();
    if (!name) return;
    setEditingFolderId(null);
    run(() => renameFolder(id, name));
  }

  async function openMoveMenu(todoId: string) {
    setMoveMenuTodoId(todoId);
    const targets = await getMoveTargets();
    setMoveTargets(targets);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTodo(null);
    const { active, over } = event;
    if (!over) return;
    const todoId = String(active.id).replace(/^todo:/, "");
    const overId = String(over.id);
    if (!overId.startsWith("drop:")) return;
    const target = overId.slice("drop:".length);
    const targetFolderId = target === "inbox" ? null : target;
    const todo = snapshot.todos.find((t) => t.id === todoId);
    if (!todo) return;
    if (todo.folderId === targetFolderId) return;
    run(() => moveTodo(todoId, targetFolderId));
  }

  const active = optimistic.todos.filter((t) => !t.done);
  const done = optimistic.todos.filter((t) => t.done);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const id = String(e.active.id).replace(/^todo:/, "");
        setActiveTodo(optimistic.todos.find((t) => t.id === id) ?? null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTodo(null)}
    >
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <Folder className="brand-icon" aria-hidden />
            <h1>Folders</h1>
          </div>
          <p className="tagline">Tasks nested like a Finder window</p>
        </header>

        <nav className="breadcrumbs" aria-label="Folder path">
          <DropCrumb
            id="drop:inbox"
            active={!optimistic.currentFolderId}
            onClick={() => navigate(null)}
            label="Inbox"
            icon={<Inbox size={16} />}
          />
          {optimistic.breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="crumb-group">
              <ChevronRight size={14} className="crumb-sep" />
              <DropCrumb
                id={`drop:${crumb.id}`}
                active={i === optimistic.breadcrumbs.length - 1}
                onClick={() => navigate(crumb.id)}
                label={crumb.name}
                icon={<Folder size={16} />}
              />
            </span>
          ))}
        </nav>

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <section className="folders-panel">
          <div className="section-head">
            <h2>Folders</h2>
            {optimistic.canCreateSubfolder ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowNewFolder((v) => !v)}
              >
                <FolderPlus size={16} />
                New folder
              </button>
            ) : (
              <span className="hint">Max depth ({optimistic.depth}/3)</span>
            )}
          </div>

          {showNewFolder && (
            <form className="inline-form" onSubmit={onAddFolder}>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                maxLength={80}
              />
              <button type="submit">Create</button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </button>
            </form>
          )}

          {optimistic.folders.length === 0 ? (
            <p className="empty-inline">No subfolders here</p>
          ) : (
            <ul className="folder-list">
              {optimistic.folders.map((folder) => (
                <li key={folder.id}>
                  <FolderDropRow
                    folder={folder}
                    editing={editingFolderId === folder.id}
                    editName={editName}
                    onEditName={setEditName}
                    onOpen={() => navigate(folder.id)}
                    onStartEdit={() => {
                      setEditingFolderId(folder.id);
                      setEditName(folder.name);
                    }}
                    onCancelEdit={() => setEditingFolderId(null)}
                    onSaveEdit={() => onRenameFolder(folder.id)}
                    onDelete={() => {
                      run(() => deleteFolder(folder.id));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="todos-panel">
          <form className="todo-form" onSubmit={onAddTodo}>
            <input
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              placeholder="Add a task in this folder…"
              maxLength={500}
            />
            <button type="submit" disabled={pending}>
              <Plus size={18} />
              Add
            </button>
          </form>

          <TodoSection
            title="To do"
            todos={active}
            empty="Nothing open in this folder"
            moveMenuTodoId={moveMenuTodoId}
            moveTargets={moveTargets}
            onToggle={(id) => {
              dispatch({ type: "toggle", id });
              run(() => toggleTodo(id));
            }}
            onDelete={(id) => {
              dispatch({ type: "removeTodo", id });
              run(() => deleteTodo(id));
            }}
            onOpenMove={openMoveMenu}
            onCloseMove={() => setMoveMenuTodoId(null)}
            onMove={(id, folderId) => {
              setMoveMenuTodoId(null);
              run(() => moveTodo(id, folderId));
            }}
          />

          <TodoSection
            title="Done"
            todos={done}
            empty="No completed tasks"
            moveMenuTodoId={moveMenuTodoId}
            moveTargets={moveTargets}
            muted
            onToggle={(id) => {
              dispatch({ type: "toggle", id });
              run(() => toggleTodo(id));
            }}
            onDelete={(id) => {
              dispatch({ type: "removeTodo", id });
              run(() => deleteTodo(id));
            }}
            onOpenMove={openMoveMenu}
            onCloseMove={() => setMoveMenuTodoId(null)}
            onMove={(id, folderId) => {
              setMoveMenuTodoId(null);
              run(() => moveTodo(id, folderId));
            }}
          />
        </section>
      </div>

      <DragOverlay>
        {activeTodo ? (
          <div className="drag-ghost">{activeTodo.text}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DropCrumb({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`crumb ${active ? "active" : ""} ${isOver ? "over" : ""}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function FolderDropRow({
  folder,
  editing,
  editName,
  onEditName,
  onOpen,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  folder: AppSnapshot["folders"][number];
  editing: boolean;
  editName: string;
  onEditName: (v: string) => void;
  onOpen: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${folder.id}` });
  const empty = folder.childCount === 0 && folder.todoCount === 0;

  if (editing) {
    return (
      <form
        className="folder-row editing"
        onSubmit={(e) => {
          e.preventDefault();
          onSaveEdit();
        }}
      >
        <Folder size={18} />
        <input
          autoFocus
          value={editName}
          onChange={(e) => onEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
          }}
        />
        <button type="submit" className="icon-btn" aria-label="Save">
          <Check size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onCancelEdit}
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </form>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`folder-row ${isOver ? "over" : ""}`}
    >
      <button type="button" className="folder-main" onClick={onOpen}>
        <Folder size={18} />
        <span className="folder-name">{folder.name}</span>
        <span className="folder-meta">
          {folder.childCount > 0 && `${folder.childCount} folders`}
          {folder.childCount > 0 && folder.todoCount > 0 && " · "}
          {folder.todoCount > 0 && `${folder.todoCount} tasks`}
          {empty && "Empty"}
        </span>
        <ChevronRight size={16} className="chev" />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onStartEdit}
        aria-label="Rename folder"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        className="icon-btn danger"
        onClick={onDelete}
        aria-label="Delete folder"
        title={empty ? "Delete folder" : "Folder must be empty to delete"}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function TodoSection({
  title,
  todos,
  empty,
  muted,
  moveMenuTodoId,
  moveTargets,
  onToggle,
  onDelete,
  onOpenMove,
  onCloseMove,
  onMove,
}: {
  title: string;
  todos: TodoDTO[];
  empty: string;
  muted?: boolean;
  moveMenuTodoId: string | null;
  moveTargets: { id: string | null; label: string; depth: number }[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMove: (id: string) => void;
  onCloseMove: () => void;
  onMove: (id: string, folderId: string | null) => void;
}) {
  return (
    <div className={`todo-section ${muted ? "muted" : ""}`}>
      <h2>
        {title}
        <span className="count">{todos.length}</span>
      </h2>
      {todos.length === 0 ? (
        <p className="empty-inline">{empty}</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              moveOpen={moveMenuTodoId === todo.id}
              moveTargets={moveTargets}
              onToggle={() => onToggle(todo.id)}
              onDelete={() => onDelete(todo.id)}
              onOpenMove={() => onOpenMove(todo.id)}
              onCloseMove={onCloseMove}
              onMove={(folderId) => onMove(todo.id, folderId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  moveOpen,
  moveTargets,
  onToggle,
  onDelete,
  onOpenMove,
  onCloseMove,
  onMove,
}: {
  todo: TodoDTO;
  moveOpen: boolean;
  moveTargets: { id: string | null; label: string; depth: number }[];
  onToggle: () => void;
  onDelete: () => void;
  onOpenMove: () => void;
  onCloseMove: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `todo:${todo.id}` });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.4 : 1,
      }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`todo-row ${todo.done ? "done" : ""}`}
    >
      <button
        type="button"
        className="grip"
        aria-label="Drag to move"
        {...listeners}
        {...attributes}
      >
        <GripVertical size={16} />
      </button>
      <button type="button" className="todo-text" onClick={onToggle}>
        {todo.text}
      </button>
      <div className="todo-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenMove}
          aria-label="Move to folder"
          title="Move to folder"
        >
          <FolderInput size={15} />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={onDelete}
          aria-label="Delete task"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {moveOpen && (
        <div className="move-menu">
          <div className="move-menu-head">
            <span>Move to</span>
            <button type="button" className="icon-btn" onClick={onCloseMove}>
              <X size={14} />
            </button>
          </div>
          <ul>
            {moveTargets
              .filter((t) => t.id !== todo.folderId)
              .map((t) => (
                <li key={t.id ?? "inbox"}>
                  <button type="button" onClick={() => onMove(t.id)}>
                    {t.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </li>
  );
}
