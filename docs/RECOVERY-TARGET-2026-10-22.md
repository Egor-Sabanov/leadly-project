# Цель аварийного восстановления — 22 октября 2026

Целевой ref: `umexhmyeheonfsktcyqi`. Рабочий ref: `leezcyaqhozguvcehcpd`. Восстановление выполняется только в отдельную цель. Runtime приложения96927c0/READY dpl_CBYnekcAQHegCZhDkwdRvj37NeY9 и main f178b50 не менялись этим этапом.

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

Hosted restore ещё не выполнялся. Готового универсального hosted-executor нет. SQL-доступ в среде пока отсутствует; объявление требования ключа не равно его сохранению/применению. Не просить присылать пароль базы либо ключи в чат и не извлекать существующие Secrets из GitHub/Vercel.

[Общий порядок восстановления](RECOVERY-DRILL.md). [Scoped PAT и разрешения](https://supabase.com/docs/guides/platform/personal-access-tokens). Приватные evidence: `/workspace/leadly-artifacts/ops-2026-10-22/recovery-target-inventory.json`, `recovery-source-inventory.json`, `recovery-compatibility.json`, `recovery-compare.log`; зашифрованный архив вне checkout. В публичный Git исходный CSV, личные данные и материалы расшифровки не включать.

Черновик cloud configuration сохранён:revision обновлён сервером, requires_publish=true. Добавлены только требование `LEADLY_SUPABASE_MANAGEMENT_TOKEN`→`api.supabase.com` и несекретный `LEADLY_RECOVERY_PROJECT_REF`. Существующие bindings, репозиторий, install/start scripts и сеть сохранены. Значения ключа и runtime-ready пока нет; владелец должен в защищённых Environment settings ввести scoped PAT, сохранить и опубликовать конфигурацию. Не считать сохранённый draft применённым доступом.
