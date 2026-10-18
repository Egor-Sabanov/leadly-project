# LEADLY — технический аудит исходного проекта

Дата аудита: 2026-10-08  
Проверенная версия: архив LEADLY, Foundation v0.2.

## Краткий вывод

Проект является UI-фундаментом Dashboard и схемой базы данных, а не готовым MVP. Это соответствует README, который прямо указывает, что реальная авторизация, работа с данными, AI и источники возможностей ещё не подключены.

## Что уже есть

- Next.js App Router, React, TypeScript.
- Базовый дизайн Dashboard и переиспользуемые компоненты.
- Общая конфигурация навигации.
- Доменные типы для карточки возможности и статистики.
- Mock-данные вынесены в `lib/dashboard-data.ts`.
- Browser-клиент Supabase через `@supabase/ssr`.
- Тестовая страница `app/supabase-test/page.tsx`.
- SQL-схема с 24 таблицами и RLS-политиками, а также индексы и updated_at-триггеры.

## Что пока не реализовано в приложении

- Регистрация, вход, выход и восстановление пароля.
- Server-side Supabase client и защищённые маршруты.
- Онбординг и сохранение пользовательских настроек.
- Загрузка профиля, навыков, услуг и целей из БД.
- Реальные возможности и источники их поступления.
- Match Score / Money Score в вычисляемой бизнес-логике.
- Сохранение возможностей и изменение статусов.
- Генерация и хранение откликов через AI.
- Клиенты, CRM, финансовые данные и аналитика.
- Telegram Bot / Mini App и уведомления.
- Тарифы, лимиты AI и платёжный контур.
- E2E-тесты и подтверждённая production-сборка.

## Найденные риски и пробелы

1. `app/page.tsx` использует `demoUser`, `dashboardStats` и `dashboardOpportunities`, поэтому цифры и карточки на Dashboard демонстрационные.
2. Навигация ссылается на `/opportunities`, `/clients`, `/crm`, `/analytics`, `/revenue`, `/profile`, `/settings`, но соответствующих страниц в архиве нет.
3. Browser-клиент Supabase создаётся с non-null assertions для переменных окружения. При отсутствии переменных ошибка будет обнаружена только при запуске страницы/клиента. Нужна явная проверка конфигурации.
4. В миграции `0001_initial_schema.sql` нет функции/триггера `auth.users -> public.profiles`. В подключённом Supabase это было настроено отдельно и проверено вручную, но новая среда не воспроизведёт это только из текущей миграции.
5. README и `docs/TODO-progress.md` описывают более раннее состояние и не отражают все проверки, которые позднее были выполнены непосредственно в Supabase.
6. Политики RLS глобальных каталогов и возможностей разрешают чтение авторизованным пользователям, а клиентские записи не открыты. Заполнение глобальных данных потребует доверенного серверного/административного ingestion-процесса.
7. На Dashboard есть кнопки без обработчиков; пока это элементы интерфейса, а не рабочие действия.

## Проверки сборки

Команды `npm run lint` и `npm run build` не удалось выполнить: локальные исполняемые файлы `eslint` и `next` отсутствуют. Попытка восстановить зависимости через `npm ci` завершилась транспортным тайм-аутом, поэтому успешная установка зависимостей и production-сборка пока не подтверждены.

## Следующий этап по текущему плану

После фиксации аудита переходим к реализации реального пользовательского пути:

1. Проверка конфигурации Supabase и подготовка browser/server clients.
2. Auth: регистрация, вход, выход, восстановление доступа и обработка ошибок.
3. Защита приватных страниц на серверной стороне.
4. Auth → Profile: загрузка профиля и корректная обработка отсутствующего профиля.
5. Онбординг: сохранение профиля, навыков, услуг, предпочтений и цели дохода.
6. Тесты на двух пользователях и проверка изоляции данных через RLS.

Глобальные источники возможностей, AI, CRM, Telegram и монетизацию не считаем готовыми, пока не реализованы и не проверены их реальные пользовательские сценарии.


## Update 2026-10-09 — RSS ingestion v2 follow-up

The separate RSS v2 delivery adds an authenticated server endpoint, bounded RSS/Atom response streaming, manual redirect validation, DNS/IP screening, heuristic budget extraction with provenance metadata, and canonical URL deduplication. `npm run test:rss` currently passes 33 focused helper/endpoint checks. A strict TypeScript check of the RSS route passed with temporary ambient stubs for package types. Full dependency installation, ESLint, Next.js production build, a live RSS import, and writes to the actual Supabase project remain unverified. DNS validation alone does not eliminate DNS rebinding; production egress restrictions or an IP-pinned HTTP client are still required.
