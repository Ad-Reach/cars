# cars

Лендинг «Ранг Авто» — импорт автомобилей из Китая, Кореи и Японии.

```bash
npm install
npm run dev   # http://localhost:3000
```

Контент и заглушки — `src/data/content.ts`, контакты — `src/data/site.ts`.
Ветки и деплой:
- `main` — разработка.
- `production` — боевой сайт https://rangauto.ru в Timeweb App Platform (Амстердам).
  App Platform сам пересобирает `Dockerfile` при пуше в `production`.
  Выкатывать руками не нужно: зелёный CI на `main` сам продвигает код в `production`.
- Инфраструктура и переменные окружения (Telegram, SMTP, адрес для заявок) — репозиторий `Ad-Reach/infra`.

Контент хранится в коде: `src/data/*.ts`. Отдельной CMS нет.

Каталоги новых авто под заказ (`src/app/new`, `src/lib/newCars.ts`):
- `/new` — выбор страны, `/new/china` и `/new/china/<модель>` — из Китая, `/new/uae` и `/new/uae/<модель>` — из ОАЭ.
- Китай: `src/data/new-cars/`, фото `public/new-cars/`, обновляет `scripts/sync-new-cars.py` (раз в сутки в CI).
- ОАЭ: выгружено один раз из присланной таблицы (`src/data/new-cars-uae/source.csv`) скриптом
  `scripts/import-new-cars-uae.py`: цены — из таблицы, фото — с Яндекс.Диска, характеристики и оснащение — с drom.ru.
  Данные: `src/data/new-cars-uae/` (`index.json` — список, `models.json` — страницы моделей), фото `public/new-cars-uae/`.
  Автообновления нет; при новой таблице — заменить `source.csv` и запустить скрипт.
- Старые адреса `/new/<модель>` перенаправляются на `/new/china/<модель>`.
- Тестовый режим (`src/lib/newCarsFlag.ts`): каталоги открываются только по ссылке с ключом,
  например `https://rangauto.ru/new/uae?preview=<NEW_CARS_PREVIEW_KEY>`; ключ запоминается в cookie на весь `/new`.

Заявки с форм уходят во все Telegram-группы, куда добавлен бот (список групп хранится в S3, `src/lib/chatStore.ts`),
и дублируются на почту (`LEAD_EMAIL_TO`, по умолчанию email из `src/data/site.ts`).
SMTP: `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (необязательно).
