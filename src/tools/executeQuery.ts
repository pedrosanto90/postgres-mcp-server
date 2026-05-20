import { z } from 'zod';
import { pool } from '../db.js';

export const executeQuerySchema = {
  query: z.string().describe('Query SQL a executar. Apenas SELECT é permitido.'),
};

const MAX_ROWS = 500;

function ensureLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;$/, '');
  if (/\blimit\s+\d+/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} LIMIT ${MAX_ROWS}`;
}

export async function executeQueryHandler(args: { query: string }) {
  const original = args.query.trim();
  const upper = original.toUpperCase();

  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: 'Error: Only SELECT (or WITH ... SELECT) queries are permitted by execute_query.',
        },
      ],
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const finalQuery = ensureLimit(original);
    const result = await client.query(finalQuery);
    await client.query('ROLLBACK');

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              row_count: result.rowCount,
              rows: result.rows,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
    };
  } finally {
    client.release();
  }
}
