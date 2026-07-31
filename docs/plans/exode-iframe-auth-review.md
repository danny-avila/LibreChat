# Code review: Exode iframe auth

Дата: 2026-07-31
Ветка: `exode`
Ревьюер: Claude (Opus 4.8)
Объём: весь uncommitted diff по фиче встраивания LibreChat в iframe Exode с авторизацией через `postMessage`.

Файлы не менялись — только чтение diff, новых файлов и прогон тестов.

## Статус проверки

- Backend-тесты `packages/api/src/auth/exode`: **17/17 зелёные**.
- Client-тесты `client/src/components/Exode` + `AuthContext.spec`: **31/31 зелёные**.

## Общая оценка

Архитектурно аккуратно: логика вынесена в `packages/api/src/auth/exode` с DI через `deps`,
`/api` остался тонкой обвязкой (роут + подключение контроллеров), zod-валидация на обеих
границах, ошибки нормализованы в замкнутый набор кодов, `postMessage` проверяет
`event.source === window.parent` **и** origin. Уровень выше среднего для подобных интеграций.

Ниже — все замечания, сгруппированные по критичности. Отмечены обязательные к устранению
перед мержем.

---

## Блокеры (обязательно перед мержем)

### B1. Сессия рвётся после отправки первого сообщения

- **Где:** `client/src/routes/index.tsx:27` (монтирование `ExodeBridge` по условию),
  `client/src/components/Exode/Bridge.tsx:168` (cleanup вызывает `clearExternalSession()`),
  `client/src/hooks/SSE/useEventHandlers.ts:859-861` (непропатченная навигация).
- **Суть:** `ExodeBridge` монтируется только когда `isExodeEmbedLocation(pathname, search)`
  истинно, а его `useEffect` cleanup безусловно зовёт `clearExternalSession()`. Значит любая
  навигация, теряющая `?embed=exode`, разлогинивает пользователя.
- **Сценарий отказа:** после первого ответа модели `useEventHandlers.ts:859` проверяет
  `location.pathname === '/c/${Constants.NEW_CONVO}'` (query не учитывается), условие истинно,
  `navigate('/c/<id>', { replace: true })` уходит без `embed` → мост размонтируется →
  `clearExternalSession()` → `Root` возвращает `null` при `!isAuthenticated` → белый экран.
  Мост уже не смонтирован, повторный handshake не инициируется — восстановиться нельзя.
- **Пропатчен только один переход:** `client/src/hooks/Chat/useChatFunctions.ts:405-412`.
- **Непропатченные `navigate` на `/c/*`, теряющие `embed`:**
  - `client/src/hooks/SSE/useEventHandlers.ts:689`
  - `client/src/hooks/SSE/useEventHandlers.ts:754`
  - `client/src/hooks/SSE/useEventHandlers.ts:861`
  - `client/src/hooks/Conversations/useNavigateToConvo.tsx:68`
  - `client/src/hooks/Conversations/useNavigateToConvo.tsx:73`
  - `client/src/hooks/Conversations/useNavigateToConvo.tsx:132`
  - `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx:92`
  - `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx:210`
  - `client/src/components/Conversations/ConvoOptions/DeleteButton.tsx:60`
  - `client/src/components/Nav/SearchBar.tsx:37`
  - `client/src/hooks/useKeyboardShortcuts.ts:636`
- **Рекомендация:** не патчить каждый `navigate` точечно (следующий upstream-merge принесёт
  новые). Либо развязать жизненный цикл моста от URL (определить embed-режим один раз при
  загрузке документа и держать в контексте / `sessionStorage`), либо смонтировать
  `ExodeBridge` выше по дереву безусловно, а `isExodeEmbedLocation` использовать только для
  UI-скрытия (Banner / Sidebar / shortcuts).

### B2. `clearExternalSession` не чистит данные предыдущего пользователя

- **Где:** `client/src/hooks/AuthContext.tsx:122-130`.
- **Суть:** `clearExternalSession` делает только `setTokenHeader(undefined)` +
  `setUserContext(пусто)`. Штатный `logout` дополнительно вызывает
  `clearAllConversationStorage()` и сбрасывает кэш.
- **Сценарий отказа:** при смене пользователя в хосте (`exode-ai-chat:logout` → новый
  `authenticate` в том же iframe) остаются react-query кэш и localStorage-переписки прошлого
  пользователя → утечка данных между аккаунтами.
- **Рекомендация:** переиспользовать очистку из `logout` (storage + query cache) внутри
  `clearExternalSession`.

### B3. CSP `frame-ancestors` открывается тривиально

- **Где:** `packages/api/src/auth/exode/config.ts:107` (`isExodeEmbedRequest`),
  `api/server/index.js:182-184`, `api/server/experimental.js:362-364`,
  `client/src/components/Exode/protocol.ts:43` (`isExodeEmbedLocation`).
- **Суть:** серверный `isExodeEmbedRequest` сравнивает `req.query.embed === 'exode'`. При
  `?embed=exode&embed=x` Express даёт массив `['exode','x']`, сравнение со строкой = `false`
  → заголовок CSP не ставится. Клиентский `isExodeEmbedLocation` использует
  `URLSearchParams.get('embed')` → возвращает первое значение `'exode'` → мост всё равно
  активируется.
- **Дополнительно:** глобального `X-Frame-Options` / `frame-ancestors` в проекте нет
  (единственные вхождения — эти две новые строки). На всех прочих ответах защита от фрейминга
  отсутствует.
- **Последствие:** аутентифицироваться атакующий не сможет (origin проверяется в
  `handleMessage`), но кликджекинг уже открытой сессии возможен.
- **Рекомендация:** нормализовать значение (`Array.isArray(v) ? v[0] : v`) на сервере и
  поставить `frame-ancestors 'none'` дефолтом для всех остальных HTML-ответов.

### B4. У exode-пользователей не создаётся баланс

- **Где:** `packages/api/src/auth/exode/user.ts:78-88`,
  `packages/data-schemas/src/methods/user.ts:219`.
- **Суть:** `upsertExodeUser` вызывает `createUser({...}, undefined, true, false)` —
  `balanceConfig === undefined`, поэтому блок создания Balance в `createUser` пропускается.
- **Сценарий отказа:** если в деплое включён `CHECK_BALANCE`, первый же запрос упирается в
  отсутствующую/нулевую запись баланса. Остальные пути регистрации передают `balanceConfig`
  из `appConfig`.
- **Рекомендация:** пробросить `balanceConfig` из appConfig в `deps` и передать в `createUser`.

---

## Существенное

### S1. `parentOrigin` в теле запроса — не доказательство происхождения

- **Где:** `packages/api/src/auth/exode/controller.ts:31` (`normalizeAndAuthorizeOrigin`).
- **Суть:** валидируется поле `parentOrigin`, которое полностью контролирует вызывающий. Любой
  может дёрнуть `POST /api/auth/exode/exchange` с украденным bootstrap-токеном и
  `parentOrigin: "https://exode.biz"`. Реальная защита держится на том, что backend-main
  делает токен одноразовым, короткоживущим и проверяет `handshakeId`.
- **Проблема:** это требование к контракту нигде не зафиксировано (ни в коде, ни в
  `docs/plans/2026-07-20-...`). Без него схема ломается.
- **Рекомендация:** зафиксировать контракт с backend-main письменно; проверку origin оставить
  как defense-in-depth, но не считать её защитой.

### S2. Возможный бесконечный цикл handshake раз в секунду

- **Где:** `client/src/components/Exode/Bridge.tsx:44-48` (`getRefreshDelay`).
- **Суть:** `Math.max(1_000, Math.min(tokenRefreshAt, mcpRefreshAt) - Date.now())`. Если
  backend-main вернёт `mcpExpiresAt` в прошлом или близко (текущий запас −120_000 мс — уже
  граница), delay схлопывается в 1000 мс и мост шлёт `refresh-required` каждую секунду
  бесконечно, дёргая обмен и MCP-реконнект.
- **Дополнительно:** ретраев при ошибках обмена нет ни в одном сценарии.
- **Рекомендация:** ограничить число попыток / экспоненциальный backoff; ввести нижний порог
  «разумного» TTL и логировать аномальный `expiresAt`.

---

## Помельче

### M1. Лишняя запись в БД на каждом обмене

- **Где:** `packages/api/src/auth/exode/user.ts:36` (`needsProfileUpdate`).
- **Суть:** сравнивается `user.avatar !== identity.avatar`. `identity.avatar` опционален; если
  backend-main его не отдаёт, а mongoose хранит `''`/`null`, условие вечно истинно →
  `updateUser` выполняется на каждом handshake (каждые ~5 мин на пользователя).
- **Рекомендация:** сравнивать с нормализацией пустых значений (`?? ''`).

### M2. `EXODE_MAIN_URL` без хвостового слэша тихо ломается

- **Где:** `packages/api/src/auth/exode/client.ts:23`, `config.ts:82`.
- **Суть:** `new URL('api/v2/auth/ai-chat/exchange', 'https://api.exode.biz/v1')` даёт
  `https://api.exode.biz/api/v2/...` — базовый путь съедается.
- **Рекомендация:** валидировать trailing slash в `getExodeAuthConfig` либо конкатенировать
  путь явно.

### M3. `http:` разрешён для секрета

- **Где:** `packages/api/src/auth/exode/config.ts:25-26` (origins),
  `config.ts:83-84` (`EXODE_MAIN_URL`).
- **Суть:** `http:` допустим и для `EXODE_MAIN_URL`, и для origins. `x-service-secret` при
  этом уходит открытым текстом.
- **Рекомендация:** требовать `https:` для не-localhost хостов.

### M4. Нет валидации конфига на старте + парсинг на каждый ответ

- **Где:** `packages/api/src/auth/exode/config.ts` (`getExodeAuthConfig`,
  `getExodeFrameAncestors`).
- **Суть:** `getExodeAuthConfig()` бросает на каждом запросе — опечатка в env превращается в
  500 `INTERNAL_ERROR` вместо явного отказа при загрузке. `getExodeFrameAncestors()` парсит
  env и конструирует `URL` на **каждый** HTML-ответ.
- **Рекомендация:** валидировать и кэшировать конфиг один раз при старте.

### M5. Тесты противоречат CLAUDE.md («real logic over mocks»)

- **Где:** `packages/api/src/auth/exode/controller.spec.ts` (мок `@librechat/data-schemas` и
  `librechat-data-provider` через `{ virtual: true }`),
  `packages/api/src/auth/exode/user.spec.ts` (фейковые `deps`, без `mongodb-memory-server`).
- **Суть:** самая интересная ветка — гонка `createUser → E11000 → findUser`, ради которой
  написан `isDuplicateKeyError` (`user.ts:20`), — на моках не проверяется в принципе.
- **Рекомендация:** покрыть upsert реальным `mongodb-memory-server` с проверкой дубликата
  ключа и обновления профиля.

### M6. Дублирование типа пользователя

- **Где:** `packages/api/src/auth/exode/types.ts:50` (`ExodeExchangeUser`) против
  `packages/data-provider/src/types.ts` (`TExodeExchangeResponse.user: TUser`).
- **Суть:** `ExodeExchangeUser` — по сути `TUser` с другим набором полей, тогда как
  data-provider объявляет `user` как `TUser`. Два описания одной сущности разъедутся;
  CLAUDE.md это прямо запрещает.
- **Рекомендация:** переиспользовать/расширять `TUser` вместо отдельного типа.

### M7. Порядок импортов нарушает правило «длинные → короткие»

- **Где:** `client/src/routes/Root.tsx` (импорт `~/components/Exode` дописан в конец),
  `client/src/routes/index.tsx` (аналогично).
- **Рекомендация:** пересортировать локальные импорты по правилу из CLAUDE.md.

---

## Приоритеты перед мержем

- **Обязательно:** B1, B2, B3, B4.
- **Зафиксировать письменно контракт с backend-main** (одноразовость и короткоживучесть
  bootstrap-токена, гарантии по `expiresAt`) и добавить backoff: S1, S2.
- **Вдогонку:** M1–M7.
