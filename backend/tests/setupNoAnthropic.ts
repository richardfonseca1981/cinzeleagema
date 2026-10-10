// Garante que NENHUM teste do `npm run test` padrão chame a API real da
// Anthropic (nem gaste crédito), mesmo que backend/.env tenha uma chave real.
// Roda depois de tests/setup.ts (que carrega o .env). O dotenv nunca
// sobrescreve uma variável já definida, então a string vazia vale também
// para o `import "dotenv/config"` de src/lib/env.ts. Os testes que precisam
// de "chave presente" a simulam por mock (claude.test.ts) ou alterando `env`.
// Os testes *.integration.test.ts NÃO usam este arquivo — eles existem
// justamente para chamar a API real (vitest.integration.config.ts).
process.env.ANTHROPIC_API_KEY = "";
