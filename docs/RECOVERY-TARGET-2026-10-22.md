# Цель аварийного восстановления — 22 октября 2026

## Актуальный результат — 23 октября, по Москве

Работа возобновлена по команде владельца. SQL, два приватных файла,10 hosted Auth/RLS,8 browser и10 проверок опубликованной закрытой копии подтверждены; ключ Preview работает. Исправление кеша фото опубликовано на рабочий сайт после общего check и CI: source a2cdf44/READY dpl_G34JGhe6mT34s6MzkqBB8PE5dBmp,13 public и7 настоящих avatar-проверок прошли, временные данные очищены. Собственный парольный вход владельца пока не подтверждён: введённый пароль отклонён и копией, и рабочим сайтом. В recovery обнаружен и исправлен Site URL localhost: владелец сохранил адреса, повторная проверка default/callback прошла без письма. Ожидается обычное восстановление владельцем через свою почту и сверка архивных данных. SQL/Storage перенос в занятую цель не повторять. [Точка продолжения](RECOVERY-RESULT-2026-10-23.md). Исторические статусы ниже относятся к своим датам.

## Текущий результат — 23 октября, по Москве

SQL и два приватных файла восстановлены в отдельном `umexhmyeheonfsktcyqi`. Десять hosted Auth/RLS и восемь браузерных сценариев прошли, временные данные очищены. Цель занята; повторную SQL-установку не запускать. Серверный ключ закрытого Preview работает; остались внешний вход владельца и сверка архивных данных. Полный RTO пока не подтверждён. [Подробности](RECOVERY-RESULT-2026-10-23.md). Исторические статусы ниже относятся к своим датам.

Целевой ref: `umexhmyeheonfsktcyqi`. Рабочий ref: `leezcyaqhozguvcehcpd`. Восстановление выполняется только в отдельную цель. Runtime приложения96927c0/READY dpl_CBYnekcAQHegCZhDkwdRvj37NeY9 и main f178b50 не менялись этим этапом.

## SQL-перенос выполнен — 18:23 UTC

После успешной проверки плана на native PostgreSQL17 выполнена одна транзакция в новой цели:33 public tables,8 auth.users,10 auth.identities. Проверка counts и контрольных сумм выполняется до COMMIT и повторно после него;26 постоянных public-таблиц и2 Auth-таблицы совпали. Служебные/временные public-таблицы из явного списка оставлены пустыми,подписки Telegram в копии выключены.130 managed constraints,87 defaults,23 managed functions и7 Storage triggers не изменились. Сессии и одноразовые Auth-токены не перенесены,пользовательские transient-поля очищены.

Цель теперь занята — повторный SQL restore или очистка не нужны. Production не изменялся. Backup local source/fixture DB и plaintext удалены. SQL-фаза18:23:07.253→18:23:18.342UTC около11секунд;это не полноеRTO. Настоящий hosted Auth-вход и2 файла Storage ещё не проверены. [Исполнитель/границы](../ops/backup/HOSTED-RECOVERY.md). Native6 сценариев и весь operations-набор78 проверок прошли;ключи и SQL с пользовательскими данными в Git не включены.

Для следующего этапа нужны отдельные ключи новой цели:Management GET api-keys вернул403,обход не используется. Draft сохраняет LEADLY_RECOVERY_SERVICE_ROLE_KEY(защищённый secret только для хоста новой цели) и LEADLY_RECOVERY_PUBLISHABLE_KEY(anon/publishable для закрытого интерфейса). Эти поля пока unset в процессе. Прежний Management binding продолжает работать;production credentials/alias/webhook не меняются.

## Доступ и свежий preflight — 17:45 UTC

Владелец опубликовал настройки среды и дал команду «пробуй сейчас». Spec5 применён; защищённые Management token и recovery ref доступны процессу. Два вида настоящего read-only запроса к Management API новой цели прошли; PostgreSQL подтвердил transaction_read_only=on. Готовность metadata по-прежнему unknown, поэтому вывод относится к проверенной операции, не ко всем возможным разрешениям. Никакие значения токенов не печатались и не копировались со снимков; отзыв ранее раскрытых токенов не подтверждён.

Проверены нулевые counts users/identities/sessions Auth,buckets/objects Storage,relations/functions/types public и policies Storage.344 столбца managed-таблиц не изменились с первого owner inventory;anon/authenticated/service_role/supabase_auth_admin/supabase_storage_admin присутствуют. Обнаружены7 non-internal triggers:все они штатные функции storage→storage владельца supabase_storage_admin (защита buckets/objects и updated_at),их сохранять. Первый строгий preflight остановился на наличии этих триггеров;после отдельной проверки метаданных они классифицированы как платформенные,а не пользовательские.130 managed constraints подсчитаны,но их полное сравнение с архивом ещё не выполнено.

Ничего не записывалось ни в production,ни в target. Hosted executor ещё не готов,перенос не запускался. Приватные отчёты:recovery-target-live-access.json,recovery-target-preflight-live-v2.json,recovery-target-preflight-verified.json в `/workspace/leadly-artifacts/ops-2026-10-22/`. Последующие исторические записи об отсутствующем доступе относятся к состоянию до spec5.

## Подтверждено

Владелец передал результат read-only запроса из SQL Editor новой цели, observedAt22.10 16:21:08UTC. PostgreSQL17.11, auth.users0, storage.objects0, пользовательских relations public0. Это снимок на указанное время; наличие пользовательских функций/типов отдельно ещё не проверялось. Установлены managed extensions pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.

Выбран natural backup39731889214, artifact12405314393, source4b7c054d7fc9c4fc30e1e5e0429a131d033d3bde. Проверены принадлежность своему workflow, SUCCESS и неистёкший artifact. SHA256 скачанного зашифрованного файла: `d0e809cee3821d436415ed5a9f90e99aae3ba38c6cc1913320f0182100b413d9`.

Архив штатно расшифрован через GPG и восстановлен в новой изолированной local PostgreSQL-базе. Проверены68 таблиц и2 настоящих файла по защищённому manifest. Содержимое ключа, фразы, пользовательских строк и сессий не выводилось. Затем временные DB/plaintext удалены, кластер остановлен. Production и hosted-цель не изменялись.

Сравнены35 managed Auth/Storage-таблиц и344 столбца. Пропавших/новых столбцов и отличий type/notNull/hasDefault/identity/generated нет. Это доказательство совместимости проверенных полей, а не полного совпадения constraints, managed-функций, grants или работающего hosted Auth.

## План следующего переноса

1. Настроить отдельный scoped Management PAT: только проект `umexhmyeheonfsktcyqi`, только Database Read-write, срок7 дней. Использовать защищённый cloud binding `LEADLY_SUPABASE_MANAGEMENT_TOKEN` для `api.supabase.com`; значение не передавать в чат, Git, argv или Vercel. Текущий production service-role key не расширять и не использовать для новой цели.
2. Через этот доступ повторить read-only preflight непосредственно перед записью: ref, пустота Auth/Storage и собственных объектов public (включая функции/типы), managed-структура, существующие роли и допустимые операции. Занятая либо отличающаяся цель требует разбора. Старый снимок не заменяет проверку перед записью.
3. Подготовить отдельный target-bound исполнитель; старую защиту localhost в backup.cjs не менять. Выделить из проверенного локального архива собственные public DDL/data и пользовательские Auth-данные. Системные Auth/Storage DDL и migration ledgers новой платформы сохранять. Собственные Auth-триггеры/Storage-политики учитывать отдельно, поскольку public-only dump их не включает. Проверить это на изолированном managed-schema fixture с транзакцией/rollback и отказом для production/занятой цели.
4. Не переносить задания cron, Vault-секреты, net-очереди, старые сессии и одноразовые ссылки входа. При переносе сохранить пользователей, password hashes и связи провайдеров, но проверить/очистить transient-поля. Импорт и отправки в recovery не включать. Точный проверенный план записи предъявить до исполнения.
5. Файлы загружать в приватный Storage через API новой цели с отдельным защищённым ключом этой цели; перенос одних строк storage.objects не восстанавливает байты. Сравнить пути, размер, SHA256 и ограничения buckets. Не выводить пользовательские пути/содержимое в публичный отчёт. Этот ключ пока не запрашивался и не настроен.
6. Подготовить отдельное закрытое приложение. Проверить настоящий парольный вход добровольного участника, профиль/сохранения/проекты/клиентов/задачи/финансы/фото, новый профиль и RLS второго аккаунта. Настройки OAuth/SMTP/JWT/домены не считать восстановленными из SQL. Рабочий alias и Telegram webhook сохраняются.
7. Записать время начала/готовности и возраст пригодной копии. Локальная повторная проверка не является измеренным hosted RTO. После учений убрать отдельные восстановленные данные/deployment по согласованному плану; scoped PAT отозвать.

## Граница текущего результата

SQL-фаза hosted restore выполнена отдельным target-bound исполнителем,но полный drill ещё не завершён:нужны Storage и настоящий вход. Записи ниже об отсутствующем исполнителе относятся к предшествующему состоянию. Не просить присылать пароль базы либо ключи в чат и не извлекать существующие Secrets из GitHub/Vercel.

[Общий порядок восстановления](RECOVERY-DRILL.md). [Scoped PAT и разрешения](https://supabase.com/docs/guides/platform/personal-access-tokens). Приватные evidence: `/workspace/leadly-artifacts/ops-2026-10-22/recovery-target-inventory.json`, `recovery-source-inventory.json`, `recovery-compatibility.json`, `recovery-compare.log`; зашифрованный архив вне checkout. В публичный Git исходный CSV, личные данные и материалы расшифровки не включать.

Черновик cloud configuration сохранён:revision обновлён сервером, requires_publish=true. Добавлены только требование `LEADLY_SUPABASE_MANAGEMENT_TOKEN`→`api.supabase.com` и несекретный `LEADLY_RECOVERY_PROJECT_REF`. Существующие bindings, репозиторий, install/start scripts и сеть сохранены. Значения ключа и runtime-ready пока нет; владелец должен в защищённых Environment settings ввести scoped PAT, сохранить и опубликовать конфигурацию. Не считать сохранённый draft применённым доступом.

Обновление доступа:backend revision21 подтвердил сохранённый Management binding, spec4; observed readiness unknown, не ready. UI показывал ошибку подтверждения draft. Затем значение PAT оказалось открыто в присланном screenshot; требуется отзыв этого scoped token и замена защищённого значения новым. Раскрытый токен не использовался, его значение не переносилось в код/логи/Git. До замены Management API вызовы не выполнять.
