# Threat model Labpics ID (STRIDE по контекстам)

> Каркасный анализ (ch01-scaffold). Полная модель строится вместе с главами,
> реализующими аутентификацию, авторизацию и данные. Здесь зафиксированы
> уже применимые решения и классы угроз, которые эти решения закрывают.

## Принципы

- Никаких секретов в репозитории; `.env.example` — только плейсхолдеры.
- Логирование и error envelope: клиенту никогда не утекают stack traces и
  внутренние детали (`apps/api/src/middleware/error-envelope.ts`).
- CORS — только canonical HTTP(S) origin allowlist из окружения; wildcard,
  credentials в URL, path/query/fragment, malformed и duplicates запрещены,
  production требует явное значение.
- Better Auth изолирован за port wrapper; прямой импорт вне adapter-модулей
  запрещён тестом `apps/api/src/gates.test.ts`.
- Домен чистый; внешние эффекты — только через порты (audit, outbox).

## Identity (аутентификация/сессии)

| Threat | Стратегия каркаса | Гейт |
|---|---|---|
| **Spoofing**: подделка сессии/токена | production требует не-fallback secret и запрещает memory adapter; Better Auth за wrapper | ch-auth (OIDC/OAuth 2.1) |
| **Tampering**: изменение сессии | Signed cookies/jwt — владение Better Auth; наш код не подписывает сам | ch-auth |
| **Repudiation**: отрицание действий | `audit_events` (append-only, hash chain) — заготовка таблицы | ch-audit |
| **Information disclosure**: утечка внутренностей | error envelope без stack; pino-логи уровня `info` | уже в каркасе |
| **Denial of service**: зависшее cancellation-aware I/O | timeout aborts request signal и возвращает 504 | каркас; CPU/rate limits — не закрыты |
| **Elevation**: повышение привилегий | RBAC-модель — собственная (role/permission), не полагаться на клиентские роли | ch-org |

## Organization Access (RBAC, product access)

| Threat | Стратегия | Гейт |
|---|---|---|
| **Spoofing**: подделка субъекта | Доменный агрегат `ProductAccess` + типизированные ID; проверка на сервере | ch-org |
| **Tampering**: изменение гранта | Immutable-агрегат; revoke/expiry в доменных инвариантах | уже в каркасе (домен) |
| **Elevation**: cross-tenant role assignment | composite `(organization_id, role_id)` FK; membership unique per `(organization_id, user_id)` | каркас + real Postgres test |
| **Repudiation**: выдача/отзыв доступа без следа | Порт `AuditLogPort` → `audit_events` | ch-audit |

## Audit & Compliance

| Threat | Стратегия | Гейт |
|---|---|---|
| **Tampering**: переписывание журнала | Hash chain (`prev_hash` → `hash`); `audit_events` append-only | ch-audit |
| **Repudiation**: отрицание аудит-факта | Цепочка хэшей + неизменяемость | ch-audit |
| **DoS**: потеря событий при сбое | Общий `TransactionContext`; at-least-once outbox требует idempotent consumer | контракт каркаса; dispatcher — ch-outbox |

## HTTP-граница (API)

| Threat | Стратегия | Статус |
|---|---|---|
| **Spoofing**: подделка origin | CORS-allowlist, preflight 403 для чужих origin | каркас |
| **Information disclosure**: утечка stack | error envelope, `internal_error` без деталей | каркас |
| **DoS**: зависшие запросы | AbortController signal + 504; код, игнорирующий signal, не останавливается | каркас, ограниченная гарантия |
| **Log injection/cardinality** через request-id | доверяется только `^[A-Za-z0-9_-]{1,64}$`, иначе UUID | каркас |
| **Replay**: повтор запроса | request-id не является replay-защитой; нужна отдельная идемпотентность | ch-backend |
| **Injection**: входные данные | Zod-контракты в `contracts`; validate at boundary | каркас (health/ready) |

## Web edge (proxy)

| Threat | Стратегия | Статус |
|---|---|---|
| **Tampering/Spoofing** сессии на edge | proxy использует cookie presence только как navigation hint и ставит явный `cookie-present-unverified`; это не authentication/authorization | каркас; все protected data проверяют сессию server-side |
| **Information disclosure** на edge | Нет доступа к данным/секретам на edge | каркас |

## Не закрыто каркасом (осознанно)

- Криптография подписей, token rotation, MFA, PKCE, rate limiting на
  авторизации — главы auth/security.
- Проверка пароля/brute-force защита — главы auth.
- Шифрование at rest/в транзите (TLS) — инфраструктурная глава + GitOps.
- `oidc-provider` ещё не реализован: G20 требует отдельный внутренний Node LTS
  process, durable adapter/JWKS и собственный OIDF gate. Bun core не становится
  protocol provider и не получает второй writable identity SSOT.
