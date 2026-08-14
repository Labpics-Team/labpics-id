# ch02: доказательство чувствительности security-тестов

Reference-контракт шлюза главы ch02 (identity & sessions): реальный PostgreSQL 17,
полный набор тестов без пропусков и mutation/diversion-доказательство того, что
каждый критичный guard закрыт тестом, который действительно падает при поломке
guard'а.

## Команды

| Команда | Что делает |
| --- | --- |
| `bun run security:proof` | Прогоняет mutation/diversion-манифест. Требует `TEST_DATABASE_URL` (закреплённый PostgreSQL 17). Ненулевой код выхода, если хотя бы один мутант выжил. |
| `bun run gate:ch02` | Полный шлюз главы: набор тестов на реальном PostgreSQL без пропусков → domain-gate → typecheck → build → mutation-proof → live-smoke собранной композиции (`/health`, `/ready`, `/api/v1/ping`). |

Пример:

```bash
docker compose up -d postgres
TEST_DATABASE_URL=postgresql://labpics:labpics-dev-password@localhost:54310/labpics bun run gate:ch02
```

## Как устроено доказательство

1. **Манифест** — `scripts/security-proof/mutants.json`. Каждый мутант задаёт:
   guard, происхождение (`task` — из задачи главы, `review` — класс, найденный
   независимым review в PR #11–#17), файл, точный фрагмент `find`/`replace`,
   тестовый файл и ожидаемые падающие assertions.
2. **Одноразовая копия** — раннер (`scripts/security-proof/run-security-proof.ts`)
   копирует workspace во временную директорию и ставит зависимости заново;
   рабочий checkout никогда не мутируется.
3. **Контроль чистоты** — до применения мутантов каждый задействованный
   тестовый файл обязан пройти зелёным на свежей базе; иначе RED нельзя было бы
   приписать мутанту.
4. **RED обязателен** — мутант применяется, именованный тестовый файл
   запускается на свежей базе (миграции применяются из мутированной копии тем
   же drizzle-kit-путём, что и в CI); прогон обязан упасть именно на ожидаемом
   assertion. После каждого мутанта файл восстанавливается автоматически.
5. **Выживший мутант = провал** — kill ratio обязан быть N/N.

Сырые отчёты в репозиторий не коммитятся: `--out <файл>` пишет JSON-отчёт в
указанное место (в CI — артефакт, локально — временная директория).

## Реестр guard'ов

| Мутант | Guard | Тест |
| --- | --- | --- |
| M01 | Атомарное одноразовое потребление verification/reset-токена (`DELETE … RETURNING`) | `account-lifecycle.integration.test.ts` |
| M02 | Replay refresh-credential отзывает всю семью и пишет security-событие | `session-security.integration.test.ts` |
| M03 | Конкурентное погашение: ровно один победитель через `usedAt IS NULL` | `session-security.integration.test.ts` |
| M04 | Медиация deactivated-субъекта на границе use case | `identity-use-cases.contract.test.ts` |
| M05 | `PostgresUnitOfWork`: все записи в одной транзакции, откат при ошибке | `unit-of-work.integration.test.ts` |
| M06 | Анти-перечисление: единый 202-ответ независимо от существования аккаунта | `routes/lifecycle.test.ts` |
| M07 | Production отклоняет известные fallback-значения `BETTER_AUTH_SECRET` | `config.test.ts` |
| M08 | Tenant-safe составной FK `member(organization_id, role_id)` в реальном PostgreSQL | `migrate.test.ts` |
| M09 | Advisory-lock сериализует гонку bootstrap-заявок | `first-admin-bootstrap.integration.test.ts` |
| M10 | Независимые бюджеты account+source против DoS одной жертвы | `abuse-controls.integration.test.ts` |
| M11 | *(review)* Ротация отклоняет revoked-сессию и deactivated-субъекта | `session-security.integration.test.ts` |
| M12 | *(review)* Raw bootstrap-токен не попадает в audit/outbox-поверхность (включая hash) | `first-admin-bootstrap.integration.test.ts` |
| M13 | *(review)* Limiter await'ит отказ хранилища и фейлится закрыто | `abuse-controls.integration.test.ts` |

Классы M11–M13 найдены независимым review при работе над PR #13, #15, #16/#17
и зафиксированы здесь, чтобы регрессия любого из них снова делала шлюз красным.

## Целостность манифеста

`test/security-proof-manifest.test.ts` входит в обычный `bun test` и проверяет:
пин образа PostgreSQL совпадает с `docker-compose.yml` и CI; ≥10 guard'ов и все
три review-класса присутствуют; каждый `find`-фрагмент встречается в целевом
файле ровно один раз; каждый ожидаемый тест существует в названном файле;
мутация не является no-op.

## Ограничения

- Мутанты — точечные строковые диверсии, а не полноценный mutation testing
  всего кода: они доказывают чувствительность именно перечисленных guard'ов.
- Недетерминированные guard'ы (гонки) допускают `runs > 1`: мутант убит, если
  хотя бы один прогон упал на ожидаемом assertion.
