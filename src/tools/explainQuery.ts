import { z } from 'zod';
import { pool } from '../db.js';

export const explainQuerySchema = {
  query: z.string(),
  analyze: z
    .boolean()
    .default(false)
    .describe('Se true, executa EXPLAIN ANALYZE (executa a query de facto)'),
};

interface PlanNode {
  'Total Cost'?: number;
  'Actual Rows'?: number;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainRow {
  Plan: PlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

export async function explainQueryHandler(args: { query: string; analyze?: boolean }) {
  const analyze = args.analyze ?? false;
  const cleaned = args.query.trim().replace(/;$/, '');
  const prefix = analyze ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)' : 'EXPLAIN (FORMAT JSON)';
  const explainSql = `${prefix} ${cleaned}`;

  const client = await pool.connect();
  try {
    if (analyze) {
      await client.query('BEGIN');
    }
    const result = await client.query<{ 'QUERY PLAN': ExplainRow[] }>(explainSql);
    if (analyze) {
      await client.query('ROLLBACK');
    }

    const planArray = result.rows[0]?.['QUERY PLAN'] ?? [];
    const first = planArray[0];
    const summary = {
      total_cost: first?.Plan?.['Total Cost'] ?? null,
      actual_rows: first?.Plan?.['Actual Rows'] ?? null,
      planning_time: first?.['Planning Time'] ?? null,
      execution_time: first?.['Execution Time'] ?? null,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ summary, plan: planArray }, null, 2),
        },
      ],
    };
  } catch (err) {
    if (analyze) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
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
