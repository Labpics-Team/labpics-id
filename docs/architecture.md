# Архитектура Labpics ID

> Документ описывает каркас (ch01-scaffold) эпика `labpics-identity`: bounded
> contexts, правила зависимостей и инвариант единственного источника истины
> (SSOT). Детали реализации следующих глав уточняются в их собственных
> разделах/ADRs.

## Проблема и принцип

Labpics ID — инфраструктурный продукт: платформа идентификации и доступа
(OIDC/OAuth 2.1, организации, RBAC, MFA, admin-UI), которой пользуются остальные
системы Labpics. Это **одна версионируемая release-unit**, но после решения G20
она содержит два процесса: Bun core (`apps/api`) и внутренний Node LTS Protocol
adapter на `oidc-provider`. У них совместный rollout/rollback, один публичный
issuer и платформенные SSOT; отдельный публичный issuer или client registry
запрещён. Сам Node-процесс реализуется только в ch03, не этим scaffold PR.

Инварианты архитектуры:

1. **Зависимости направлены внутрь.** `packages/domain` — чистое ядро без
   framework/DB/HTTP (проверяется `scripts/check-domain-gate`). Инфраструктура
   (API, БД, HTTP) реализует порты домена.
2. **Один источник истины (SSOT) на каждый факт.** Любой факт имеет ровно одно
   авторитетное хранилище. Копии допускаются только как производные и
   синхронизируются через transactional outbox с at-least-once delivery;
   потребитель обязан дедуплицировать `idempotencyKey`.
3. **Внешние эффекты изолированы.** Better Auth импортируется только в
   adapter-модулях (`apps/api/src/auth/better-auth.adapter.ts`) за port wrapper;
   ни домен, ни owned-код API не зависят от него напрямую.
4. **Ошибки непредставимы там, где это дёшево.** Типы, Zod-схемы, domain errors.

## Bounded contexts

### Identity (Аутентификация и сессии)
- Владелец: пользователи, учётные записи, сессии, verification tokens.
- Таблицы: `users`, `sessions`, `accounts`, `verification_tokens` (placeholders,
  маппятся на Better Auth Drizzle adapter; финальный набор — после spike).
- Монтируется на `/auth` через `AuthPort`; concrete Better Auth adapter выбирает
  только composition root. Memory persistence разрешена только вне production:
  production-конфигурация с ней завершается до старта.

### Organization Access (Организации, RBAC, доступ к продуктам)
- Владелец: организации, членство, роли, права, гранты доступа к продуктам.
- Таблицы: `organization`, `member`, `role`, `permission`, `product_access`.
- Доменные инварианты граныта: `packages/domain/src/aggregates/product-access.ts`
  (grant/revoke/expiry, запрет повторного revoke).

### Audit & Compliance (Аудит)
- Владелец: append-only журнал с hash chain (`audit_events`: `prev_hash` →
  `hash`), кросс-контекстная доставка через `outbox`.
- Домен фиксирует факты через порт `AuditLogPort`; реализация — в
  инфраструктурном слое. `AuditLogPort` и `OutboxPort` получают общий opaque
  `TransactionContext` от `UnitOfWork`, чтобы запись бизнес-факта, аудита и
  outbox могла быть одной транзакцией.

### Supporting packages
- `contracts` — типизация границы API↔Web (Zod).
- `db` — схема и миграции; владеет созданием pool/drizzle-клиента.
- `ui` — design-токены (CSS), `config` — пресеты тулинга, `testkit` — тестовые
  хелперы.

## Правила зависимостей

```
apps/web ─┐
         ├─► packages/contracts
apps/api ─┤        │
         ├─► packages/db ──► packages/domain (порты, VO, агрегаты)
         └─► packages/testkit (только тесты)
```

- `packages/domain` не импортирует ничего внешнего (framework/db/http/node
  side-effects) — только чистый TypeScript.
- `packages/db` зависит от `drizzle-orm`/`pg` и реализует инфраструктурные порты
  домена, включая Postgres `UnitOfWork`.
- `apps/api` — единственный владелец HTTP-границы; импортирует домен только
  через порты (в будущих главах).
- `packages/testkit` может зависеть от `db` (типы для фабрик); из `db` и `api`
  тесты используют `testkit` только в dev-скоупе.

## Инвариант SSOT

| Факт | SSOT |
|---|---|
| Пользователь, сессия, учётка | `Identity` (`users`, `sessions`, `accounts`) |
| Организация, членство, роль, право | `Organization Access` |
| Грант доступа к продукту | `product_access` + доменный агрегат |
| Аудит-событие | `audit_events` (append-only, hash chain) |
| Событие для доставки в другие системы | `outbox` (транзакционно с источником, at-least-once + idempotent consumer) |

Никакие две таблицы/сервиса не являются равноправными источниками одного факта.
Производные данные (кэши, денормализация) всегда синхронизируются из SSOT, а не
пишутся напрямую.

## Открытые гейты каркаса

- Better Auth identity/session: memory adapter → durable adapter до production.
- Protocol: отдельный Node LTS `oidc-provider` process по G20, только после
  adapter-neutral ports, durable store/JWKS и OIDF/contract gates ch03.
- Аудит: реализация hash chain (алгоритм, canonical-сериализация).
- Outbox: dispatcher/retries; at-least-once delivery и consumer dedup по
  `idempotencyKey`; более сильная гарантия доставки не заявляется.
- RBAC: связывание member/role/permission и enforcement-модель.
- UI: финальные токены из DESIGN.md (ch01-design-system).
