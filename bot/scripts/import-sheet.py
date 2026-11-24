#!/usr/bin/env python3
"""Импорт каталога бота из Google-таблицы: таблица → bot/data/cars.json и фото bot/data/photos/<id>.jpg.

В таблице 6 вкладок (левый руль: до 2 / 2–3 / 3–4 / 4+ млн, правый руль: до 2 / 2+ млн).
Колонки: Марка, Модель, Цена, Год, Характеристики, Фото. Ссылка на фото стоит один раз на вкладку
(в первой строке) — это публичная папка Яндекс.Диска, где файлы названы «Марка Модель.jpg».
Фото к машине подбираются по названию автоматически; строка, где ссылка стоит у самой машины
(например Suzuki Dzire), берёт первое фото из своей папки.
Машины, для которых фото не нашлось, попадают в cars.json без фото — их список печатается в конце.

Запуск (из корня репозитория):
  python3 bot/scripts/import-sheet.py            # таблица + фото (уже скачанные фото не трогает)
  python3 bot/scripts/import-sheet.py --photos   # перекачать все фото
  python3 bot/scripts/import-sheet.py --csv-dir DIR   # вместо сети — CSV-файлы DIR/<gid>.csv
Зависимости: pip install pillow
"""
from __future__ import annotations

import csv
import difflib
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SHEET_ID = "19oyCGYaEXVpm1gAeSEL67PGTF-oztIA3t_8oGi8Qn_k"
# gid вкладки → (руль, название вкладки)
TABS = {
    "0": ("l", "до 2 млн"),
    "1091477169": ("l", "2–3 млн"),
    "38677747": ("l", "3–4 млн"),
    "1978316248": ("l", "от 4 млн"),
    "1371577056": ("r", "до 2 млн"),
    "2065412685": ("r", "от 2 млн"),
}
ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
DATA = ROOT / "data"
PHOTOS = DATA / "photos"
YADISK = "https://cloud-api.yandex.net/v1/disk/public/resources"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
PHOTO_WIDTH = 900

# опечатки и разночтения в таблице/названиях файлов: нормализованное слово → нормализованное слово
ALIASES = {"chitu": "chutu", "cx-5": "cx5", "w-rv": "wrv", "c-rv": "crv", "a3l": "a3"}


def get(url: str, tries: int = 4) -> bytes:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------- таблица ----------

def load_tab(gid: str, csv_dir: Path | None) -> list[list[str]]:
    if csv_dir:
        text = (csv_dir / f"{gid}.csv").read_text(encoding="utf-8-sig")
    else:
        text = get(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}").decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


def parse_year(s: str) -> str:
    s = norm(s).replace("н.в.", "н.в").replace(" - ", "–").replace("-", "–")
    return s.replace("н.в", "н.в.") if "н.в" in s else s


def summarize_specs(text: str) -> str:
    """Характеристики в одну короткую строку для подписи под фото."""
    lines = [norm(l.lstrip("•-–— ")) for l in text.splitlines() if norm(l.lstrip("•-–— "))]
    if not lines:
        return ""
    short = [l for l in lines if re.match(r"^\d[.,]\d\s*л", l)]
    if short:  # «1.4 л, 141 л.с., бензин, вариатор (CVT), передний привод» — берём до двух вариантов
        both = " / ".join(short[:2])
        return both if len(both) <= 60 else short[0]
    joined = " ".join(lines)
    vol = re.search(r"(\d[.,]\d{1,3})\s*л\b", joined)
    power = re.search(r"(\d{2,3})\s*л\.с\.", joined)
    fuel = next((f for f in ("дизель", "гибрид", "электро", "бензин") if f in joined.lower()), "")
    box = next((n for k, n in (("вариатор", "вариатор (CVT)"), ("робот", "робот"), ("автомат", "АКПП"), ("механ", "МКПП")) if k in joined.lower()), "")
    parts = [f"{vol.group(1).replace(',', '.')} л" if vol else "", f"{power.group(1)} л.с." if power else "", fuel, box]
    parts = [p for p in parts if p]
    return ", ".join(parts) if len(parts) >= 2 else norm(lines[0])[:100]


def read_cars(csv_dir: Path | None) -> tuple[list[dict], dict[str, str]]:
    cars: list[dict] = []
    tab_folders: dict[str, str] = {}
    for gid, (wheel, tab) in TABS.items():
        rows = load_tab(gid, csv_dir)
        first = True
        # у первой вкладки сверху ещё строка-заголовок «До 2000000 ЛЕВЫЙ РУЛЬ»: ищем строку с названиями колонок
        header = next((i for i, r in enumerate(rows) if r and norm(r[0]) == "Марка"), 0)
        for row in rows[header + 1 :]:
            row = (row + [""] * 6)[:6]
            brand, model, price, year, specs, photo = (norm(c) if i != 4 else c for i, c in enumerate(row))
            digits = re.sub(r"\D", "", price)
            if not brand or not model or not digits:
                continue
            link = photo if photo.startswith("http") else ""
            car = {
                "brand": brand,
                "model": model,
                "price": int(digits),
                "from": price.lower().startswith("от"),
                "year": parse_year(year),
                "specs": summarize_specs(specs),
                "wheel": wheel,
                "tab": tab,
            }
            if link and first:
                tab_folders[gid] = link
            elif link:
                car["own_folder"] = link
            car["gid"] = gid
            cars.append(car)
            first = False
    # id: марка-модель-руль, при повторе — с номером
    seen: dict[str, int] = {}
    for c in cars:
        base = slugify(f"{c['brand']} {c['model']}") + f"-{c['wheel']}"
        seen[base] = seen.get(base, 0) + 1
        c["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"
        c["title"] = f"{c['brand']} {c['model']}"
    return cars, tab_folders


# ---------- фото ----------

def folder_files(link: str) -> list[dict]:
    url = f"{YADISK}?public_key={urllib.parse.quote(link, safe='')}&limit=300"
    d = json.loads(get(url))
    return [i for i in d.get("_embedded", {}).get("items", []) if i.get("type") == "file" and str(i.get("mime_type", "")).startswith("image/")]


def tokens(s: str) -> list[str]:
    s = re.sub(r"\.(jpe?g|webp|png)$", "", s.lower())
    s = re.sub(r"[_]+|\d{5,}|—.*$|поменять.*$", " ", s)  # хвосты вроде «_1293502», «— копия», пометок
    out = []
    for t in re.split(r"[\s]+", s):
        t = re.sub(r"[^\wа-яё-]", "", t)
        t = ALIASES.get(t, t)
        t = ALIASES.get(t.replace("-", ""), t.replace("-", ""))
        if t:
            out.append(t)
    return out


def same_token(a: str, b: str) -> bool:
    if a == b:
        return True
    return len(a) >= 4 and len(b) >= 4 and difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def match_score(car: dict, file_name: str) -> float:
    """0 — не подходит. Чем больше, тем лучше. Марка обязана совпасть, модель — по словам."""
    want = tokens(f"{car['brand']} {car['model']}")
    have = tokens(file_name)
    if not want or not have:
        return 0
    # «Jetta VS5»: марка — часть названия, поэтому сверяем весь список слов, а не отдельно марку
    if not same_token(want[0], have[0]):
        return 0
    w_rest, h_rest = want[1:], have[1:]
    if not w_rest or not h_rest:
        return 0
    hit = sum(1 for h in h_rest if any(same_token(h, w) for w in w_rest))
    if hit < len(h_rest):  # все слова модели из названия файла должны быть в названии машины
        # «C class» / «C-class», «Cla» / «Cla-class»: сравниваем модель слитно, файл — начало названия машины
        w_flat, h_flat = "".join(w_rest), "".join(h_rest)
        if len(h_flat) >= 2 and w_flat.startswith(h_flat):
            return len(h_flat) / len(w_flat)
        return 0
    return hit / len(w_rest) + 0.01 * hit - 0.001 * len(w_rest)


def natural(name: str):
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", name)]


def assign_photos(cars: list[dict], tab_folders: dict[str, str]) -> dict[str, dict]:
    """car id → {'url': ссылка на скачивание-ресурс yandex, 'name': имя файла, 'folder': public_key}."""
    result: dict[str, dict] = {}
    for gid, link in tab_folders.items():
        files = folder_files(link)
        tab_cars = [c for c in cars if c["gid"] == gid and "own_folder" not in c]
        pairs = sorted(
            ((match_score(c, f["name"]), c["id"], f["name"]) for c in tab_cars for f in files),
            key=lambda p: -p[0],
        )
        used_cars: set[str] = set()
        used_files: set[str] = set()
        for score, cid, fname in pairs:
            if score <= 0 or cid in used_cars or fname in used_files:
                continue
            used_cars.add(cid)
            used_files.add(fname)
            result[cid] = {"folder": link, "name": fname}
        print(f"вкладка {TABS[gid][0]} {TABS[gid][1]}: файлов {len(files)}, машин {len(tab_cars)}, сопоставлено {len(used_cars)}"
              + (f"; файлы без машины: {', '.join(sorted(f['name'] for f in files if f['name'] not in used_files))}" if len(used_files) < len(files) else ""))
    for c in cars:
        if "own_folder" in c:
            files = sorted(folder_files(c["own_folder"]), key=lambda f: natural(f["name"]))
            if files:
                result[c["id"]] = {"folder": c["own_folder"], "name": files[0]["name"]}
    return result


def download_photo(cid: str, ref: dict, force: bool) -> bool:
    from PIL import Image, ImageOps

    out = PHOTOS / f"{cid}.jpg"
    if out.exists() and not force:
        return True
    q = urllib.parse.urlencode({"public_key": ref["folder"], "path": "/" + ref["name"]})
    # у одиночной папки (own_folder) путь тоже внутри неё; для файла в корне публичной папки так и работает
    href = json.loads(get(f"{YADISK}/download?{q}"))["href"]
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(get(href)))).convert("RGB")
    if img.width > PHOTO_WIDTH:
        img = img.resize((PHOTO_WIDTH, round(img.height * PHOTO_WIDTH / img.width)), Image.LANCZOS)
    PHOTOS.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return True


# Фото, которых нет в папках Яндекс.Диска, берём из каталогов самого сайта (public/new-cars*, главное фото модели).
# id машины → папка модели относительно public/. Это внешний вид модели: у таких машин салон/руль на фото
# могут не совпадать с таблицей (в каталоге ОАЭ руль левый).
SITE_PHOTOS = {
    "suzuki-fronx-l": "new-cars-uae/suzuki-fronx",
    "nissan-magnite-l": "new-cars-uae/nissan-magnite",
    "suzuki-baleno-l": "new-cars-uae/suzuki-baleno",
    "suzuki-grand-vitara-l": "new-cars-uae/suzuki-grand-vitara",
    "suzuki-swift-l": "new-cars-uae/suzuki-swift-mild-hybrid",
    "toyota-veloz-l": "new-cars-uae/toyota-veloz",
    "mitsubishi-asx-l": "new-cars-uae/mitsubishi-asx",
    "mitsubishi-xpander-l": "new-cars-uae/mitsubishi-xpander",
    "mitsubishi-xcross-l": "new-cars-uae/mitsubishi-xpander-cross",
    "suzuki-across-l": "new-cars-uae/suzuki-across",
    "suzuki-ertiga-l": "new-cars-uae/suzuki-ertiga",
    "mitsubishi-eclipse-cross-l": "new-cars-uae/mitsubishi-eclipse-cross",
    "suzuki-jimny-r": "new-cars-uae/suzuki-jimny",
    "mazda-cx-30-r": "new-cars/mazda-cx30",
}
# Фото из каталога drom.ru (страница поколения модели, снимок из каталога) — для машин, которых нет ни в папках
# Яндекс.Диска, ни в каталогах сайта. id машины → путь картинки gen144x2_… на s.auto.drom.ru; скачиваем крупный вариант gen473x2_….
# Поколение выбрано под годы из таблицы. Фото — внешний вид модели: комплектация и руль могут не совпадать.
DROM = "https://s.auto.drom.ru/"
DROM_PHOTOS = {
    "honda-envix-l": "i24288/c/photos/fullsize/honda/envix/gen144x2_honda_envix_1174547.jpg",
    "honda-crider-l": "i24278/c/photos/fullsize/honda/crider/gen144x2_honda_crider_1119794.jpg",
    "kia-morning-l": "i24294/c/photos/fullsize/kia/morning/gen144x2_kia_morning_1210389.jpg",
    "mazda-3-l": "i24276/c/photos/fullsize/mazda/mazda3/gen144x2_mazda_mazda3_1110054.jpg",
    "mercedes-gla-l": "i24240/c/photos/fullsize/mercedes-benz/gla-class/gen144x2_mercedes-benz_gla-class_930675.jpg",
    "mercedes-a-class-l": "i24279/c/photos/fullsize/mercedes-benz/a-class/gen144x2_mercedes-benz_a-class_1123869.jpg",
    "mercedes-glb-l": "i24234/c/photos/fullsize/mercedes-benz/glb/gen144x2_mercedes-benz_glb_899197.jpg",
    "kia-sorento-l": "i24309/c/photos/fullsize/kia/sorento/gen144x2_kia_sorento_1291702.jpg",
    "suzuki-xbee-r": "i24271/c/photos/fullsize/suzuki/xbee/gen144x2_suzuki_xbee_1082525.jpg",
}

# та же модель в другой вкладке: id → id, у которого берём фото
SAME_MODEL = {"honda-stepwgn-r": "honda-stepwgn-r-2"}


def site_photo(cid: str, force: bool) -> bool:
    from PIL import Image

    out = PHOTOS / f"{cid}.jpg"
    if out.exists() and not force:
        return True
    src = REPO / "public" / SITE_PHOTOS[cid] / "1-w1160.webp"
    if not src.exists():
        return False
    img = Image.open(src).convert("RGB")
    if img.width > PHOTO_WIDTH:
        img = img.resize((PHOTO_WIDTH, round(img.height * PHOTO_WIDTH / img.width)), Image.LANCZOS)
    PHOTOS.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return True


def drom_photo(cid: str, force: bool) -> bool:
    from PIL import Image

    out = PHOTOS / f"{cid}.jpg"
    if out.exists() and not force:
        return True
    img = Image.open(io.BytesIO(get(DROM + DROM_PHOTOS[cid].replace("gen144x2", "gen473x2")))).convert("RGB")
    if img.width > PHOTO_WIDTH:
        img = img.resize((PHOTO_WIDTH, round(img.height * PHOTO_WIDTH / img.width)), Image.LANCZOS)
    PHOTOS.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return True


def main() -> None:
    force = "--photos" in sys.argv
    csv_dir = Path(sys.argv[sys.argv.index("--csv-dir") + 1]) if "--csv-dir" in sys.argv else None
    cars, tab_folders = read_cars(csv_dir)
    print(f"машин в таблице: {len(cars)}")
    refs = assign_photos(cars, tab_folders)
    missing: list[str] = []
    for c in cars:
        ref = refs.get(c["id"])
        c["photo"] = False
        if ref:
            try:
                c["photo"] = download_photo(c["id"], ref, force)
            except Exception as e:  # noqa: BLE001
                print(f"  фото {c['title']}: {e}", file=sys.stderr)
        if not c["photo"] and c["id"] in SITE_PHOTOS:
            c["photo"] = site_photo(c["id"], force)
        if not c["photo"] and c["id"] in DROM_PHOTOS:
            try:
                c["photo"] = drom_photo(c["id"], force)
            except Exception as e:  # noqa: BLE001
                print(f"  фото drom {c['title']}: {e}", file=sys.stderr)
        if not c["photo"] and c["id"] in SAME_MODEL and (PHOTOS / f"{SAME_MODEL[c['id']]}.jpg").exists():
            import shutil

            shutil.copy(PHOTOS / f"{SAME_MODEL[c['id']]}.jpg", PHOTOS / f"{c['id']}.jpg")
            c["photo"] = True
        if not c["photo"]:
            missing.append(f"{c['title']} ({'лев.' if c['wheel'] == 'l' else 'прав.'}, {c['tab']})")
    keep = ("id", "brand", "model", "title", "price", "from", "year", "specs", "wheel", "tab", "photo")
    DATA.mkdir(exist_ok=True)
    (DATA / "cars.json").write_text(json.dumps([{k: c[k] for k in keep} for c in cars], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"записано {len(cars)} машин, с фото {len(cars) - len(missing)}")
    if missing:
        print("без фото:\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()
