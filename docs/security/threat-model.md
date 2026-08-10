# Threat model Labpics ID (STRIDE по контекстам)

> Каркасный анализ (ch01-scaffold). Полная модель строится вместе с главами,
> реализующими аутентификацию, авторизацию и данные. Здесь зафиксированы
> уже применимые решения и классы угроз, которые эти решения закрывают.

## Принципы

- Никаких секретов в репозитории; `.env.example` — только плейсхолдеры.
- Логирование и error envelope: клиенту никогда не утекают stack traces и
  внутренние детали (`apps/api/src/middleware/error-envelope.ts`).
- CORS — только allowlist из окружения (`CORS_ALLOWED_ORIGINS`).
- Better Auth изолирован за port wrapper; прямой импорт вне adapter-модулей
  запрещён тестом `apps/api/src/gates.test.ts`.
- Домен чистый; внешние эффекты — только через порты (audit, outbox).

## Identity (аутентификация/сессии)

| Threat | Стратегия каркаса | Гейт |
|---|---|---|
| **Spoofing**: подделка сессии/токена | `BETTER_AUTH_SECRET` обязателен вне dev; Better Auth за wrapper | ch-auth (OIDC/OAuth 2.1) |
| **Tampering**: изменение сессии | Signed cookies/jwt — владение Better Auth; наш код не подписывает сам | ch-auth |
| **Repudiation**: отрицание действий | `audit_events` (append-only, hash chain) — заготовка таблицы | ch-audit |
| **Information disclosure**: утечка внутренностей | error envelope без stack; pino-логи уровня `info` | уже в каркасе |
| **Denial of service**: brute-force/флуд | request timeout middleware, 504 envelope | уже в каркасе |
| **Elevation**: повышение привилегий | RBAC-модель — собственная (role/permission), не полагаться на клиентские роли | ch-org |

## Organization Access (RBAC, product access)

| Threat | Стратегия | Гейт |
|---|---|---|
| **Spoofing**: подделка субъекта | Доменный агрегат `ProductAccess` + типизированные ID; проверка на сервере | ch-org |
| **Tampering**: изменение гранта | Immutable-агрегат; revoke/expiry в доменных инвариантах | уже в каркасе (домен) |
| **Elevation**: расширение прав | `permission` привязан к `organization_id`; скоуп в `product_access` | ch-org |
| **Repudiation**: выдача/отзыв доступа без следа | Порт `AuditLogPort` → `audit_events` | ch-audit |

## Audit & Compliance

| Threat | Стратегия | Гейт |
|---|---|---|
| **Tampering**: переписывание журнала | Hash chain (`prev_hash` → `hash`); `audit_events` append-only | ch-audit |
| **Repudiation**: отрицание аудит-факта | Цепочка хэшей + неизменяемость | ch-audit |
| **DoS**: потеря событий при сбое | Транзакционный `outbox` | ch-outbox |

## HTTP-граница (API)

| Threat | Стратегия | Статус |
|---|---|---|
| **Spoofing**: подделка origin | CORS-allowlist, preflight 403 для чужих origin | каркас |
| **Information disclosure**: утечка stack | error envelope, `internal_error` без деталей | каркас |
| **DoS**: зависшие запросы | timeout middleware (504) | каркас |
| **Replay**: повтор запроса | request-id + будущая идемпотентность | ch-backend |
| **Injection**: входные данные | Zod-контракты в `contracts`; validate at boundary | каркас (health/ready) |

## Web edge (proxy)

| Threat | Стратегия | Статус |
|---|---|---|
| **Tampering/Spoofing** сессии на edge | `src/proxy.ts` смотрит только cookie, без DB; финальный cookie-name — Better Auth | каркас |
| **Information disclosure** на edge | Нет доступа к данным/секретам на edge | каркас |

## Не закрыто каркасом (осознанно)

- Криптография подписей, token rotation, MFA, PKCE, rate limiting на
  авторизации — главы auth/security.
- Проверка пароля/brute-force защита — главы auth.
- Шифрование at rest/в транзите (TLS) — инфраструктурная глава + GitOps.
