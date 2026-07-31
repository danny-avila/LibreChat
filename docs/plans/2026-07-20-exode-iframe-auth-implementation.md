# Exode ↔ LibreChat: реализация авторизации во встраиваемом iframe

**Дата:** 2026-07-20  
**Статус:** часть LibreChat реализована; контракты соседних репозиториев ожидают реализации  
**Репозитории:** `LibreChat`, `exode-app`, `exode-backend-main`, `exode-backend-ms-ai`

## 1. Цель

Встроить LibreChat в `exode-app` без второго экрана входа и без передачи обычного сессионного
токена Exode в LibreChat или `exode-backend-ms-ai`.

Итоговая цепочка запроса должна выглядеть так:

```text
пользователь Exode
  -> exode-app iframe
  -> пользователь LibreChat + LibreChat JWT
  -> отдельный LibreChat customUserVar для каждого principal
  -> ai_chat MCP
  -> exode-backend-main /graphql
  -> исходный пользователь Exode и его права в рамках школы и продавца
```

Обязательные требования:

- Exode остаётся источником истины для идентификации и авторизации.
- LibreChat сохраняет собственных пользователей, диалоги и JWT-аутентификацию.
- Обычный непрозрачный сессионный токен Exode никогда не покидает `exode-app`.
- Токены не передаются через URL iframe, query string, local storage или логи.
- Каждый нижестоящий GraphQL-запрос выполняется от имени реального пользователя Exode.
- Завершение сессии Exode отзывает доступ нижестоящих сервисов.
- Контекст школы и продавца подписывается в downstream-токене и не может быть подменён заголовками
  вызывающей стороны.
- Параллельные вкладки с разными school/seller-контекстами не используют общий MCP credential или
  пространство диалогов LibreChat.
- Любое изменение документа пользователя LibreChat инвалидирует кэш auth user document.

## 2. Выбранная архитектура

Встроенный чат использует bridge на основе `postMessage` для передачи одноразового токена. OIDC
для iframe не используется.

Используются два разных service JWT Exode:

| Токен             | Получатель (audience) |           TTL | Назначение                                          |
| ----------------- | --------------------- | ------------: | --------------------------------------------------- |
| `AiChatBootstrap` | `LibreChatBridge`     | 60–120 секунд | Одноразовая передача входа из родительской страницы |
| `AiChatAccess`    | `BackendMainGraphql`  |   15–30 минут | MCP-запросы LibreChat к GraphQL основного backend   |

Такое разделение сделано намеренно. Украденный из браузера bootstrap-артефакт нельзя использовать
как долгоживущий GraphQL credential. Только `exode-backend-main` может обменять его на
`AiChatAccess`.

Identity в LibreChat привязывается к фактическому контексту авторизации Exode, а не только к
физическому пользователю. Main возвращает непрозрачный детерминированный `principalId`, вычисленный
из `userUuid + schoolId + sellerId`; LibreChat использует его как `openidId`. Это необходимо,
поскольку `PluginAuth.customUserVars` хранятся на уровне пользователя LibreChat. При
`openidId = userUuid` две вкладки для разных школ перезаписывали бы друг другу `EXODE_AI_TOKEN`.
Контекстные principals изолируют credentials, диалоги и доступы к агентам, оставаясь стабильными
между сессиями Exode.

```text
┌───────────────┐                 ┌────────────────┐
│   exode-app   │                 │   LibreChat    │
│               │◄── ready ──────│ клиент iframe  │
│ выпускает     │                 │                │
│ bootstrap JWT │── authenticate ►│ /auth/exode    │
└───────┬───────┘                 └───────┬────────┘
        │                                 │ внутренний обмен
        │                                 ▼
        │                         ┌──────────────────┐
        └────────────────────────►│ backend-main     │
                                  │ проверка сессии  │
                                  │ выпуск access JWT│
                                  └────────┬─────────┘
                                           │
                                  customUserVar
                                           │
                                  LibreChat → MCP → /graphql
```

## 3. Обзор протокола

### 3.1 Первичный вход

1. `exode-app` монтирует `https://ai.exode.biz/embed/exode` без credentials в URL.
2. LibreChat создаёт случайный handshake ID и отправляет родителю `exode-ai-chat:ready`.
3. Родитель проверяет `event.source` и `event.origin`.
4. Родитель запрашивает у main токен `AiChatBootstrap`, передавая handshake ID как `resourceId`.
5. Родитель отправляет bootstrap JWT непосредственно в окно iframe с точным target origin.
6. Клиент LibreChat отправляет его в same-origin endpoint `/api/auth/exode/exchange`.
7. LibreChat вызывает внутренний endpoint main `/api/v2/auth/ai-chat/exchange`.
8. Main проверяет и поглощает bootstrap JWT, определяет identity и выпускает `AiChatAccess`.
9. LibreChat создаёт или обновляет локального пользователя, сохраняет `AiChatAccess` как
   зашифрованную пользовательскую переменную MCP и возвращает короткоживущий LibreChat JWT.
10. Клиент LibreChat устанавливает JWT в `AuthContext` и открывает разрешённого агента.

### 3.2 Обновление токенов

Iframe запрашивает обновление у родителя до наступления более раннего из двух моментов:

- срок действия LibreChat JWT минус 90 секунд;
- срок действия `AiChatAccess` минус 120 секунд.

Обновление повторяет bootstrap exchange и не зависит от refresh cookie внутри iframe.

### 3.3 Выход и отзыв доступа

- При выходе из Exode родитель отправляет `exode-ai-chat:logout` и очищает или размонтирует iframe.
- LibreChat удаляет access token из памяти и очищает закэшированные данные пользователя.
- Если событие потерялось, LibreChat JWT самостоятельно истечёт через короткий TTL.
- Каждая проверка `AiChatAccess` валидирует `sessionUuid`; завершённая сессия Exode немедленно
  блокирует MCP GraphQL-вызовы, даже если `exp` токена ещё не наступил.

## 4. `exode-backend-main`

### 4.1 Перечисления токенов

Файл: `libs/modules/auth/interfaces/auth.enum.ts`

```ts
export enum ServiceJwtPurpose {
  ScormLaunch = 'ScormLaunch',
  AiChatBootstrap = 'AiChatBootstrap',
  AiChatAccess = 'AiChatAccess',
}

export enum ServiceJwtAudience {
  ScormApiWorker = 'ScormApiWorker',
  LibreChatBridge = 'LibreChatBridge',
  BackendMainGraphql = 'BackendMainGraphql',
}
```

Предлагаемая конфигурация:

```json
{
  "purposes": {
    "AiChatBootstrap": {
      "audiences": ["LibreChatBridge"],
      "ttl": 90
    },
    "AiChatAccess": {
      "audiences": ["BackendMainGraphql"],
      "ttl": 1800
    }
  },
  "services": {
    "LibreChatBridge": "<separate-production-secret>"
  }
}
```

Не используйте секрет подписи JWT в качестве сервисного секрета LibreChat.

### 4.2 Поля (claims) токенов

Файл: `libs/modules/auth/interfaces/auth-jwt.interface.ts`

```ts
export interface AuthJwtPayload {
  exp?: number;
  iat?: number;
  iss?: string;
  sub?: string;
  aud?: string | string[];
  jti?: string;

  userId?: number;
  userUuid?: string;
  schoolId?: number;
  sellerId?: number;
  sessionId?: number;
  sessionUuid?: string;

  purpose?: ServiceJwtPurpose;
  resourceId?: string;
  parentOrigin?: string;
}
```

`schoolId` и `sellerId` должны поступать из аутентифицированного запроса после штатных проверок
доступа Exode. Их нельзя безусловно копировать из body endpoint-а выпуска токена.

### 4.3 Публичный выпуск bootstrap-токена

Существующий endpoint сохраняется:

```http
POST /api/v2/auth/issue-service-token
Authorization: Bearer <normal opaque Exode session token>
Origin: https://exode.biz
school-id: 17
seller-id: 42
Content-Type: application/json

{
  "purpose": "AiChatBootstrap",
  "resourceId": "ec150ba8-01a4-4db3-b61e-a1ca22d021ba"
}
```

Ответ:

```json
{
  "payload": {
    "token": "eyJ...",
    "expiresAt": "2026-07-20T14:01:30.000Z"
  }
}
```

Контроллер должен ограничивать список purpose, которые может запросить браузер:

```ts
const publicPurposes = new Set<ServiceJwtPurpose>([
  ServiceJwtPurpose.ScormLaunch,
  ServiceJwtPurpose.AiChatBootstrap,
]);

if (!publicPurposes.has(input.purpose)) {
  throw ApiException({
    cause: AuthException.Forbidden,
    message: 'Service JWT purpose cannot be issued by a user client',
  });
}
```

Перед подписью action выпуска должен определить контекст продавца:

```ts
@SellerInterceptor()
@ApiMethod({ auth: true })
@Post('issue-service-token')
issueServiceToken(
    @User() user: UserEntity,
    @Session() session: SessionEntity,
    @Seller() seller: SellerEntity,
    @SchoolId() schoolId: number,
    @Headers('origin') parentOrigin: string,
    @Body() input: IssueServiceTokenAuthInput,
): IssueServiceTokenAuthOutput {
    return this.authJwtService.issueServiceToken({
        user,
        session,
        schoolId,
        sellerId: seller?.id,
        purpose: input.purpose,
        resourceId: input.resourceId,
        parentOrigin,
    });
}
```

До включения в подпись origin необходимо нормализовать и проверить по политике доменов приложения
Exode и пользовательских доменов.

### 4.4 Внутренний endpoint обмена

Следует добавить отдельные DTO для этого purpose, а не расширять общий ответ `verify-jwt`.

```ts
export class ExchangeAiChatAuthInput {
  token: string;
  handshakeId: string;
  parentOrigin: string;
}

export class AiChatIdentityOutput {
  subject: string;
  userId: number;
  userUuid: string;
  name: string;
  avatar?: string;
  schoolId?: number;
  sellerId?: number;
}

export class ExchangeAiChatAuthOutput {
  identity: AiChatIdentityOutput;
  token: string;
  expiresAt: Date;
}
```

Запрос от LibreChat:

```http
POST /api/v2/auth/ai-chat/exchange
x-service-id: LibreChatBridge
x-service-secret: <service-secret>
Content-Type: application/json

{
  "token": "eyJ...bootstrap...",
  "handshakeId": "ec150ba8-01a4-4db3-b61e-a1ca22d021ba",
  "parentOrigin": "https://exode.biz"
}
```

Ответ:

```json
{
  "payload": {
    "identity": {
      "subject": "e14c27b934df7c0f9b728d4b3992d6fe14d3a44ca1f7f468c01b9e741fe37aa7",
      "userId": 9021,
      "userUuid": "f49635f4-e814-4d66-a535-73229b949253",
      "name": "Aslan Orlov",
      "avatar": "https://storage.exode.ru/...",
      "schoolId": 17,
      "sellerId": 42
    },
    "token": "eyJ...access...",
    "expiresAt": "2026-07-20T14:30:00.000Z"
  }
}
```

Эскиз контроллера:

```ts
@InternalApi()
@Post('ai-chat/exchange')
async exchangeAiChat(
    @Body() input: ExchangeAiChatAuthInput,
): Promise<ExchangeAiChatAuthOutput> {
    const resolved = await this.authJwtService.resolveServiceToken(
        input.token,
        ServiceJwtAudience.LibreChatBridge,
    );

    if (!resolved
        || resolved.claims.purpose !== ServiceJwtPurpose.AiChatBootstrap
        || resolved.claims.resourceId !== input.handshakeId
        || resolved.claims.parentOrigin !== input.parentOrigin
    ) {
        throw ApiException({
            cause: AuthException.Unauthorized,
            message: 'Invalid AI chat bootstrap token',
        });
    }

    await this.authJwtService.consumeJti(resolved.claims);
    await this.aiChatAccessService.assertAvailable(resolved.user);

    const access = this.authJwtService.issueServiceToken({
        user: resolved.user,
        session: resolved.session,
        schoolId: resolved.claims.schoolId,
        sellerId: resolved.claims.sellerId,
        purpose: ServiceJwtPurpose.AiChatAccess,
        resourceId: input.handshakeId,
    });

    return new ExchangeAiChatAuthOutput({
        token: access.token,
        expiresAt: access.expiresAt,
        identity: this.aiChatIdentityService.serialize(resolved.user, resolved.claims),
    });
}
```

`resolveServiceToken` должен возвращать claims и уже загруженные session/user, чтобы endpoint обмена
и GraphQL guards не выполняли повторное чтение сессии.

`AiChatIdentityService.serialize` должен вычислять subject LibreChat в единственном каноническом
месте:

```ts
import { createHash } from 'node:crypto';

function createAiChatPrincipalId(input: {
  userUuid: string;
  schoolId?: number;
  sellerId?: number;
}): string {
  const canonical = [
    'v1',
    input.userUuid,
    input.schoolId?.toString() ?? 'global',
    input.sellerId?.toString() ?? 'none',
  ].join(':');

  return createHash('sha256').update(canonical).digest('hex');
}
```

Не дублируйте эту функцию независимо в LibreChat или `ms-ai`: владельцем mapping-а является main.
Будущее изменение канонической формы потребует версионированной миграции, поскольку оно меняет
владельцев аккаунтов и диалогов LibreChat.

### 4.5 Одноразовое поглощение bootstrap-токена

`jti` должен поглощаться атомарно в main, а не только в LibreChat:

```ts
async consumeJti(claims: AuthJwtPayload): Promise<void> {
    const ttl = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
    const key = `auth:jwt:consumed:${claims.jti}`;

    const stored = await this.redis.set(key, '1', 'EX', ttl, 'NX');

    if (stored !== 'OK') {
        throw ApiException({
            cause: AuthException.Unauthorized,
            message: 'Service JWT was already consumed',
        });
    }
}
```

Вызов следует адаптировать под конкретный Redis wrapper в main, сохранив семантику `SET NX EX`.

### 4.6 GraphQL-аутентификация

Текущее поведение с непрозрачным токеном остаётся fallback-механизмом. Service JWT принимается,
только если одновременно выполнены все условия:

- запрос направлен в GraphQL;
- purpose равен `AiChatAccess`;
- audience содержит `BackendMainGraphql`;
- подпись, issuer и срок действия корректны;
- указанная в токене сессия Exode активна;
- UUID пользователя в токене совпадает с UUID пользователя сессии.

```ts
async getAliveSessionByToken(request: RawRequestWithMeta) {
    const { authToken } = parseSystemHeaders(request);

    if (!authToken?.includes('.')) {
        return this.authService.getAliveSessionByToken(authToken);
    }

    const resolved = await this.authJwtService.resolveServiceToken(
        authToken,
        ServiceJwtAudience.BackendMainGraphql,
    );

    if (!resolved || resolved.claims.purpose !== ServiceJwtPurpose.AiChatAccess) {
        return { session: null, user: null };
    }

    request.headers['school-id'] = resolved.claims.schoolId
        ? String(resolved.claims.schoolId)
        : undefined;

    request.headers['seller-id'] = resolved.claims.sellerId
        ? String(resolved.claims.sellerId)
        : undefined;

    setRequestMetaValue(request, RequestMeta.AuthPurpose, ServiceJwtPurpose.AiChatAccess);

    return {
        user: resolved.user,
        session: resolved.session,
    };
}
```

Нельзя доверять `school-id` или `seller-id`, пришедшим вместе с `AiChatAccess`: их нужно
перезаписать или удалить. После восстановления контекста по-прежнему выполняются штатные проверки
`SchoolId` и seller RBAC.

### 4.7 Ограничение GraphQL-операций

Allowlist MCP-мутаций — это слой UX и дополнительной безопасности, но не security boundary: bearer
token можно отправить непосредственно в main. Источником окончательного решения остаётся main.

После `AuthTokenGuard` необходимо добавить `AiChatOperationGuard`:

```ts
const aiChatMutationAllowlist = new Set([
    'courseManageCreate',
    'courseManageUpdate',
    'groupManageCreate',
]);

async canActivate(context: ExecutionContext) {
    const { request } = parseRequest(context);
    const purpose = getRequestMetaValue(request, RequestMeta.AuthPurpose);

    if (purpose !== ServiceJwtPurpose.AiChatAccess) {
        return true;
    }

    const info = context.getArgByIndex(3);

    if (info.operation.operation === 'query') {
        return true;
    }

    if (info.operation.operation !== 'mutation'
        || !aiChatMutationAllowlist.has(info.fieldName)
    ) {
        throw ApiException({
            cause: AuthException.Forbidden,
            message: 'Operation is not available to AI chat',
        });
    }

    return true;
}
```

Существующие resolver-ы и seller/user guards в main продолжают принимать окончательное решение об
авторизации на уровне сущностей.

## 5. Сервер LibreChat

Всю новую backend-реализацию следует разместить на TypeScript в `packages/api`. Изменения в legacy
`api/` должны содержать только тонкое подключение route и зависимостей.

### 5.1 Переменные окружения

```dotenv
EXODE_MAIN_URL=https://api.exode.biz
EXODE_MAIN_SERVICE_ID=LibreChatBridge
EXODE_MAIN_SERVICE_SECRET=<secret>
EXODE_MAIN_ISSUER=exode-backend-main
EXODE_EMBED_ORIGINS=https://exode.biz,https://staging.exode.biz
EXODE_EMBED_JWT_TTL_MS=300000
```

Нельзя логировать `EXODE_MAIN_SERVICE_SECRET`, bootstrap JWT или access JWT.

### 5.2 Публичный контракт bridge

```http
POST /api/auth/exode/exchange
Content-Type: application/json

{
  "token": "eyJ...bootstrap...",
  "handshakeId": "ec150ba8-01a4-4db3-b61e-a1ca22d021ba",
  "parentOrigin": "https://exode.biz"
}
```

Ответ:

```json
{
  "token": "<LibreChat JWT>",
  "tokenExpiresAt": "2026-07-20T14:05:00.000Z",
  "mcpExpiresAt": "2026-07-20T14:30:00.000Z",
  "user": {
    "id": "687...",
    "email": "e14c27b934df7c0f9b728d4b3992d6fe14d3a44ca1f7f468c01b9e741fe37aa7@users.exode.invalid",
    "name": "Aslan Orlov",
    "provider": "exode",
    "role": "USER"
  }
}
```

Вместо связывания пользователей по реальному email используйте детерминированный технический email:

```ts
function exodeUserEmail(subject: string, normalizedIssuer: string): string {
  const identityHash = createHash('sha256').update(`${normalizedIssuer}\0${subject}`).digest('hex');
  return `${identityHash}@users.exode.invalid`;
}
```

Авторитетная связь identity:

```text
openidId     = Exode principalId (`identity.subject`)
openidIssuer = нормализованный issuer Exode
provider     = exode
```

Существующий уникальный индекс с привязкой к issuer по
`openidId + openidIssuer + tenantId` предотвращает дублирование пользователей. Нельзя использовать
fallback по email. `userUuid` — это identity metadata для аудита и downstream claims; он намеренно
не используется как ключ аккаунта LibreChat.

### 5.3 API-клиент main

Предлагаемый файл: `packages/api/src/auth/exode/client.ts`

```ts
export interface ExodeIdentity {
  subject: string;
  userId: number;
  userUuid: string;
  name: string;
  avatar?: string;
  schoolId?: number;
  sellerId?: number;
}

export interface ExodeExchangeResult {
  identity: ExodeIdentity;
  token: string;
  expiresAt: string;
}

export async function exchangeExodeBootstrap(input: {
  token: string;
  handshakeId: string;
  parentOrigin: string;
}): Promise<ExodeExchangeResult> {
  const response = await fetch(`${process.env.EXODE_MAIN_URL}/api/v2/auth/ai-chat/exchange`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-service-id': process.env.EXODE_MAIN_SERVICE_ID ?? '',
      'x-service-secret': process.env.EXODE_MAIN_SERVICE_SECRET ?? '',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Exode exchange failed with status ${response.status}`);
  }

  const body = await response.json();
  return body.payload as ExodeExchangeResult;
}
```

Логи ошибок могут содержать статус, request ID и timing, но не body запроса или ответа.

### 5.4 Канонический upsert Exode principal

Предлагаемый файл: `packages/api/src/auth/exode/user.ts`

```ts
export async function upsertExodeUser(
  identity: ExodeIdentity,
  deps: {
    findUser: UserMethods['findUser'];
    createUser: UserMethods['createUser'];
    updateUser: UserMethods['updateUser'];
    tenantId?: string;
  },
): Promise<IUser> {
  const criteria = {
    openidId: identity.subject,
    openidIssuer: normalizeOpenIdIssuer(process.env.EXODE_MAIN_ISSUER),
    tenantId: deps.tenantId,
  };

  const existing = await deps.findUser(criteria);
  const email = exodeUserEmail(identity.subject, criteria.openidIssuer);

  if (existing) {
    if (profileMatches(existing, identity, email)) {
      return existing;
    }
    return (await deps.updateUser(existing._id.toString(), {
      name: identity.name,
      avatar: identity.avatar,
      email,
      emailVerified: true,
      provider: 'exode',
    })) as IUser;
  }

  try {
    return (await deps.createUser(
      {
        ...criteria,
        email,
        name: identity.name,
        avatar: identity.avatar,
        emailVerified: true,
        provider: 'exode',
        role: SystemRoles.USER,
      },
      undefined,
      true,
      true,
    )) as IUser;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const concurrentlyCreated = await deps.findUser(criteria);
    if (!concurrentlyCreated) {
      throw error;
    }
    return concurrentlyCreated;
  }
}
```

Для существующих документов пользователей обязательно использовать `updateUser`, поскольку этот
метод инвалидирует auth-user cache. Если реализация использует другой метод изменения, перед
возвратом результата он обязан вызвать `invalidateAuthUserDocCache` для затронутого пользователя.

Нужно ли выставлять встроенным пользователям `termsAccepted=true`, является юридическим и
продуктовым решением. Нельзя неявно зашивать его в auth bridge.

### 5.5 Сохранение MCP credential

Следует использовать существующее зашифрованное хранилище PluginAuth. Текущий wrapper при ошибке
возвращает значение `Error`, поэтому bridge должен явно отклонить такой результат до выпуска
LibreChat JWT:

```ts
const pluginAuth = await updateUserPluginAuth(
  libreChatUser.id,
  'EXODE_AI_TOKEN',
  'mcp_exode',
  exodeResult.token,
);

if (pluginAuth instanceof Error) {
  throw pluginAuth;
}
```

Затем необходимо инвалидировать активное MCP-соединение так же, как это делает штатный контроллер
plugin credentials:

```ts
const mcpManager = getMCPManager();
await mcpManager.disconnectUserConnection(libreChatUser.id, 'exode');
await invalidateCachedTools({
  userId: libreChatUser.id,
  serverName: 'exode',
});
```

Отключение необходимо при обновлении токена и при смене пользователя Exode в уже смонтированном
iframe.

### 5.6 LibreChat JWT без refresh cookie в iframe

Встроенный flow должен выпускать access token напрямую и хранить его только в памяти iframe:

```ts
const libreChatToken = await generateToken(libreChatUser, embedJwtTtlMs);

return res.status(200).json({
  token: libreChatToken,
  tokenExpiresAt: new Date(Date.now() + embedJwtTtlMs).toISOString(),
  mcpExpiresAt: exodeResult.expiresAt,
  user: sanitizeUserForAuthResponse(libreChatUser),
});
```

Во встроенном flow нельзя вызывать `setAuthTokens`. Его refresh cookie с `SameSite=Strict`
ненадёжна на пользовательских доменах школ и в браузерах, ограничивающих стороннее хранилище iframe.

### 5.7 Тонкий Express route

Файл: `api/server/routes/auth.js`

```js
const { createExodeExchangeController } = require('@librechat/api');
const { findUser, createUser, updateUser, generateToken } = require('~/models');
const { updateUserPluginAuth } = require('~/server/services/PluginService');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { getMCPManager } = require('~/config');

router.post(
  '/exode/exchange',
  middleware.loginLimiter,
  createExodeExchangeController({
    findUser,
    createUser,
    updateUser,
    generateToken,
    updateUserPluginAuth,
    invalidateCachedTools,
    getMCPManager,
  }),
);
```

Точные пути импортов должны соответствовать текущим exports. Route остаётся только слоем подключения
зависимостей, а вся валидация и оркестрация размещается в TypeScript внутри `packages/api`.

## 6. Bridge на клиенте LibreChat

### 6.1 Протокол сообщений

```ts
export const EXODE_AI_CHAT_PROTOCOL = 1 as const;

export interface ExodeBridgeMessage<T = unknown> {
  protocol: typeof EXODE_AI_CHAT_PROTOCOL;
  source: 'exode-ai-chat' | 'exode-host';
  type: string;
  requestId: string;
  payload?: T;
}
```

Сообщения от iframe к родителю:

```text
exode-ai-chat:ready
exode-ai-chat:authenticated
exode-ai-chat:refresh-required
exode-ai-chat:error
```

Сообщения от родителя к iframe:

```text
exode-ai-chat:authenticate
exode-ai-chat:logout
```

Смена контекста не передаётся отдельным доверенным сообщением. Родитель запускает новый handshake и
получает новый bootstrap, в котором main заново подписывает school/seller-контекст. Закрытие чата
реализуется размонтированием iframe родителем.

### 6.2 Сообщение ready

```ts
const handshakeId = crypto.randomUUID();

window.parent.postMessage(
  {
    protocol: 1,
    source: 'exode-ai-chat',
    type: 'exode-ai-chat:ready',
    requestId: crypto.randomUUID(),
    payload: { handshakeId },
  } satisfies ExodeBridgeMessage,
  parentOrigin,
);
```

`parentOrigin` должен поступать из конфигурации с allowlist или из выданной сервером embed-конфигурации.
Использовать `'*'` запрещено.

### 6.3 Получение аутентификации

```ts
function handleMessage(event: MessageEvent): void {
  if (event.source !== window.parent) {
    return;
  }

  if (!allowedParentOrigins.has(event.origin)) {
    return;
  }

  const message = parseExodeBridgeMessage(event.data);
  if (!message || message.source !== 'exode-host') {
    return;
  }

  if (message.type === 'exode-ai-chat:authenticate') {
    void exchangeAndLogin({
      ...message.payload,
      parentOrigin: event.origin,
    });
  }

  if (message.type === 'exode-ai-chat:logout') {
    clearEmbeddedSession();
  }
}
```

Для данных сообщения необходимо использовать schema validator. Для входных данных из другого окна
нельзя полагаться на TypeScript casts.

### 6.4 Установка сессии LibreChat

Сейчас `AuthContext` хранит токен в state и вызывает `setTokenHeader`. Вместо отправки нетипизированного
глобального события следует добавить явный публичный метод:

```ts
const acceptExternalSession = useCallback(
  (data: TLoginResponse) => {
    setError(undefined);
    setUserContext({
      token: data.token,
      user: data.user,
      isAuthenticated: true,
      redirect: '/c/new',
    });
  },
  [setUserContext],
);
```

Добавьте `acceptExternalSession` в `TAuthContext`, после чего bridge сможет выполнить:

```ts
const response = await fetch('/api/auth/exode/exchange', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token, handshakeId, parentOrigin }),
});

const session = await response.json();
acceptExternalSession(session);
scheduleRefresh(session);
```

Во встроенном режиме необходимо пропустить штатный cookie-based flow `silentRefresh()` и вместо
него запросить новый токен у родителя.

### 6.5 Планирование обновления

```ts
function refreshAt(session: EmbedSession): number {
  return Math.min(
    Date.parse(session.tokenExpiresAt) - 90_000,
    Date.parse(session.mcpExpiresAt) - 120_000,
  );
}

function scheduleRefresh(session: EmbedSession): void {
  const delay = Math.max(0, refreshAt(session) - Date.now());

  refreshTimer = window.setTimeout(() => {
    const handshakeId = crypto.randomUUID();
    postToParent('exode-ai-chat:refresh-required', { handshakeId });
  }, delay);
}
```

Следует использовать один активный таймер и очищать его при refresh, logout и unmount компонента.

## 7. `exode-app`

### 7.1 Конфигурация

```ts
export const aiChatConfig = {
  appId: 'ai-chat',
  url: IS_PROD ? 'https://ai.exode.biz/embed/exode' : 'http://localhost:3080/embed/exode',
  allowedOrigins: IS_PROD ? ['https://ai.exode.biz'] : ['http://localhost:3080'],
};
```

### 7.2 Реализация host

`AiChatHost` следует построить на существующих соглашениях протокола `MiniAppHost`. До выпуска
любого токена он обязан проверить и окно iframe, и origin.

```ts
export class AiChatHost {
  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly allowedOrigins: Set<string>,
  ) {
    window.addEventListener('message', this.handleMessage);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
  }

  logout(): void {
    this.send('exode-ai-chat:logout', {});
  }

  private handleMessage = async (event: MessageEvent): Promise<void> => {
    if (event.source !== this.iframe.contentWindow || !this.allowedOrigins.has(event.origin)) {
      return;
    }

    const message = parseAiChatBridgeMessage(event.data);
    if (!message || message.source !== 'exode-ai-chat') {
      return;
    }

    if (
      message.type === 'exode-ai-chat:ready' ||
      message.type === 'exode-ai-chat:refresh-required'
    ) {
      await this.authenticate(event.origin, message);
    }
  };

  private async authenticate(
    origin: string,
    message: ExodeBridgeMessage<{ handshakeId: string }>,
  ): Promise<void> {
    const token = await UserJwtService.issueServiceToken(
      ServiceJwtPurpose.AiChatBootstrap,
      message.payload.handshakeId,
      { useCache: false },
    );

    if (!token) {
      return;
    }

    this.send(
      'exode-ai-chat:authenticate',
      {
        token,
        handshakeId: message.payload.handshakeId,
      },
      message.requestId,
      origin,
    );
  }

  private send(
    type: string,
    payload: unknown,
    requestId = crypto.randomUUID(),
    origin?: string,
  ): void {
    const targetOrigin = origin ?? aiChatConfig.allowedOrigins[0];

    this.iframe.contentWindow?.postMessage(
      {
        protocol: 1,
        source: 'exode-host',
        type,
        requestId,
        payload,
      },
      targetOrigin,
    );
  }
}
```

Кэш service token намеренно обходится, поскольку каждый handshake ID является одноразовым.

### 7.3 Компонент страницы

```tsx
const AiChatPage = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const host = new AiChatHost(iframe, new Set(aiChatConfig.allowedOrigins));

    return () => host.destroy();
  }, []);

  return <Iframe ref={iframeRef} src={aiChatConfig.url} withSpinner />;
};
```

Существующие проверки source/origin в `Iframe` должны сохраниться. AI host дополнительно проверяет
те же ограничения перед отправкой credential.

## 8. `exode-backend-ms-ai`

### 8.1 Проксирование MCP-запросов

Логику аутентификации не следует дублировать в Python. Существующее поведение сохраняется:

```py
context = context_from_headers(incoming_headers)
await graphql_client.execute(query, variables, context)
```

Main проверяет bearer token и восстанавливает подписанный school/seller-контекст.

### 8.2 MCP-конфигурация LibreChat

```yaml
mcpServers:
  exode:
    type: streamable-http
    url: http://ai-chat-mcp:50054/mcp

    headers:
      Authorization: 'Bearer {{EXODE_AI_TOKEN}}'
      x-user-id: '{{LIBRECHAT_USER_ID}}'
      x-agent-id: '{{LIBRECHAT_AGENT_ID}}'

    customUserVars:
      EXODE_AI_TOKEN:
        title: Токен доступа Exode AI
        description: Управляется Exode iframe bridge
        sensitive: true

    timeout: 60000
```

В production нельзя сохранять `${EXODE_ADMIN_TOKEN}`, `${EXODE_SCHOOL_ID}` или
`${EXODE_SELLER_ID}`.

### 8.3 Созданием пользователей LibreChat управляет bridge

Нельзя создавать пользователей LibreChat из `ms-ai`. Текущий или предлагаемый flow `ProvisionUser`
не содержит канонический `principalId` с привязкой к school/seller, конкурирует с provisioning при
входе и может создать второй аккаунт по email.

Bridge `/api/auth/exode/exchange` является единственным владельцем создания пользователей LibreChat.
Он уже получает подписанный контекст от main и может в рамках одной операции выполнить канонический
upsert, сохранить MCP credential и вернуть JWT. После включения bridge вызов `ProvisionUser` нужно
удалить из `KnowledgeService`. `ms-ai` должен хранить Exode `userUuid` только для собственного
аудита и доменных связей, но не как ID аккаунта LibreChat.

Если предварительный provisioning станет обязательным продуктовым требованием, следует открыть
принадлежащий main внутренний endpoint, возвращающий `principalId`, и вызывать тот же внутренний
upsert-сервис LibreChat. Нельзя повторно реализовывать вычисление principal или использовать
публичную регистрацию из `ms-ai`.

### 8.4 Изоляция агентов

В multi-school deployment следует использовать отдельного агента LibreChat для каждой границы
школы или базы знаний и предоставлять его только подходящим пользователям LibreChat.

`x-agent-id` должен быть авторитетным источником:

```py
header_agent_id = _agent_id(ctx)

if requested_agent_id and requested_agent_id != header_agent_id:
    return _err("Agent scope mismatch")
```

Модель не должна иметь возможности передать произвольный другой `agent_id` в knowledge tools.

## 9. Правила безопасности

### 9.1 Проверка origin

Обе стороны проверяют `event.source` и точный нормализованный origin. Wildcard-значения запрещены
для auth-сообщений.

Ответы LibreChat для `/embed/exode` должны содержать CSP, например:

```http
Content-Security-Policy: frame-ancestors https://exode.biz https://*.exode.biz
```

Пользовательские домены школ требуют явного allowlist или отдельного CSP для deployment. Одна лишь
проверка `postMessage` не заменяет `frame-ancestors`.

### 9.2 Работа с токенами

- Редактировать или скрывать `authorization`, `token`, `x-service-secret` и значения PluginAuth в логах.
- Отклонять body exchange-запроса, превышающий небольшой фиксированный лимит.
- Применять rate limit по IP и нормализованному origin родителя.
- Использовать `SET NX` для поглощения bootstrap `jti`.
- Не переходить к поиску непрозрачной сессии, если JWT-подобный токен не прошёл сервисную валидацию.
- Никогда не возвращать `AiChatAccess` в `exode-app`; его получает только LibreChat server-to-server.
- Никогда не раскрывать внутренний сервисный секрет ни одному из браузерных приложений.

### 9.3 Область действия principal

Bearer `AiChatAccess` не является обычным пользовательским сессионным токеном. Main принимает его
только в GraphQL и записывает principal/purpose в metadata запроса для policy и audit logs.

Один пользователь LibreChat представляет один контекст авторизации Exode
`(userUuid, schoolId, sellerId)`. Это намеренно более узкая сущность, чем один физический аккаунт.
Если в будущем продукт потребует общих диалогов между контекстами, сначала необходимо перенести MCP
credential из пользовательского хранилища `PluginAuth` в канал credentials уровня запроса или
сессии. Объединять principals без такого изменения небезопасно.

## 10. Контракт ошибок

LibreChat должен преобразовывать ошибки main в стабильные безопасные для браузера коды:

| HTTP | Код                 | Значение                                                           |
| ---: | ------------------- | ------------------------------------------------------------------ |
|  400 | `INVALID_HANDSHAKE` | Некорректный запрос или несовпадение nonce                         |
|  401 | `BOOTSTRAP_INVALID` | Некорректный, истёкший или повторно использованный bootstrap token |
|  403 | `AI_CHAT_FORBIDDEN` | Пользователь или tenant не имеет доступа к AI chat                 |
|  409 | `IDENTITY_CONFLICT` | Внешнюю identity нельзя безопасно связать                          |
|  429 | `AI_CHAT_LIMIT`     | Достигнут rate limit или usage limit                               |
|  502 | `EXODE_UNAVAILABLE` | Ошибка обмена с main                                               |
|  500 | `INTERNAL_ERROR`    | Неожиданная локальная ошибка                                       |

Пример уведомления родителя:

```ts
postToParent('exode-ai-chat:error', {
  code: 'BOOTSTRAP_INVALID',
  retryable: true,
});
```

Нельзя отправлять stack trace или upstream response body через `postMessage`.

## 11. Обязательные тесты

### 11.1 `exode-backend-main`

- выпуск bootstrap для активной обычной сессии;
- отклонение выпуска `AiChatAccess` из браузера;
- отклонение неверных purpose/audience/issuer/signature;
- отклонение истёкшего bootstrap;
- отклонение несовпадающих handshake ID и parent origin;
- отклонение повторного поглощения `jti`;
- отклонение завершённой сессии;
- выпуск access token с определёнными на сервере school/seller;
- перезапись поддельных входящих tenant headers;
- повторная проверка доступа продавца;
- сохранение штатной непрозрачной аутентификации без изменений;
- отклонение запрещённых AI-chat мутаций;
- разрешение той же мутации из обычной пользовательской сессии, если её допускает RBAC.

### 11.2 Сервер LibreChat

- корректный exchange создаёт пользователя только один раз;
- конкурентные первые exchange-запросы создают одного пользователя;
- один UUID в двух разных school/seller-контекстах создаёт два изолированных principal LibreChat;
- поиск identity никогда не использует fallback по email;
- синхронизация профиля существующего пользователя применяет методы изменения с инвалидацией кэша;
- значение PluginAuth зашифровано при хранении;
- обновление credential отключает MCP-соединение и инвалидирует tools;
- исходные токены и сервисные секреты отсутствуют в логах;
- некорректный ответ main не сохраняется частично;
- при смене пользователя Exode нельзя повторно использовать credential предыдущего пользователя.

### 11.3 Клиент LibreChat

- отправляет ready только в embed-режиме;
- отклоняет сообщения родителя с неверными origin/window/source/protocol;
- устанавливает возвращённую сессию LibreChat;
- не запускает cookie-based `silentRefresh` в embed-режиме;
- выполняет refresh до истечения обоих токенов;
- использует только один refresh timer;
- очищает аутентификацию при logout родителя или unmount;
- никогда не записывает bootstrap/access tokens в URL или браузерное хранилище.

### 11.4 exode-app

- отклоняет сообщения от соседнего iframe;
- отклоняет корректный тип сообщения с неверного origin;
- привязывает bootstrap `resourceId` к полученному handshake ID;
- обходит кэш токенов для каждого handshake;
- отправляет сообщения с точным target origin;
- отправляет logout при завершении сессии Exode.

### 11.5 Сквозные end-to-end тесты

Необходимо как минимум проверить следующие сценарии, включая параллельное выполнение:

1. Пользователь A / школа A и пользователь B / школа B выполняют одинаковый запрос данных и
   получают изолированные результаты.
2. Два менеджера продавцов используют разные `seller-id` без перекрёстного доступа.
3. Сессия Exode завершается при открытом LibreChat; следующий MCP-вызов отклоняется.
4. Скопированный bootstrap JWT используется повторно; второй exchange отклоняется.
5. Access token и LibreChat JWT обновляются без закрытия диалога.
6. Iframe работает на пользовательском домене Exode при отключённых third-party cookies.
7. Пользователь без agent ACL не может открыть агента базы знаний другой школы или выполнить к нему
   запрос.

## 12. Порядок реализации

1. JWT purposes и claims в main, одноразовое поглощение и exchange endpoint.
2. Principal `AiChatAccess` и operation guard для GraphQL в main.
3. TypeScript exchange service LibreChat и канонический upsert контекстного principal.
4. Обновление/reconnect PluginAuth в LibreChat и ответ с короткоживущим JWT.
5. Встроенный client bridge LibreChat и `AuthContext.acceptExternalSession`.
6. `AiChatHost` и iframe-страница в `exode-app`.
7. MCP-конфигурация `ms-ai` и удаление дублирующего пути provisioning LibreChat.
8. Усиление agent ACL и изоляции.
9. Межрепозиторные end-to-end тесты и тесты безопасности.

Статический deployment с `EXODE_ADMIN_TOKEN` разрешён только как явно включаемый fallback для
локальной разработки. Его нельзя настраивать в staging или production.

## 13. Текущее состояние реализации

В этом репозитории реализованы шаги 3–5:

- server-to-server exchange, проверка конфигурации и безопасное преобразование ошибок находятся в
  `packages/api/src/auth/exode`;
- thin routes доступны как `GET /api/auth/exode/config` и `POST /api/auth/exode/exchange`;
- identity ищется только по `openidId + openidIssuer + tenantId`, а технический email строится как
  SHA-256 от issuer и subject;
- изменение профиля выполняется через cache-invalidating `updateUser`, неизменившийся профиль не
  записывается повторно;
- `AiChatAccess` сохраняется зашифрованным в `PluginAuth`, после обновления отключается старое
  MCP-соединение и инвалидируется кэш tools;
- `/embed/exode` использует in-memory LibreChat JWT, строгую проверку `postMessage` и собственный
  refresh handshake без cookie refresh;
- CSP `frame-ancestors`, лимит exchange body, переменные окружения и MCP-конфигурация добавлены в
  примеры deployment-конфигурации.

Для работоспособного end-to-end потока всё ещё обязательны шаги 1–2 и 6–9 в соседних репозиториях.
До появления exchange endpoint в `exode-backend-main` LibreChat ожидаемо будет отвечать
`EXODE_UNAVAILABLE`, а без host bridge в `exode-app` iframe останется на состоянии ожидания ready.
