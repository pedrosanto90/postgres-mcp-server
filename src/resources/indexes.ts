import { query } from '../db.js';

interface IndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
  idx_scan: number | null;
  idx_tup_read: number | null;
  idx_tup_fetch: number | null;
}

const SQL = `
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_indexes
LEFT JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;
`;

export async function indexesResource(uri: URL) {
  try {
    const result = await query<IndexRow>(SQL);
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
