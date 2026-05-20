import { z } from 'zod';
import { query } from '../db.js';

export const getFunctionSchema = {
  name: z.string(),
  schema: z.string().default('public'),
};

interface FunctionDefRow {
  schema: string;
  name: string;
  arguments: string;
  return_type: string;
  language: string;
  volatility: string;
  description: string | null;
  definition: string;
}

const SQL = `
SELECT
  n.nspname AS schema,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
    ELSE p.provolatile::text
  END AS volatility,
  obj_description(p.oid, 'pg_proc') AS description,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = $1 AND p.proname = $2;
`;

export async function getFunctionHandler(args: { name: string; schema?: string }) {
  try {
    const schema = args.schema ?? 'public';
    const result = await query<FunctionDefRow>(SQL, [schema, args.name]);

    if (result.rows.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Function "${schema}.${args.name}" not found`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result.rows, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
    };
  }
}
