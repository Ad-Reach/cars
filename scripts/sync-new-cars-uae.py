#!/usr/bin/env python3
"""Каталог новых авто из ОАЭ (rangauto.ru/new/uae): таблица → JSON каталога и фото.

Источник — Google-таблица (SHEET_ID), лист с колонками:
  Марка, Модель, Комплектация, Цена в ОАЭ, Таможня РФ, Итоговая цена, Фото, Ссылка на комплектацию
«Итоговая цена» — цена под ключ, её и показываем. «Фото» — публичная папка Яндекс.Диска.
«Ссылка на комплектацию» — ссылка на каталог (не показываем) или текст с характеристиками
(строки «Ключ: значение» / «Ключ значение») — он становится таблицей характеристик.

Если таблица открыта по ссылке, скрипт скачивает её и сохраняет копию в src/data/new-cars-uae/source.csv;
если нет — берёт эту копию (её можно обновить руками: Файл → Скачать → CSV).

Результат: src/data/new-cars-uae/index.json (список) и models.json (страницы моделей),
фото — public/new-cars-uae/<slug>/<n>-w380|w760|w1160.webp. Фото скачиваются один раз:
чтобы перекачать фото модели, удалите её папку (или запустите с --photos).

Запуск: python3 scripts/sync-new-cars-uae.py [--photos] [--offline]
Зависимости: pip install pillow
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data" / "new-cars-uae"
IMAGES = ROOT / "public" / "new-cars-uae"
SOURCE_CSV = DATA / "source.csv"
SHEET_ID = "1nC4GqLvyhobfEHZ04vNeKVxAukGG1tgcM0tgXMid5gA"
SHEET_CSV = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"
YADISK_API = "https://cloud-api.yandex.net/v1/disk/public/resources"
SIZES = {"w380": 380, "w760": 760, "w1160": 1160}
MAX_PHOTOS = 12
UA = "Mozilla/5.0 (compatible; RangAutoSync/1.0)"

# опечатки и неудачное деление «модель / комплектация» в таблице: (марка, модель, комплектация) → (модель, комплектация)
FIX = {
    ("Suzuki", "Gimny", "GLX"): ("Jimny", "GLX"),
    ("Toyota", "Crolla Cross Hybrid", "GLI"): ("Corolla Cross Hybrid", "GLI"),
    ("Suzuki", "S presso", "1.0 AT"): ("S-Presso", "1.0 AT"),
    ("Mitsubishi", "Eclipse", "Cross GLS"): ("Eclipse Cross", "GLS"),
    ("Mitsubishi", "Xpander", "Cross"): ("Xpander Cross", "Cross"),
}

COLUMNS = ["Марка", "Модель", "Комплектация", "Итоговая цена"]


def fetch(url: str, tries: int = 4) -> bytes:
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def number(s: str) -> int | None:
    digits = re.sub(r"\D", "", s or "")
    return int(digits) if digits else None


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def rub(n: int | None) -> str:
    return f"{n:,}".replace(",", " ") + " ₽" if n else "по запросу"


# ---------- таблица ----------

def load_rows(offline: bool) -> list[dict]:
    text = None
    if not offline:
        try:
            body = fetch(SHEET_CSV).decode("utf-8-sig")
            if body.lstrip().startswith("<"):
                raise RuntimeError("вместо CSV пришла HTML-страница — таблица закрыта по ссылке")
            text = body
            SOURCE_CSV.write_text(text)
            print("Таблица скачана, копия обновлена", flush=True)
        except Exception as e:
            print(f"! Таблица недоступна ({e}) — беру {SOURCE_CSV.relative_to(ROOT)}", flush=True)
    if text is None:
        text = SOURCE_CSV.read_text(encoding="utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    if rows:
        header = {norm(k) for k in rows[0].keys()}
        missing = [c for c in COLUMNS if c not in header]
        if missing:
            sys.exit(f"В таблице нет колонок: {', '.join(missing)}")
    return [{norm(k): (v or "").strip() for k, v in r.items() if k} for r in rows]


SPEC_KEYS = ("Мощность", "КПП", "Привод", "Кузов", "Двигатель", "Коробка передач", "Трансмиссия", "Объём", "Расход")


def parse_specs(text: str) -> list[list[str]]:
    """Текст характеристик → [[ключ, значение]]. Ссылки игнорируются."""
    if not text or re.match(r"^https?://", text.strip()):
        return []
    out = []
    for line in text.splitlines():
        line = norm(line.lstrip("•-–— "))
        if not line or "http" in line:
            continue
        if ":" in line:
            k, v = line.split(":", 1)
        else:
            k = next((key for key in SPEC_KEYS if line.startswith(key + " ")), "")
            v = line[len(k):] if k else ""
        # ссылки на сторонние сайты не показываем
        v = re.sub(r"\s*\(по данным [^)]*\)|\s*по данным \w+", "", v)
        k, v = norm(k), norm(v).rstrip(";,")
        if v.endswith(".") and not v.endswith("л.с."):
            v = v[:-1]
        if k and v:
            out.append([k[0].upper() + k[1:], v])
    return out


def spec_facts(specs: list[list[str]], model: str, trim: str) -> dict:
    """Сводные поля для фильтров каталога: топливо, мощность, привод, коробка, кузов."""
    text = " ".join(v for _, v in specs).lower()
    where = f"{model} {trim}".lower()
    facts: dict[str, str] = {}
    facts["fuel"] = "Гибрид" if "hybrid" in where else "Дизель" if "diesel" in where else "Бензин"
    m = re.search(r"(\d{2,3})\s*(?:л\.?\s*с|hp)", text + " " + where)
    if m:
        facts["power"] = f"{m.group(1)} л.с."
    if re.search(r"передн|fwd", text):
        facts["drive"] = "2WD"
    elif re.search(r"полн|4wd|awd", text):
        facts["drive"] = "4WD"
    if re.search(r"вариатор|cvt", text):
        facts["gearbox"] = "Вариатор"
    elif "механик" in text:
        facts["gearbox"] = "Механика"
    elif re.search(r"автомат", text):
        facts["gearbox"] = "Автомат"
    m = re.search(r"(\d[.,]\d)\s*л\b", text) or re.search(r"\b(\d\.\d)\s*l\b", where)
    if m:
        facts["engine"] = f"{m.group(1).replace(',', '.')} л"
    for k, v in specs:
        if k == "Кузов":
            facts["body"] = v
    return facts


def build(rows: list[dict]) -> list[dict]:
    """Строки таблицы → модели: строки одной марки и модели становятся комплектациями одной модели."""
    models: dict[str, dict] = {}
    for r in rows:
        brand, model, trim = norm(r.get("Марка")), norm(r.get("Модель")), norm(r.get("Комплектация"))
        if not brand or not model:
            continue
        model, trim = FIX.get((brand, model, trim), (model, trim))
        price = number(r.get("Итоговая цена", ""))
        specs = parse_specs(r.get("Ссылка на комплектацию", ""))
        slug = slugify(f"{brand} {model}")
        car = models.setdefault(slug, {"slug": slug, "brand": brand, "model": model, "trims": [], "specs": [], "photos_url": ""})
        car["trims"].append({"name": trim or "Базовая", "sub": "", "badge": "", "price": price, "features": []})
        car["specs"] = car["specs"] or specs
        car["photos_url"] = car["photos_url"] or norm(r.get("Фото"))
    return list(models.values())


# ---------- фото ----------

def yadisk_images(public_url: str) -> list[tuple[str, str]]:
    """Публичная папка (или файл) Яндекс.Диска → [(имя, ссылка на скачивание)] картинок по имени."""
    q = urllib.parse.urlencode({"public_key": public_url, "limit": 200, "sort": "name"})
    info = json.loads(fetch(f"{YADISK_API}?{q}"))
    items = info.get("_embedded", {}).get("items", []) if info.get("type") == "dir" else [info]
    return [(i["name"], i["file"]) for i in items if i.get("type") == "file" and i.get("media_type") == "image" and i.get("file")]


def save_photo(raw: bytes, folder: Path, name: str) -> None:
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    for size, width in SIZES.items():
        w = min(width, img.width)
        out = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS) if w != img.width else img
        out.save(folder / f"{name}-{size}.webp", "WEBP", quality=80, method=6)


def local_photos(slug: str) -> list[str]:
    folder = IMAGES / slug
    names = {p.name.rsplit("-", 1)[0] for p in folder.glob("*-w760.webp")} if folder.exists() else set()
    return sorted(names, key=lambda n: (len(n), n))


def sync_photos(car: dict, refresh: bool, offline: bool) -> str | None:
    """Скачивает фото модели, если их ещё нет. Возвращает текст ошибки или None."""
    have = local_photos(car["slug"])
    if offline or (have and not refresh) or not car["photos_url"]:
        return None
    try:
        files = yadisk_images(car["photos_url"])[:MAX_PHOTOS]
        if not files:
            return "в папке нет картинок"
        folder = IMAGES / car["slug"]
        if folder.exists():
            for p in folder.glob("*.webp"):
                p.unlink()
        folder.mkdir(parents=True, exist_ok=True)
        for n, (_, url) in enumerate(files, 1):
            save_photo(fetch(url), folder, str(n))
        print(f"  {car['slug']}: {len(files)} фото", flush=True)
        return None
    except Exception as e:
        return str(e)


# ---------- данные каталога ----------

def model_json(car: dict, photos: list[str], similar: list[str]) -> dict:
    name = f"{car['brand']} {car['model']}"
    trims = sorted(car["trims"], key=lambda t: t["price"] or 0)
    price = next((t["price"] for t in trims if t["price"]), None)
    facts = spec_facts(car["specs"], car["model"], " ".join(t["name"] for t in trims))
    trim_names = ", ".join(t["name"] for t in trims)
    ribbon = [
        {"value": facts.get("engine", ""), "label": facts.get("fuel", "")}
        if facts.get("engine")
        else {"value": facts.get("fuel", ""), "label": "Двигатель"},
        {"value": facts.get("power", ""), "label": "Мощность"},
        {"value": facts.get("gearbox", ""), "label": "Коробка"},
        {"value": facts.get("drive", ""), "label": "Привод"},
        {"value": trim_names, "label": "Комплектация" if len(trims) == 1 else "Комплектации"},
        {"value": rub(price), "label": "Под ключ"},
    ]
    return {
        "slug": car["slug"],
        "name": name,
        "year": "",
        "brand": car["brand"],
        "model": car["model"],
        "tag": "Под заказ из ОАЭ",
        "price": price,
        "lead": f"{name} {trim_names} с рынка ОАЭ — новый автомобиль под заказ. "
        "Цена под ключ: доставка, таможенные платежи и утилизационный сбор уже включены.",
        "ribbon": [r for r in ribbon if r["value"]],
        "galleryIntro": "",
        "gallery": [{"img": p, "alt": f"{name} — фото {i}"} for i, p in enumerate(photos, 1)],
        "chapters": [],
        "trims": trims,
        "trimsNote": "Цена под ключ включает автомобиль, доставку из ОАЭ, таможенные платежи и утилизационный сбор. "
        "Менеджер подтвердит актуальную цену и сроки — курс валют меняется.",
        "specs": car["specs"],
        "faq": [],
        "similar": similar,
        "fuelType": facts.get("fuel", ""),
        "powerHp": number(facts.get("power", "")),
        "bodyType": facts.get("body", ""),
        "transmission": facts.get("gearbox", ""),
        "description": f"Купить новый {name} из ОАЭ под заказ{f' от {rub(price)}' if price else ''} под ключ: "
        f"{'комплектация' if len(trims) == 1 else 'комплектации'} {trim_names}, доставка, растаможка и утильсбор включены.",
        "_facts": facts,
    }


def main(args: list[str]) -> None:
    offline, refresh = "--offline" in args, "--photos" in args
    cars = build(load_rows(offline))
    if not cars:
        sys.exit("Таблица пуста")
    print(f"Моделей: {len(cars)}", flush=True)

    errors = {}
    for car in cars:
        err = sync_photos(car, refresh, offline)
        if err:
            errors[car["slug"]] = err
            print(f"  ! {car['slug']}: фото не скачаны — {err}", flush=True)

    by_brand: dict[str, list[str]] = {}
    for car in cars:
        by_brand.setdefault(car["brand"], []).append(car["slug"])

    index, models = [], {}
    for car in cars:
        photos = local_photos(car["slug"])
        similar = [s for s in by_brand[car["brand"]] if s != car["slug"]] + [
            c["slug"] for c in cars if c["brand"] != car["brand"]
        ]
        m = model_json(car, photos, similar[:8])
        facts = m.pop("_facts")
        models[car["slug"]] = m
        index.append({
            "slug": m["slug"],
            "brand": m["brand"],
            **{k: facts[k] for k in ("fuel", "body", "drive", "engine", "power", "gearbox") if k in facts},
            "year": "",
            "price": m["price"],
            "priceMax": max((t["price"] or 0 for t in m["trims"]), default=0) or None,
            "photos": photos[:5],
            "name": m["name"],
            "tag": m["tag"],
        })

    # модели, которых больше нет в таблице: убираем их фото
    live = {c["slug"] for c in cars}
    if IMAGES.exists():
        for folder in IMAGES.iterdir():
            if folder.is_dir() and folder.name not in live:
                for p in folder.glob("*"):
                    p.unlink()
                folder.rmdir()

    (DATA / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    (DATA / "models.json").write_text(json.dumps(models, ensure_ascii=False, indent=1) + "\n")
    with_photos = sum(1 for i in index if i["photos"])
    print(f"Готово: {len(index)} моделей, с фото {with_photos}", flush=True)
    # ошибки фото не валят синхронизацию: цены важнее, фото докачаются при следующем запуске
    for slug, err in errors.items():
        print(f"::warning title=Фото {slug}::{err}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
