# postgres-mcp

A TypeScript MCP (Model Context Protocol) server that connects directly to a PostgreSQL database and exposes schema introspection, read-only query execution, and function management.

## Features

### Resources (full introspection, read-only)
| URI | Description |
|---|---|
| `postgres://schema` | Tables, columns, types, defaults, nullability, and constraints |
| `postgres://relations` | Foreign keys with `update_rule` / `delete_rule` |
| `postgres://indexes` | Indexes + usage stats (`idx_scan`, `idx_tup_read`, ...) |
| `postgres://functions` | Functions with signature, language, volatility, and source code |

### Tools
| Name | Description |
|---|---|
| `get_table_details` | Columns + indexes + foreign keys (incoming and outgoing) for a single table |
| `list_functions` | Lists functions with optional `schema` and `name_filter` (ILIKE) filters |
| `get_function` | Returns the full `CREATE OR REPLACE FUNCTION ...` definition via `pg_get_functiondef` |
| `execute_query` | Runs **only SELECT/WITH** queries inside a `READ ONLY` transaction with automatic `ROLLBACK` and `LIMIT 500` |
| `explain_query` | `EXPLAIN [ANALYZE] (FORMAT JSON)` with a summary (`total_cost`, `actual_rows`, `planning_time`, `execution_time`) |
| `create_function` | Validates and **prepares** a `CREATE OR REPLACE FUNCTION ...` definition. Does **not** write to the database — returns the prepared definition for review. |
| `apply_function` | **Explicit-consent.** Executes a `CREATE OR REPLACE FUNCTION ...` against the database and returns the created function. Should only be called when the user explicitly asks to apply/send the function. |

### Safety guarantees
- `execute_query` rejects anything that does not start with `SELECT` or `WITH` and runs inside a `READ ONLY` transaction followed by `ROLLBACK`.
- `explain_query` with `analyze: true` runs inside a transaction with `ROLLBACK` — no writes are persisted.
- `create_function` only validates and prepares a definition; it does **not** touch the database. The actual write is performed by `apply_function`.
- The `pg_catalog` and `information_schema` schemas are excluded from all introspection queries.

### Explicit-consent tools

Some tools mutate the database or have side effects beyond read-only introspection. The MCP server itself does **not** enforce gating on these — enforcement lives in the LLM client. The convention is: a model must only invoke an explicit-consent tool when the user explicitly asks for that action in the current turn. Preparing, suggesting, or showing a dry-run is fine; applying is not, unless the user said so.

Currently explicit-consent:

| Tool | Effect | How to prepare without applying |
|---|---|---|
| `apply_function` | Writes a `CREATE OR REPLACE FUNCTION ...` to the database | Use `create_function` to validate and review the definition first |

When adding any new tool that writes to the database, sends external requests, or otherwise has user-visible side effects, follow the same convention: mark it clearly in the tool description in `src/index.ts`, add it to the table above, and prefer splitting prepare/apply into two tools so the prepare step stays freely callable.

---

## Installation

```bash
npm install
npm run build
```

Create a `.env` file from the example:

```bash
cp .env.example .env
# edit .env and set DATABASE_URL
```

Format:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

Verify the build:

```bash
ls dist/index.js
```

### Dev mode (no build)

```bash
npm run dev
```

---

## Usage with Claude Desktop

Claude Desktop is available only on macOS and Windows (there is no official Linux build). Edit the Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Production (after `npm run build`)

```json
{
  "mcpServers": {
    "postgres": {
      "command": "node",
      "args": ["/absolute/path/to/postgresqlMCP/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/database"
      }
    }
  }
}
```

### Dev (no build, uses tsx)

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/postgresqlMCP/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/database"
      }
    }
  }
}
```

Restart Claude Desktop after editing the file.

---

## Usage with Claude Code (CLI / IDE)

Claude Code runs on Linux, macOS, and Windows. The recommended way to register the MCP server is via the `claude mcp add` command — it writes the entry to `~/.claude.json` for you.

From any directory:

```bash
claude mcp add postgres -- node /absolute/path/to/postgresqlMCP/dist/index.js
```

To pass `DATABASE_URL` to the process:

```bash
claude mcp add postgres \
  --env DATABASE_URL=postgresql://user:password@localhost:5432/database \
  -- node /absolute/path/to/postgresqlMCP/dist/index.js
```

Dev mode (no build, uses `tsx`):

```bash
claude mcp add postgres \
  --env DATABASE_URL=postgresql://user:password@localhost:5432/database \
  -- npx tsx /absolute/path/to/postgresqlMCP/src/index.ts
```

List and inspect:

```bash
claude mcp list
claude mcp get postgres
```

After adding, restart Claude Code and the tools (`get_table_details`, `execute_query`, etc.) will be available automatically. If you prefer editing the config file directly, MCP servers live under the `mcpServers` key in `~/.claude.json` (same path on Linux, macOS, and Windows).

---

## Usage with Codex (OpenAI Codex CLI)

The Codex CLI loads MCP servers from `~/.codex/config.toml`. Add a `mcp_servers.postgres` entry:

```toml
[mcp_servers.postgres]
command = "node"
args = ["/home/pedro/Documents/projects/postgresqlMCP/dist/index.js"]
env = { DATABASE_URL = "postgresql://user:password@localhost:5432/database" }
```

Dev mode (no build):

```toml
[mcp_servers.postgres]
command = "npx"
args = ["tsx", "/home/pedro/Documents/projects/postgresqlMCP/src/index.ts"]
env = { DATABASE_URL = "postgresql://user:password@localhost:5432/database" }
```

Restart Codex and the tools will appear as `postgres.get_table_details`, `postgres.execute_query`, etc.

---

## Usage examples

In a conversation with the model you can ask things like:

- *"Read the `postgres://schema` resource and tell me which tables exist."*
- *"Use `get_table_details` on the `orders` table."*
- *"List all functions in the `billing` schema whose name contains `invoice`."*
- *"Show the definition of the `public.calculate_total` function."*
- *"Run `SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'`."*
- *"`EXPLAIN ANALYZE` this query: `SELECT ...`."*
- *"Prepare the function `CREATE OR REPLACE FUNCTION public.foo(...) RETURNS ... AS $$ ... $$ LANGUAGE plpgsql;`."* — runs `create_function` (validates only).
- *"Apply that function to the database."* — explicit consent: runs `apply_function`.

---

## Project structure

```
src/
├── index.ts                 # Entrypoint + resource and tool registration
├── db.ts                    # pg pool singleton + typed query()
├── resources/
│   ├── schema.ts
│   ├── relations.ts
│   ├── indexes.ts
│   └── functions.ts
└── tools/
    ├── getTableDetails.ts
    ├── listFunctions.ts
    ├── getFunction.ts
    ├── executeQuery.ts
    ├── explainQuery.ts
    ├── createFunction.ts
    └── applyFunction.ts
```

## Troubleshooting

- **"DATABASE_URL environment variable is required"** — set the variable in `.env` or in the `env` block of your MCP client config.
- **"Failed to connect to database"** — verify host/port/credentials and that the database accepts connections from your machine (`pg_hba.conf`, firewall).
- **`execute_query` rejects a valid query** — only queries starting with `SELECT` or `WITH` are accepted. For anything else (DDL, DML), use `create_function` + `apply_function` (functions only) or another tool.
- **Server logs** — the server writes to `stderr` (`[postgres-mcp] ...`); in Claude Code they show up via `claude mcp logs postgres` or in the Claude Desktop logs.
