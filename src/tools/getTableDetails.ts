import { z } from 'zod';
import { query } from '../db.js';

export const getTableDetailsSchema = {
  table_name: z.string(),
  schema: z.string().default('public'),
};

interface ColumnRow {
  column_name: string;
  ordinal_position: number;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  constraint_type: string | null;
  constraint_name: string | null;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
  idx_scan: number | null;
}

interface FkRow {
  constraint_name: string;
  column_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_column_name: string;
  update_rule: string;
  delete_rule: string;
}

const COLUMNS_SQL = `
SELECT
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  tc.constraint_type,
  kcu.constraint_name
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
  ON c.table_schema = kcu.table_schema
  AND c.table_name = kcu.table_name
  AND c.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
WHERE c.table_schema = $1 AND c.table_name = $2
ORDER BY c.ordinal_position;
`;

const INDEXES_SQL = `
SELECT
  indexname,
  indexdef,
  idx_scan
FROM pg_indexes
LEFT JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = $1 AND tablename = $2
ORDER BY indexname;
`;

const FK_OUTGOING_SQL = `
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = $1
  AND tc.table_name = $2;
`;

const FK_INCOMING_SQL = `
SELECT
  tc.constraint_name,
  kcu.column_name,
  tc.table_schema AS foreign_table_schema,
  tc.table_name AS foreign_table_name,
  kcu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = $1
  AND ccu.table_name = $2;
`;

export async function getTableDetailsHandler(args: { table_name: string; schema?: string }) {
  try {
    const schema = args.schema ?? 'public';
    const { table_name } = args;

    const [columnsRes, indexesRes, fkOutRes, fkInRes] = await Promise.all([
      query<ColumnRow>(COLUMNS_SQL, [schema, table_name]),
      query<IndexRow>(INDEXES_SQL, [schema, table_name]),
      query<FkRow>(FK_OUTGOING_SQL, [schema, table_name]),
      query<FkRow>(FK_INCOMING_SQL, [schema, table_name]),
    ]);

    const data = {
      schema,
      table_name,
      columns: columnsRes.rows,
      indexes: indexesRes.rows,
      foreign_keys: {
        outgoing: fkOutRes.rows,
        incoming: fkInRes.rows,
      },
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
    };
  }
}
