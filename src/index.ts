import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { pool } from './db.js';

import { schemaResource } from './resources/schema.js';
import { relationsResource } from './resources/relations.js';
import { indexesResource } from './resources/indexes.js';
import { functionsResource } from './resources/functions.js';

import { getTableDetailsSchema, getTableDetailsHandler } from './tools/getTableDetails.js';
import { listFunctionsSchema, listFunctionsHandler } from './tools/listFunctions.js';
import { getFunctionSchema, getFunctionHandler } from './tools/getFunction.js';
import { executeQuerySchema, executeQueryHandler } from './tools/executeQuery.js';
import { explainQuerySchema, explainQueryHandler } from './tools/explainQuery.js';
import { createFunctionSchema, createFunctionHandler } from './tools/createFunction.js';
import { applyFunctionSchema, applyFunctionHandler } from './tools/applyFunction.js';

async function main() {
  try {
    const probe = await pool.query('SELECT 1');
    if (!probe) throw new Error('no probe result');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[postgres-mcp] Failed to connect to database: ${message}`);
    process.exit(1);
  }

  const server = new McpServer({ name: 'postgres-mcp', version: '1.0.0' });

  server.resource('schema', 'postgres://schema', schemaResource);
  server.resource('relations', 'postgres://relations', relationsResource);
  server.resource('indexes', 'postgres://indexes', indexesResource);
  server.resource('functions', 'postgres://functions', functionsResource);

  server.tool(
    'get_table_details',
    'Detalhes completos de uma tabela: colunas, índices e foreign keys (entrada e saída).',
    getTableDetailsSchema,
    getTableDetailsHandler
  );

  server.tool(
    'list_functions',
    'Lista funções da base de dados, com filtros opcionais por schema e nome (ILIKE).',
    listFunctionsSchema,
    listFunctionsHandler
  );

  server.tool(
    'get_function',
    'Devolve a definição completa de uma função (CREATE OR REPLACE FUNCTION ...) e metadados.',
    getFunctionSchema,
    getFunctionHandler
  );

  server.tool(
    'execute_query',
    'Executa uma query SELECT em modo read-only (transação READ ONLY com ROLLBACK). Limita a 500 linhas.',
    executeQuerySchema,
    executeQueryHandler
  );

  server.tool(
    'explain_query',
    'Devolve o plano de execução de uma query (EXPLAIN ou EXPLAIN ANALYZE, sempre com ROLLBACK).',
    explainQuerySchema,
    explainQueryHandler
  );

  server.tool(
    'create_function',
    'Valida e prepara uma definição de função (CREATE OR REPLACE FUNCTION ...). NÃO escreve na base de dados — apenas devolve a definição preparada. Para aplicar use apply_function, e só quando o utilizador pedir explicitamente.',
    createFunctionSchema,
    createFunctionHandler
  );

  server.tool(
    'apply_function',
    'Aplica uma definição de função na base de dados (executa o CREATE OR REPLACE FUNCTION). APENAS deve ser chamada quando o utilizador pedir explicitamente para aplicar/enviar a função à BD; caso contrário use create_function para apenas preparar.',
    applyFunctionSchema,
    applyFunctionHandler
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[postgres-mcp] Server connected via stdio.');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[postgres-mcp] Fatal: ${message}`);
  process.exit(1);
});
