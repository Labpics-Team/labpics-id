# Архитектура Labpics ID

> Документ описывает каркас (ch01-scaffold) эпика `labpics-identity`: bounded
> contexts, правила зависимостей и инвариант единственного источника истины
> (SSOT). Детали реализации следующих глав уточняются в их собственных
> разделах/ADRs.

## Проблема и принцип

Labpics ID — инфраструктурный продукт: платформа идентификации и доступа
(OIDC/OAuth 2.1, организации, RBAC, MFA, admin-UI), которой пользуются остальные
системы Labpics. Это **один деплой** (modular monolith), а не микросервисы.
Разделение на контексты — логическое, в рамках одного приложения `apps/api`.

Инварианты архитектуры:

1. **Зависимости направлены внутрь.** `packages/domain` — чистое ядро без
   framework/DB/HTTP (проверяется `scripts/check-domain-gate`). Инфраструктура
   (API, БД, HTTP) реализует порты домена.
2. **Один источник истины (SSOT) на каждый факт.** Любой факт имеет ровно одно
   авторитетное хранилище. Копии допускаются только как производные и
   синхронизируются через outbox.
3. **Внешние эффекты изолированы.** Better Auth импортируется только в
   adapter-модулях (`apps/api/src/auth/better-auth.adapter.ts`) за port wrapper;
   ни домен, ни owned-код API не зависят от него напрямую.
4. **Ошибки непредставимы там, где это дёшево.** Типы, Zod-схемы, domain errors.

## Bounded contexts

### Identity (Аутентификация и сессии)
- Владелец: пользователи, учётные записи, сессии, verification tokens.
- Таблицы: `users`, `sessions`, `accounts`, `verification_tokens` (placeholders,
  маппятся на Better Auth Drizzle adapter; финальный набор — после spike).
- Монтируется на `/auth` через port wrapper; в каркасе используется memory
  adapter, чтобы `/auth` работал без БД.

### Organization Access (Организации, RBAC, доступ к продуктам)
- Владелец: организации, членство, роли, права, гранты доступа к продуктам.
- Таблицы: `organization`, `member`, `role`, `permission`, `product_access`.
- Доменные инварианты граныта: `packages/domain/src/aggregates/product-access.ts`
  (grant/revoke/expiry, запрет повторного revoke).

### Audit & Compliance (Аудит)
- Владелец: append-only журнал с hash chain (`audit_events`: `prev_hash` →
  `hash`), кросс-контекстная доставка через `outbox`.
- Домен фиксирует факты через порт `AuditLogPort`; реализация — в
  инфраструктурном слое.

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
- `packages/db` зависит от `drizzle-orm`/`pg`, не от домена.
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
| Событие для доставки в другие системы | `outbox` (транзакционно с источником) |

Никакие две таблицы/сервиса не являются равноправными источниками одного факта.
Производные данные (кэши, денормализация) всегда синхронизируются из SSOT, а не
пишутся напрямую.

## Открытые гейты каркаса

- Better Auth: memory adapter → Drizzle adapter (спайк по провайдерам).
- Аудит: реализация hash chain (алгоритм, canonical-сериализация).
- Outbox: диспетчер, ретраи, dedup, exactly-once.
- RBAC: связывание member/role/permission и enforcement-модель.
- UI: финальные токены из DESIGN.md (ch01-design-system).
