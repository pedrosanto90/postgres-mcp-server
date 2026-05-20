import { z } from 'zod';
import { query } from '../db.js';
import { getFunctionHandler } from './getFunction.js';

export const createFunctionSchema = {
  definition: z
    .string()
    .describe('Definição completa da função: CREATE OR REPLACE FUNCTION ...'),
};

interface PgError {
  message?: string;
  position?: string;
  detail?: string;
  hint?: string;
  code?: string;
}

function extractFunctionIdentifier(definition: string): { schema: string; name: string } | null {
  const match = definition.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:([A-Za-z_][\w]*)\.)?([A-Za-z_][\w]*)/i
  );
  if (!match) return null;
  return {
    schema: match[1] ?? 'public',
    name: match[2],
  };
}

export async function createFunctionHandler(args: { definition: string }) {
  const definition = args.definition.trim();
  if (!/^CREATE\b/i.test(definition)) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: 'Error: definition must start with CREATE (e.g. CREATE OR REPLACE FUNCTION ...).',
        },
      ],
    };
  }

  try {
    await query(definition);
  } catch (err) {
    const pgErr = err as PgError;
    const payload = {
      error: pgErr.message ?? String(err),
      code: pgErr.code ?? null,
      position: pgErr.position ?? null,
      detail: pgErr.detail ?? null,
      hint: pgErr.hint ?? null,
    };
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    };
  }

  const ident = extractFunctionIdentifier(definition);
  if (!ident) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Function created successfully (could not parse identifier to fetch back).',
        },
      ],
    };
  }

  return getFunctionHandler({ name: ident.name, schema: ident.schema });
}
