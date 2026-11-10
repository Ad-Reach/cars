# CMS сайта Ранг Авто (Strapi)

Админка: https://rangauto.ru/cms/admin

Сайт читает контент из CMS, а при её недоступности показывает контент из `src/data`.
После публикации в админке CMS сама просит сайт обновить кэш — правка появляется сразу.

## Локально

```bash
cd cms
cp .env.example .env
npm install
npm run develop
```

При первом запуске с пустой базой импортируется контент из `seed/` (его выгружает `npx tsx scripts/export-cms-seed.ts` из корня репозитория).

## Сервер

Сервер настраивает `deploy/bootstrap-server.sh` (workflow «Server bootstrap»): служба `rangauto-cms`, маршрут `/cms` в Caddy, секреты в `/etc/rangauto-cms.env`, логин и пароль администратора в `/root/rangauto-cms-admin.txt`.

Деплой — workflow «Deploy CMS» при пуше в `production` (папка `cms/`). База и загрузки лежат вне релизов: `/srv/rangauto/cms/data` и `/srv/rangauto/cms/uploads`.
