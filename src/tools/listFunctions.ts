import { z } from 'zod';
import { query } from '../db.js';

export const listFunctionsSchema = {
  schema: z.string().optional(),
  name_filter: z.string().optional().describe('Filtro parcial por nome (ILIKE)'),
};

interface FunctionRow {
  schema: string;
  name: string;
  arguments: string;
  return_type: string;
  language: string;
  description: string | null;
}

export async function listFunctionsHandler(args: { schema?: string; name_filter?: string }) {
  try {
    const conditions: string[] = [`n.nspname NOT IN ('pg_catalog', 'information_schema')`];
    const params: unknown[] = [];

    if (args.schema) {
      params.push(args.schema);
      conditions.push(`n.nspname = $${params.length}`);
    }
    if (args.name_filter) {
      params.push(`%${args.name_filter}%`);
      conditions.push(`p.proname ILIKE $${params.length}`);
    }

    const sql = `
      SELECT
        n.nspname AS schema,
        p.proname AS name,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        t.typname AS return_type,
        l.lanname AS language,
        obj_description(p.oid, 'pg_proc') AS description
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
      JOIN pg_language l ON l.oid = p.prolang
      WHERE ${conditions.join(' AND ')}
      ORDER BY n.nspname, p.proname;
    `;

    const result = await query<FunctionRow>(sql, params);
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
