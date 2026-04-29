# Guia de Desenvolvimento Backend — LibreChat

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Estrutura do Projeto](#3-estrutura-do-projeto)
4. [Comandos de Desenvolvimento](#4-comandos-de-desenvolvimento)
5. [Regras de Workspace](#5-regras-de-workspace)
6. [Configuração](#6-configuração)
7. [Banco de Dados](#7-banco-de-dados)
8. [Busca de Modelos por Provedor](#8-busca-de-modelos-por-provedor)
9. [Convenções de Código](#9-convenções-de-código)
10. [Nomenclatura e Organização de Arquivos](#10-nomenclatura-e-organização-de-arquivos)
11. [Ordenação de Imports](#11-ordenação-de-imports)
12. [Performance](#12-performance)
13. [Testes](#13-testes)

---

## 1. Visão Geral

O backend do LibreChat é composto por quatro workspaces dentro do monorepo:

| Workspace | Linguagem | Propósito |
|---|---|---|
| `/api` | JavaScript (legado) | Servidor Express — minimizar alterações aqui |
| `/packages/api` | **TypeScript** | Todo código novo de backend vive aqui |
| `/packages/data-schemas` | TypeScript | Models e schemas do banco de dados |
| `/packages/data-provider` | TypeScript | Tipos de API, endpoints e data-service (compartilhado com o frontend) |

Dependência externa importante: `@librechat/agents` — código fonte em `/home/danny/agentus`.

O backend roda na porta **3080**.

---

## 2. Pré-requisitos

- Node.js: `v20.19.0+`, `^22.12.0` ou `>= 23.0.0`
- MongoDB rodando localmente ou via Docker
- Arquivo `.env` configurado na raiz
- Arquivo `librechat.yaml` configurado na raiz

---

## 3. Estrutura do Projeto

```
api/
  server/
    controllers/      # Controllers HTTP (thin wrappers para /packages/api)
    middleware/       # Middlewares Express
    services/
      Config/         # Carregamento de configuração e modelos
      Endpoints/      # Lógica de endpoints por provedor

packages/
  api/src/
    endpoints/        # Lógica de busca de modelos e inicialização
    agents/           # Integração com @librechat/agents
    cache/            # Serviços de cache
    utils/            # Utilitários backend

  data-schemas/src/   # Models Mongoose e schemas de banco
  data-provider/src/  # Tipos compartilhados, endpoints, data-service
    api-endpoints.ts
    data-service.ts
    keys.ts
    types/
```

---

## 4. Comandos de Desenvolvimento

Executar da **raiz do projeto**.

| Comando | Propósito |
|---|---|
| `npm run backend:dev` | Inicia o backend com file watching (nodemon, porta 3080) |
| `npm run backend` | Inicia o backend em modo produção |
| `npm run build` | Builda todos os pacotes via Turborepo |
| `npm run build:data-provider` | Rebuild apenas do data-provider |
| `npm run smart-reinstall` | Instala dependências e builda via Turborepo |
| `npm run reinstall` | Limpeza completa e reinstalação do zero |

### Rodar testes

```bash
cd packages/api && npx jest <pattern>
cd api && npx jest <pattern>
```

---

## 5. Regras de Workspace

- **Todo código novo de backend deve ser TypeScript** em `/packages/api`
- Manter alterações em `/api` no mínimo absoluto — apenas thin JS wrappers chamando `/packages/api`
- Lógica compartilhada específica de banco vai em `/packages/data-schemas`
- Lógica compartilhada de API frontend/backend vai em `/packages/data-provider`

```js
// api/server/controllers/ModelController.js — exemplo de thin wrapper
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}
```

---

## 6. Configuração

### Arquivo de ambiente

Copiar o exemplo e ajustar:

```bash
cp .env.example .env
```

Variável obrigatória:

```env
MONGO_URI=mongodb://localhost:27017/LibreChat
```

### Arquivo de configuração da aplicação

```bash
cp librechat.example.yaml librechat.yaml
```

O `librechat.yaml` controla endpoints customizados, permissões de interface, registro de usuários e muito mais. O backend carrega esse arquivo na inicialização via `api/server/services/Config/`.

---

## 7. Banco de Dados

- **MongoDB** é o banco principal
- Para desenvolvimento, recomenda-se rodar via Docker:

```bash
docker run -d \
  --name chat-mongodb \
  -p 27017:27017 \
  mongo:8.0.20 \
  mongod --noauth
```

- Models e schemas ficam em `/packages/data-schemas`
- Para testes, usar `mongodb-memory-server` (instância real em memória — não mockar o banco)

---

## 8. Busca de Modelos por Provedor

### Fluxo

```
HTTP GET /api/models
  └── api/server/controllers/ModelController.js
        ├── loadDefaultModels()   # provedores padrão (OpenAI, Anthropic, etc.)
        └── loadConfigModels()    # endpoints customizados do librechat.yaml
              └── packages/api/src/endpoints/models.ts
```

### Funções principais (`packages/api/src/endpoints/models.ts`)

| Função | Provedor |
|---|---|
| `fetchModels()` | Genérica — HTTP GET em `/models` de qualquer provedor |
| `getOpenAIModels()` / `fetchOpenAIModels()` | OpenAI e Azure |
| `getAnthropicModels()` / `fetchAnthropicModels()` | Anthropic |
| `fetchOllamaModels()` | Ollama via `/api/tags` |
| `getGoogleModels()` | Google (lê de `GOOGLE_MODELS` no `.env`) |
| `getBedrockModels()` | Bedrock (lê de `BEDROCK_AWS_MODELS` no `.env`) |

### Prioridade de resolução

1. Variável de ambiente (ex: `OPENAI_MODELS`, `ANTHROPIC_MODELS`)
2. Busca via API do provedor
3. Lista de defaults hardcoded em `librechat-data-provider`

### Cache

Os resultados ficam cacheados por **2 minutos** via `CacheKeys.MODEL_QUERIES`.

---

## 9. Convenções de Código

### Type Safety

- **Nunca usar `any`** — tipos explícitos em todos os parâmetros e retornos
- Evitar `unknown`, `Record<string, unknown>` e `as unknown as T`
- Verificar se o tipo já existe em `packages/data-provider` antes de criar um novo
- Todos os avisos de TypeScript e ESLint devem ser resolvidos

### Estrutura

- **Never-nesting**: early returns, código flat, mínima indentação
- Funções puras e dados imutáveis
- `map`/`filter`/`reduce` preferidos sobre loops imperativos
- Sem dynamic imports a menos que absolutamente necessário

### Comentários

- Código auto-documentado — sem comentários narrando o que o código faz
- JSDoc apenas para lógica complexa ou APIs públicas
- Evitar comentários `//` desnecessários

---

## 10. Nomenclatura e Organização de Arquivos

- **Nomes de arquivo de uma palavra** sempre que possível: `permissions.ts`, `service.ts`, `models.ts`
- Quando precisar de múltiplas palavras, agrupar em diretório de palavra única:
  - `admin/capabilities.ts` — correto
  - `adminCapabilities.ts` — evitar
- O diretório já fornece contexto: `app/service.ts`, não `app/appConfigService.ts`

---

## 11. Ordenação de Imports

```ts
// 1. Package imports — do mais curto ao mais longo
import crypto from 'crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 2. import type — do mais longo ao mais curto
import type { FetchModelsParams } from './types';
import type { IUser } from '@librechat/data-schemas';

// 3. Imports locais — do mais longo ao mais curto
import { standardCache, tokenConfigCache } from '~/cache';
import { logAxiosError, isUserProvided } from '~/utils';
```

- Sempre usar `import type { ... }` standalone — nunca `type` inline dentro de value imports

---

## 12. Performance

- **Minimizar loops** — especialmente sobre arrays de mensagens, que são iterados frequentemente em todo o codebase
- Consolidar operações O(n) sequenciais em uma única passagem — nunca iterar a mesma coleção duas vezes
- Preferir `Map`/`Set` para lookups em vez de `Array.find`/`Array.includes`
- Evitar criação desnecessária de objetos
- Prevenir memory leaks: cuidado com closures, dispose de recursos e event listeners

---

## 13. Testes

### Como rodar

```bash
cd packages/api && npx jest <pattern>
cd api && npx jest <pattern>

# Exemplo
cd packages/api && npx jest models
```

### Filosofia

- **Lógica real sobre mocks** — exercitar os caminhos reais do código
- **Spies sobre mocks** — verificar que funções reais são chamadas com os argumentos esperados
- **MongoDB**: usar `mongodb-memory-server` para uma instância real em memória — testar queries e validações reais, não chamadas mockadas
- **MCP**: usar exports reais do `@modelcontextprotocol/sdk` — espelhar cenários reais, não fazer stub dos internos do SDK
- Mockar apenas o que não se pode controlar: HTTP externos, serviços com rate limit, chamadas de sistema não-determinísticas
- Heavy mocking é code smell, não estratégia de teste

### Estrutura

```
packages/api/src/
  endpoints/
    models.ts
    models.spec.ts    # testes ao lado do arquivo
```
