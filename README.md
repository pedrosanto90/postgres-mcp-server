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
| `create_function` | Executes `CREATE OR REPLACE FUNCTION ...` and returns the created function as confirmation |

### Safety guarantees
- `execute_query` rejects anything that does not start with `SELECT` or `WITH` and runs inside a `READ ONLY` transaction followed by `ROLLBACK`.
- `explain_query` with `analyze: true` runs inside a transaction with `ROLLBACK` — no writes are persisted.
- The `pg_catalog` and `information_schema` schemas are excluded from all introspection queries.

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

## Usage with Claude Desktop / Claude Code

Edit the Claude config file:

- **Linux:** `~/.config/Claude/claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Production (after `npm run build`)

```json
{
  "mcpServers": {
    "postgres": {
      "command": "node",
      "args": ["/home/pedro/Documents/projects/postgresqlMCP/dist/index.js"],
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
      "args": ["tsx", "/home/pedro/Documents/projects/postgresqlMCP/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/database"
      }
    }
  }
}
```

### Claude Code (CLI) — per-project registration

From the project directory where you want to use the MCP server:

```bash
claude mcp add postgres -- node /home/pedro/Documents/projects/postgresqlMCP/dist/index.js
```

To pass `DATABASE_URL` to the process:

```bash
claude mcp add postgres \
  --env DATABASE_URL=postgresql://user:password@localhost:5432/database \
  -- node /home/pedro/Documents/projects/postgresqlMCP/dist/index.js
```

List and inspect:

```bash
claude mcp list
claude mcp get postgres
```

After adding, restart Claude Code and the tools (`get_table_details`, `execute_query`, etc.) will be available automatically.

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
- *"Create the function `CREATE OR REPLACE FUNCTION public.foo(...) RETURNS ... AS $$ ... $$ LANGUAGE plpgsql;`."*

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
    └── createFunction.ts
```

## Troubleshooting

- **"DATABASE_URL environment variable is required"** — set the variable in `.env` or in the `env` block of your MCP client config.
- **"Failed to connect to database"** — verify host/port/credentials and that the database accepts connections from your machine (`pg_hba.conf`, firewall).
- **`execute_query` rejects a valid query** — only queries starting with `SELECT` or `WITH` are accepted. For anything else (DDL, DML), use `create_function` (functions only) or another tool.
- **Server logs** — the server writes to `stderr` (`[postgres-mcp] ...`); in Claude Code they show up via `claude mcp logs postgres` or in the Claude Desktop logs.
