import { query } from '../db.js';

interface FunctionRow {
  schema: string;
  name: string;
  arguments: string;
  return_type: string;
  source: string;
  language: string;
  volatility: string;
  description: string | null;
}

const SQL = `
SELECT
  n.nspname AS schema,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  t.typname AS return_type,
  p.prosrc AS source,
  l.lanname AS language,
  p.provolatile AS volatility,
  obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_type t ON t.oid = p.prorettype
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;
`;

export async function functionsResource(uri: URL) {
  try {
    const result = await query<FunctionRow>(SQL);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result.rows, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
    };
  }
}
