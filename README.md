# Folders Todo

Next.js todo app with Finder-style nested folders (max depth 3) and a local SQLite database via Prisma.

## Features

- Inbox for tasks with no folder (`folderId = null`)
- Nested folders up to 3 levels with breadcrumbs
- Drill into folders (Finder-like picker)
- Inline create / rename / delete folders (delete blocked until empty)
- Todos split into **To do** and **Done**
- Move tasks via drag-and-drop or an explicit move menu
- Remembers last opened folder
- One-time import of legacy `localStorage` todos into Inbox

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000). SQLite file: `prisma/dev.db`.
