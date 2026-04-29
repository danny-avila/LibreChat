# Guia de Desenvolvimento Frontend — LibreChat

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Estrutura do Projeto](#3-estrutura-do-projeto)
4. [Comandos de Desenvolvimento](#4-comandos-de-desenvolvimento)
5. [Componentes e Organização](#5-componentes-e-organização)
6. [Localização (i18n)](#6-localização-i18n)
7. [Gerenciamento de Dados com React Query](#7-gerenciamento-de-dados-com-react-query)
8. [Integração com Data-Provider](#8-integração-com-data-provider)
9. [Convenções de Código](#9-convenções-de-código)
10. [Ordenação de Imports](#10-ordenação-de-imports)
11. [Performance](#11-performance)
12. [Testes](#12-testes)

---

## 1. Visão Geral

O frontend do LibreChat é uma SPA (Single Page Application) construída em TypeScript e React, organizada em dois workspaces dentro do monorepo:

| Workspace | Linguagem | Propósito |
|---|---|---|
| `/client` | TypeScript/React | SPA principal — componentes, páginas, hooks |
| `/packages/client` | TypeScript | Utilitários e hooks compartilhados |
| `/packages/data-provider` | TypeScript | Tipos de API, endpoints e data-service (compartilhado frontend/backend) |

Em desenvolvimento, o frontend roda na porta **3090** com Hot Module Replacement (HMR) e se comunica com o backend em `http://localhost:3080`.

---

## 2. Pré-requisitos

- Node.js: `v20.19.0+`, `^22.12.0` ou `>= 23.0.0`
- Backend rodando em `http://localhost:3080` (obrigatório antes de subir o frontend)
- MongoDB rodando

Para subir o MongoDB via Docker:

```bash
docker run -d --name chat-mongodb -p 27017:27017 mongo:8.0.20 mongod --noauth
```

---

## 3. Estrutura do Projeto

```
client/src/
  components/         # Componentes React agrupados por feature
  data-provider/      # Hooks de query/mutation por feature
  hooks/              # Hooks globais reutilizáveis
  locales/en/         # Chaves de tradução (apenas inglês)
  pages/              # Páginas da aplicação
  utils/              # Utilitários puros

packages/
  client/src/         # Utilitários e hooks compartilhados
  data-provider/src/  # Tipos, endpoints e data-service
    api-endpoints.ts
    data-service.ts
    keys.ts
    types/queries.ts
```

---

## 4. Comandos de Desenvolvimento

Executar da **raiz do projeto**, exceto onde indicado.

| Comando | Propósito |
|---|---|
| `npm run frontend:dev` | Inicia o servidor de desenvolvimento com HMR (porta 3090) |
| `npm run backend:dev` | Inicia o backend com file watching (porta 3080) |
| `npm run build:data-provider` | Rebuild do data-provider após alterações no pacote |
| `npm run smart-reinstall` | Instala dependências e builda via Turborepo |

Build de produção do frontend (requer memória extra):

```bash
cd client && NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## 5. Componentes e Organização

- Todos os componentes React devem ser escritos em **TypeScript** com tipagem explícita
- Use HTML semântico com atributos ARIA (`role`, `aria-label`) para acessibilidade
- Agrupe componentes relacionados em diretórios de feature
- Use `index.ts` para exports limpos

```
client/src/components/
  SidePanel/
    Memories/
      MemoryList.tsx
      MemoryItem.tsx
      index.ts
```

---

## 6. Localização (i18n)

Todo texto visível ao usuário deve usar o hook `useLocalize()`:

```tsx
import { useLocalize } from '~/hooks';

const localize = useLocalize();
return <span>{localize('com_ui_submit')}</span>;
```

- Atualizar apenas o arquivo de inglês: `client/src/locales/en/translation.json`
- Outros idiomas são gerados automaticamente — **não edite**

### Prefixos semânticos de chaves

| Prefixo | Uso |
|---|---|
| `com_ui_` | Elementos de interface genéricos |
| `com_assistants_` | Funcionalidades de assistentes |
| `com_nav_` | Navegação |
| `com_error_` | Mensagens de erro |

---

## 7. Gerenciamento de Dados com React Query

Todas as interações com a API devem usar `@tanstack/react-query`. Nunca faça fetch direto em componentes.

### Estrutura de hooks de feature

```
client/src/data-provider/
  [Feature]/
    queries.ts    # useQuery e useMutation
    index.ts      # re-exporta tudo

# Registrar no índice principal
client/src/data-provider/index.ts
```

### Invalidação de queries

```ts
import { QueryKeys } from 'librechat-data-provider';

queryClient.invalidateQueries({ queryKey: [QueryKeys.messages] });
```

- `QueryKeys` e `MutationKeys` centralizados em `packages/data-provider/src/keys.ts`
- Sempre invalidar queries relacionadas após mutations

---

## 8. Integração com Data-Provider

Nunca chame URLs diretamente — use sempre o data-service.

| Arquivo | Propósito |
|---|---|
| `packages/data-provider/src/api-endpoints.ts` | Definição de todos os endpoints |
| `packages/data-provider/src/data-service.ts` | Funções de chamada HTTP tipadas |
| `packages/data-provider/src/types/queries.ts` | Tipos de request e response |
| `packages/data-provider/src/keys.ts` | QueryKeys e MutationKeys |

Sempre usar `encodeURIComponent` em parâmetros de URL dinâmicos:

```ts
const url = `/conversations/${encodeURIComponent(conversationId)}`;
```

Após alterar o data-provider, rebuildar:

```bash
npm run build:data-provider
```

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

## 10. Ordenação de Imports

Os imports são organizados em três seções:

```ts
// 1. Package imports — do mais curto ao mais longo (react sempre primeiro)
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. import type — do mais longo ao mais curto
import type { ConversationListResponse } from 'librechat-data-provider';
import type { TConversation } from '~/types';

// 3. Imports locais — do mais longo ao mais curto
import { useConversationsQuery } from '~/data-provider';
import { ErrorBoundary } from '~/components/ui';
```

- Sempre usar `import type { ... }` standalone — nunca `type` inline dentro de value imports

---

## 11. Performance

- **Cursor pagination** para grandes datasets — nunca carregar tudo de uma vez
- Dependency arrays corretos em `useEffect` e `useMemo` para evitar re-renders desnecessários
- Aproveitar cache e background refetching do React Query
- Minimizar loops — especialmente sobre arrays de mensagens (iterados frequentemente)
- Consolidar operações O(n) sequenciais em uma única passagem
- Preferir `Map`/`Set` para lookups em vez de `Array.find`/`Array.includes`

---

## 12. Testes

### Como rodar

```bash
cd client && npx jest <pattern>

# Exemplo
cd client && npx jest ConversationList
```

### Estrutura

```
client/src/components/
  ConversationList/
    ConversationList.tsx
    __tests__/
      ConversationList.spec.tsx
```

### Filosofia

- Preferir lógica real a mocks — mocking é último recurso
- Spies sobre mocks: verificar que funções reais são chamadas corretamente
- Cobrir estados: **loading**, **success** e **error**
- Usar `test/layout-test-utils` para renderização de componentes
- Heavy mocking é code smell, não estratégia de teste
