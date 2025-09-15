# Repository Guidelines

## Regras gerais
- Este é um fork do librechat e estamos 
- Seja proativo e resolva as demandas do usuario com poucas ou nenhuma pergunta.

## Estrutura do Projeto e Organização de Módulos
- Workspaces na raiz: `api` (backend Node), `client` (Vite + React UI), `packages/*` (libs compartilhadas), `e2e` (Playwright), `config` (scripts e setup), `utils`.
- Backend: `api/server` (entrada), `api/app|models|utils`; testes em `api/test`.
- Frontend: `client/src` (components, hooks, routes); assets em `client/public`.
- Pacotes compartilhados: `packages/data-provider`, `packages/data-schemas`, `packages/api`, `packages/client`.

## Comandos de Build, Teste e Desenvolvimento
- Dev local (2 terminais): `npm run backend:dev` e `npm run frontend:dev`.
- Produção: `npm run frontend` (constrói pacotes e client) e `npm run backend` (sobe a API em produção).
- Lint/format: `npm run lint`, `npm run lint:fix`, `npm run format`.
- Testes unitários: `npm run test:api`, `npm run test:client`.
- Testes E2E: `npm run e2e` (headless), `npm run e2e:headed` (com UI), `npm run e2e:report`.
- Fluxos com Bun espelham scripts com prefixo `b:`, ex.: `npm run b:client`.

## Estilo de Código e Convenções de Nomenclatura
- Use ESLint + Prettier (veja `eslint.config.mjs`, `.prettierrc`). Entregue código sem lint errors.
- Indentação: 2 espaços (Prettier). Aspas simples em JS/TS.
- React: componentes em PascalCase (arquivo e export). Funções/variáveis em camelCase. Constantes em SCREAMING_SNAKE_CASE.
- Evite `any` nos pacotes TS; prefira tipos explícitos em `packages/*`.

## Diretrizes de Testes
- Frameworks: Jest (unitários em `api/test`, `client/test`) e Playwright para E2E (`e2e`).
- Nomeie testes como `*.test.(js|ts|tsx)` próximos ao código ou em pastas `test`.
- Adicione testes para novas regras/lógicas e regressões; garanta E2E verde ao alterar fluxos críticos.

## Diretrizes de Commits e Pull Requests
- Siga Conventional Commits usado aqui (emoji opcional): `feat:`, `fix:`, `chore:`, `refactor:`, `i18n:`.
- PRs devem incluir: descrição clara, issue vinculada (se houver), screenshots/GIFs para mudanças de UI e notas para alterações de configuração (`.env`, `librechat.yaml`).
- Execute `npm run lint` e testes relevantes antes de abrir. Mantenha PRs focados e pequenos.

## Segurança e Configuração
- Não commite segredos. Use `.env.example` e `librechat.example.yaml` como referência.
- Configurações locais ficam em `.env` e `librechat.yaml`; documente chaves não óbvias no PR.

## 🛠️ Ferramentas (Tools)

📚 **Documentação completa disponível em: [`docs/TOOLS_GUIDE.md`](./docs/TOOLS_GUIDE.md)**

### Quick Reference

**Estrutura Principal:**
- Implementação: `api/app/clients/tools/structured/`
- Registro: `api/app/clients/tools/manifest.json`
- Configuração: `.env` (API keys) e `librechat.yaml` (filtros)

**Criar Nova Ferramenta - Checklist:**
1. ✅ Criar arquivo em `api/app/clients/tools/structured/`
2. ✅ Adicionar ao `manifest.json`
3. ✅ Exportar no `index.js`
4. ✅ Registrar no `handleTools.js`
5. ✅ Configurar API key no `.env`
6. ✅ Montar volumes no Docker (se aplicável)

**Troubleshooting Rápido:**
- Ferramenta não aparece? → Verificar API key
- MODULE_NOT_FOUND? → Remover `require('~/config')`
- Cache Docker? → `docker compose build --no-cache api`

Para guia completo com exemplos, troubleshooting detalhado e boas práticas, consulte [`docs/TOOLS_GUIDE.md`](./docs/TOOLS_GUIDE.md)
