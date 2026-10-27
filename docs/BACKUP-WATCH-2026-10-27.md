# Контроль резервных копий — 27 октября2026

Контроль опубликован и подтверждён естественным запуском основного Cloudflare Worker. Владелец разрешил объединение PR #5, публикацию монитора и бэкап из main. Исправления обнаруженных препятствий PR #6–#9 вошли в те же17 operations-paths; final main `d9da9e985431d919e9084ab85f10795400d0fe11`. Приложение не затронуто.

## Проверенный бэкап

[Ручной запуск40538868468](https://github.com/Egor-Sabanov/leadly-project/actions/runs/40538868468) из maincd1 SUCCESS. Snapshot27.10 16:14:28UTC (19:14:28МСК). До шифрования настоящее изолированное восстановление проверило68 таблиц и2 файла. Encrypted archive1366927 bytes, artifact12750490006 —1367489 bytes со служебной упаковкой, хранится до10 ноября. После upload архив отдельно не скачивался/не расшифровывался.

Расписание в main —01:17/13:17UTC,04:17/16:17МСК. Этот run ручной; первый natural backup нового расписания ещё не наблюдался. Бэкап-код послеcd1 не менялся, повторное копирование ради исправлений monitor не требовалось. GitHub может задерживать schedule; RPO24ч — цель, не гарантия.

## Подтверждённая публикация

[Auth publication40550688426](https://github.com/Egor-Sabanov/leadly-project/actions/runs/40550688426) SUCCESS: preflight GitHub200/квота5000, Secret передан проверенным stdin secret writer, version `1bf5b1ea-49aa-4a30-8e5c-1917c5b2262b` опубликована17:27:21.759UTC. Публикация через pinned Wrangler versions upload/deploy сохранила cron; setup_test=false.

[Независимое наблюдение40551002055](https://github.com/Egor-Sabanov/leadly-project/actions/runs/40551002055) SUCCESS. Оно не публиковало Worker и не получало Telegram secrets. Основной natural tick17:30:08UTC (20:30МСК) вернул site:ok, backup:ok, backupAccess:token, backupError:null. Проверено новое чтение GitHub после публикации; snapshot совпал с16:14:28UTC. Telegram принял служебное сообщение о восстановлении (notification:sent). Это естественное восстановление проверки, отдельного активационного/тестового сообщения не запрашивали.

Свежая независимая проверка production17:31:03UTC:HTTP200/statusok, checkedAt менее секунды. Основной checkout/HEAD/индекс сохранены, runtime приложения7a80cdb не менялся.

## Что выявил настоящий запуск

Первый update40539369077 остановился до записей: GET schedules возвращает result:{schedules:[...]}, обработчик ожидал массив. Исправлено PR #6.40540546541 успешно опубликовал Worker, но последующее наблюдение упало: Wrangler4.151.3 отвергает --sampling-rate1. Этот параметр убран PR #7; без фильтра передаются все события.

Пассивные наблюдения подтвердили работающий cron и site:ok, но backup:unavailable. Закрытый preview в Cloudflare получил GitHub200 и backupok; его результат не был выдан за доступ основного DO. Безопасные backupError/backupNextCheckAt (PR #8) установили точную причину основного DO: анонимный rate limit, следующая попытка17:29:37UTC. Пауза провайдера при обновлении сохранялась.

Владелец сохранил отдельный fine-grained token только Actions Read-only выбранного repository в GitHub Actions Secret LEADLY_MONITOR_GITHUB_TOKEN. PR #9 подключил его к Worker. GitHub metadata Secrets API остаётся403, но реальный GHA preflight200, запись CF secret и natural authenticated probe подтвердили работоспособность. Значение токена не выводилось и не передавалось в чат; URL/argv/state/отчёты его не содержат.

## Поведение и проверки

Сайт проверяется каждые5мин, metadata собственного backup.yml/main — каждые15мин. Для пригодной копии нужны успешные snapshot/restore/encrypt/upload шаги и непустой неистёкший artifact соответствующего run/branch/commit. Возраст считается от начала snapshot. Worker архив не скачивает и не расшифровывает.

Контроль предупреждает об ошибке/пропуске job, отсутствующем/неподтверждённом архиве, ожидании дольше часа, возрасте старше24ч и длительной недоступности metadata API. На границе срока выполняется свежее чтение с соблюдением rate limit. Public→token меняет квоту и позволяет начать авторизованную проверку; в пределах прежней квоты пауза сохраняется. Новый пригодный архив снимает предупреждение. Прежний DO ID/состояние, retry_after, шестичасовые повторы и защита неопределённой отправки сохранены; публичных управляющих маршрутов нет.

70 unit-проверок (12 monitor/26 backup/14 Worker/12 deploy/6 observe), actionlint, dry-run и native Workers/SQLite прошли. Native fixture проверил authenticated metadata, отсутствие GitHub Authorization на сайте/Telegram, restart/cache/coalescing/сбой и восстановление; все внешние запросы перехвачены. [Final main CI40550309853](https://github.com/Egor-Sabanov/leadly-project/actions/runs/40550309853) SUCCESS на точномd9da9e9.

Временные диагностические/публикационные branches не объединены в main:там одноразовые workflow. Итоговый main содержит обычный deployment workflow с optional read-token secret. Root HEAD42c4dfc/indexSHA256dee578901dfbb40e4afd5ebe29398a202096d09d34498904c08313e8dcd5f3db сохранены; рабочее приложение остаётся на7a80cdb. Vercel Git deploy выключен; не заменять приложение старым main и не объединять весь review branch.

## Оставшиеся критерии

Наблюдать первый natural backup нового расписания. Независимое сохранение архива27.10 подтверждено владельцем после проверки скачанного файла: [отчёт](OFFSITE-COPY-2026-10-27.md). Ключ и фраза уже сохранены владельцем отдельно. Настроить замену ограниченного по сроку GitHub token до его истечения; отзыв/ошибка доступа отражается предупреждением.

[План аварийного восстановления](https://github.com/Egor-Sabanov/leadly-project/blob/d9da9e985431d919e9084ab85f10795400d0fe11/ops/backup/DISASTER-RECOVERY.md) фиксирует данные/Storage/Auth, SMTP/OAuth/домены/Telegram, выключенные расписания, переключение и возврат. Настоящее письмо/повторный вход/архивные данные владельца подтверждены27.10. Recovery уже занята: SQL/Storage restore не повторять. Полный RTO не измерен; OAuth/домены остаются отдельным согласованным этапом.
