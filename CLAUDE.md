# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server directly via `tsx` (no build step).
- `npm run build` — compile TypeScript to `dist/` (uses `tsc`, output is ESM Node16).
- `npm start` — run the compiled server from `dist/index.js`.

There is no test runner, linter, or formatter configured.

`DATABASE_URL` must be set (via `.env` or the env block of the MCP client config) — `src/db.ts` throws on import if it is missing, so any `node`/`tsx` invocation of `src/index.ts` will fail without it.

The server speaks MCP over **stdio**, so all logs go to `stderr` (prefixed `[postgres-mcp]`); stdout is reserved for the protocol. Don't add `console.log` calls.

## Architecture

MCP server (`@modelcontextprotocol/sdk`) that exposes a PostgreSQL database as **resources** (read-only introspection) and **tools** (parameterized actions).

- `src/index.ts` — entrypoint. Probes the DB with `SELECT 1`, then registers every resource and tool on a single `McpServer` and connects a `StdioServerTransport`. Adding a new capability means importing it here and calling `server.resource(...)` or `server.tool(...)`.
- `src/db.ts` — singleton `pg.Pool` built from `DATABASE_URL`, plus a typed `query()` helper. All resources/tools import `pool` from here.
- `src/resources/` — one file per resource URI (`postgres://schema`, `relations`, `indexes`, `functions`). Each exports a handler returning `{ contents: [...] }`. All introspection queries exclude `pg_catalog` and `information_schema`.
- `src/tools/` — one file per tool, each exporting `<name>Schema` (Zod shape) and `<name>Handler`. Handlers return `{ content: [{ type: 'text', text }] }` or `{ isError: true, content: [...] }` on failure.

### Safety model (do not weaken)

- `execute_query` rejects anything not starting with `SELECT` or `WITH`, runs inside `BEGIN READ ONLY` + `ROLLBACK`, and auto-appends `LIMIT 500` if no LIMIT is present.
- `explain_query` (when `analyze: true`) also runs inside a transaction with `ROLLBACK`.
- `create_function` only **validates and prepares** a `CREATE OR REPLACE FUNCTION` definition — it does **not** touch the database. The actual write is performed by `apply_function`, which is intentionally scoped to `CREATE OR REPLACE FUNCTION` and must not be generalized into a generic DDL/DML runner.

### Explicit-consent tools (do not call unprompted)

Some tools mutate the database or have side effects beyond read-only introspection. The MCP server does **not** enforce gating on these — enforcement lives in the client. The convention is: an LLM client (Claude or otherwise) must only invoke these tools when the user explicitly asks for the action in the current turn. Preparing, suggesting, or "dry-running" is fine; applying is not, unless the user said so.

Current explicit-consent tools:

- `apply_function` — writes the function definition to the database. Use `create_function` to prepare/show the definition; only call `apply_function` when the user explicitly asks to apply/send/save it.

When adding any new tool that writes to the database, sends external requests, or otherwise has user-visible side effects:

1. Mark it clearly in the tool description in `src/index.ts` (e.g. "APENAS deve ser chamada quando o utilizador pedir explicitamente ...").
2. Add it to the list above.
3. Prefer splitting prepare/apply into two tools so the prepare step stays freely callable.

### Conventions

- ESM with Node16 resolution: relative imports inside `src/` must use the `.js` extension (e.g. `import { pool } from './db.js'`), even though the source files are `.ts`.
- Tool/resource descriptions in `src/index.ts` are written in Portuguese; keep that style when adding new ones.
- Tool handlers should catch errors and return `{ isError: true, ... }` rather than throwing, so the MCP client surfaces a readable message.
