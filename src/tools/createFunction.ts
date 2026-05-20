import { z } from 'zod';

export const createFunctionSchema = {
  definition: z
    .string()
    .describe('Definição completa da função: CREATE OR REPLACE FUNCTION ...'),
};

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

  const ident = extractFunctionIdentifier(definition);
  const payload = {
    status: 'prepared',
    note: 'Definição validada mas NÃO aplicada na base de dados. Use apply_function apenas quando o utilizador pedir explicitamente para aplicar.',
    identifier: ident,
    definition,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}
