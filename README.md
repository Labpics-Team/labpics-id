# Labpics ID

Самостоятельно управляемая платформа идентификации: OIDC/OAuth 2.1, организации, RBAC, MFA, admin и login UI (инфраструктурный продукт студии Labpics).

> **Статус: каркас (ch01-scaffold).** В репозитории лежит bootstrap-волна эпика
> `labpics-identity`. Реальная авторизация, протоколы, организации и UI
> появляются в следующих главах. Ничего в этом репозитории не является
> production-контрактом.

## Быстрый старт

Требования: [Bun](https://bun.sh) ≥ 1.3, Node ≥ 20.9, Docker (для локального Postgres).

```bash
bun install                     # единственный package manager — bun
docker compose up -d            # Postgres 17 на localhost:54310 (digest-pinned)
bun --cwd packages/db run migrate
bun --cwd apps/api dev          # API: http://localhost:3000 (/health, /ready, /api/v1)
bun --cwd apps/web dev          # Web: http://localhost:3001
(cd apps/protocol && node src/index.ts)   # Protocol: http://localhost:3002 (только Node ≥22.11)
```

Проверка каркаса:

```bash
bun run typecheck
bun run lint                    # Biome
bun run test
bun run check:domain-gate       # запрет framework/db/http-импортов в packages/domain
bun run build
```

## Структура

| Путь | Назначение |
|---|---|
| `apps/api` | Hono на Bun: health/readiness, request-id, pino, error envelope, timeout, CORS-allowlist, `/api/v1`, Better Auth за port wrapper (`/auth`), внутренняя граница `/internal/protocol/v1` |
| `apps/protocol` | OIDC/OAuth-провайдер на выделенном Node ≥22.11 (Bun отвергается при старте): `oidc-provider@9.11.3`, один issuer `https://id.lab.pics`, аутентифицированная граница к API |
| `apps/web` | Next.js 16 App Router: Tailwind v4, Motion, Radix-примитивы, `src/proxy.ts` (auth-aware роутинг, без DB на edge), next/font, `server-only` доступ к данным |
| `packages/domain` | Чистый домен: агрегаты, value objects, порты. Ноль framework/DB/HTTP-импортов (gate: `scripts/check-domain-gate`) |
| `packages/db` | Drizzle-схема: Better Auth placeholders (`users`, `sessions`, `accounts`, `verification_tokens`), `audit_events` (hash chain), `outbox`, `organization`/`member`/`role`/`permission`, `product_access` + миграции |
| `packages/contracts` | Общие Zod-схемы для API и Web |
| `packages/ui` | CSS-токены (placeholders, TODO на DESIGN.md) |
| `packages/config` | Общие пресеты tsconfig / Biome / ESLint |
| `packages/testkit` | Фабрики тестов, Testcontainers-хелпер Postgres 17, MSW-заготовка |
| `docs` | Архитектура, threat model, design brief |

## Переменные окружения

Скопируйте `.env.example` в `.env` и замените значения. В `.env.example` — только
плейсхолдеры, реальные секреты в репозиторий не коммитятся.

## Ссылки

- [Архитектура](docs/architecture.md) — bounded contexts, правила зависимостей, инвариант SSOT.
- [Threat model](docs/security/threat-model.md) — STRIDE по контекстам.
- [Design brief](docs/design/DESIGN-BRIEF.md) — маркер; полный бриф коммитит глава ch01-design-system.
