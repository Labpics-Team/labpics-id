# Visual QA Rubric — исполняемая часть и браузерный контур

> Reference: как проверяется соответствие DESIGN.md. Машинная часть уже
> исполняется (`bun run qa:rubric` в `packages/ui`); браузерная часть
> специфицирована здесь и становится исполняемой в ch08/ch09, когда появятся
> первые страницы. Идентификаторы (T/C/S/M/A/R/V) соответствуют
> `docs/design/DESIGN-BRIEF.md` §9.

## 1. Машинные проверки (работают сейчас, per-PR)

Запуск: `bun run qa:rubric` (или общий `bun test` — тесты входят в набор CI).
Файл: `packages/ui/qa/qa-rubric.test.ts`.

| ID | Проверка | Метод |
|---|---|---|
| T1 | Ноль raw-цветов (`#hex`, `rgb()`, `hsl()`, `oklch()`) вне `packages/ui/src/tokens.css` | статический скан `packages/ui` и `apps/web/src` |
| T2 | Ноль off-grid px-значений (не кратных 4; исключения: 1/2px hairline и focus, 999px pill) | скан committed CSS |
| T4 | Нет `outline: none` без замещающего focus-стиля | скан + эвристика замещения |
| C1 | WCAG 2.2 AA контраст для каждой пары из DESIGN.md §2.4, обе темы | формулы WCAG 2.2 (relative luminance), `packages/ui/qa/contrast.ts` |
| D1 | Два тёмных блока токенов байт-идентичны (анти-дрейф) | нормализованное сравнение |
| V1 | Акцент-якорь `#007AFF`, teal отсутствует | точечные assertion |
| G1 | `react-scan`/`react-doctor` только за `NODE_ENV === 'development'` | скан `apps/web/src` |
| B1 | Бриф v2 закоммичен целиком; все семантические роли экранов существуют в `tokens.css`; DESIGN.md содержит 7 секций | структурные assertion |

Чувствительность рубрики (нарушение делает тест красным) доказана sabotage-прогоном при внедрении: raw hex в компоненте, заниженный контраст токена и рассинхронизация тёмных блоков дают падение соответствующих проверок.

## 2. Браузерный контур (ch08/ch09 — как только есть страницы)

Инфраструктура: Playwright + реальный Chromium, axe-core через `@axe-core/playwright`. Прогон на матрице: обе темы × viewport 375/768/1280/1536.

| ID | Проверка | Скрипт (контракт) |
|---|---|---|
| A1 | axe-core: 0 critical/serious на каждом экране | `AxeBuilder(page).analyze()`; фильтр `impact in {critical, serious}` |
| A2 | Полный keyboard-only путь: login, consent, admin table, wizard | Playwright-сценарий только `keyboard.press`; каждая интерактивная цель достижима и активируема |
| A3 | Focus trap + restore во всех модалках | assertions на `document.activeElement` до/внутри/после |
| A6 | Target size ≥ 44px | axe `target-size` + boundingBox-проверка |
| A7 | Reflow 320px @ 400%: нет потери контента и горизонтального скролла (кроме намеренных code-блоков) | viewport 320×256, скан `scrollWidth` |
| M1 | `prefers-reduced-motion`: анимации приходят к статике ≤200ms | `page.emulateMedia({ reducedMotion: "reduce" })` + счёт `document.getAnimations()` |
| M2 | На критических путях анимируются только transform/opacity | CDP performance trace на sign-in/consent/revoke |
| S4 | Нет layout shift между loading и loaded | скриншот-сравнение bounding boxes |
| R1–R4 | Responsive-матрица (таблицы→карточки, bottom-sheet, sticky action) | Playwright matrix |

## 3. Lighthouse 100 — ratchet, не per-commit hard fail

Политика (зафиксирована здесь, реализуется в ch08/ch09):

- **Метод:** Lighthouse через реальный Chromium (Playwright-запущенный), mobile + desktop пресеты, по каждому публичному маршруту.
- **Ratchet:** в репозитории хранится baseline JSON (`docs/design/lighthouse-baseline.json`, появится с первой страницей). PR не может *ухудшить* ни одну из четырёх категорий относительно baseline; улучшение автоматически поднимает baseline при merge.
- **Целевая планка:** 100/100/100/100. Пока планка не достигнута, категория < 100 не блокирует commit — блокирует только регресс.
- **Retries/tolerance:** 3 прогона, берётся медиана; допуск ±1 пункт на perf-категорию (шум измерения); a11y/best-practices/SEO без допуска.
- **Никогда** не достигать 100 ослаблением UX (удаление контента, отключение анимаций там, где они несут состояние).

## 4. Ручные проверки (per-release, deterministic из брифа §9.3/9.8)

L1–L5 (4px grid, одна primary-кнопка на view, ledger-паттерн, отсутствие card soup, иерархия заголовков), V2 (отсутствие имитации Clerk/Auth0/Stripe — side-by-side ревью), V3 (Swiss instrument look), V4 (brand DNA: flask mark, `#007AFF`, clear-space ≥ 1/5 высоты знака, поля 50%/70% — сверка с lab.pics/brand).

Правило приёмки экрана — §9.9 брифа: все применимые машинные проверки зелёные, ручные закрыты именованным ревьюером, «не применимо» допускается только с письменным обоснованием.
