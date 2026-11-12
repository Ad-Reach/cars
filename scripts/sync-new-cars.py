#!/usr/bin/env python3
"""Синхронизация каталога новых авто из Китая (new.rangauto.ru).

Источник — раздел /new/ сайта-донора (SOURCE). Скрипт обходит список моделей и страницу
каждой модели, сохраняет данные в src/data/new-cars/ (JSON) и фото в public/new-cars/.
Чужой бренд, телефоны и рейтинги вычищаются, в данных остаются только модель, цены,
комплектации, характеристики, тексты, FAQ и фото.

Запуск: python3 scripts/sync-new-cars.py            (все модели)
        python3 scripts/sync-new-cars.py byd-yuan-up (одна модель)
Зависимости: pip install beautifulsoup4 lxml
"""
from __future__ import annotations

import concurrent.futures as cf
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, Tag

SOURCE = "https://encarrus-china.ru"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data" / "new-cars"
IMAGES = ROOT / "public" / "new-cars"
SIZES = ("w380", "w760", "w1160")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"

# Чужой бренд и контакты — убираются из всех текстов
BRAND_RE = re.compile(r"\b(?:EncarRus|Encar\s?RUS|ЭнкарРус|Энкар\s?Рус|Энкаррус|Енкаррус|encarrus(?:-china)?\.ru)\b", re.I)
FOREIGN_PHONE_RE = re.compile(r"8[\s\-]?800[\s\-]?505[\s\-]?18[\s\-]?12")


class NotFound(Exception):
    pass


def fetch(url: str, binary: bool = False, tries: int = 15):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru"})
            with urllib.request.urlopen(req, timeout=8) as r:
                body = r.read()
                return body if binary else body.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound(url) from e
            last = e
        except Exception as e:  # сайт-донор часто рвёт соединения — повторяем
            last = e
        time.sleep(min(0.5 * (attempt + 1), 3))
    raise RuntimeError(f"{url}: {last}")


def clean(text: str | None) -> str:
    if not text:
        return ""
    text = html.unescape(text).replace("\xa0", " ")
    text = BRAND_RE.sub("Ранг Авто", text)
    text = FOREIGN_PHONE_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def txt(el: Tag | None) -> str:
    return clean(el.get_text(" ", strip=True)) if el else ""


def heading(el: Tag | None) -> dict:
    """h2 вида «Компактный<br><em>городской кроссовер</em>» → {title, accent}."""
    if not el:
        return {"title": "", "accent": ""}
    em = el.find("em")
    accent = txt(em)
    if em:
        em.extract()
    return {"title": txt(el), "accent": accent}


def img_base(src: str | None) -> str | None:
    """/new/slug/img/1-w760.webp → 1 (имя без размера)."""
    if not src:
        return None
    m = re.search(r"/img/([^/]+?)(?:-w\d+)?\.webp", src)
    return m.group(1) if m else None


def number(text: str) -> int | None:
    """Первое число в строке: «2 688 000 – 3 268 000 ₽» → 2688000."""
    m = re.search(r"\d[\d\s\u00a0]*", text or "")
    digits = re.sub(r"\D", "", m.group(0)) if m else ""
    return int(digits) if digits else None


# ---------- список моделей ----------

def parse_list(page: str) -> list[dict]:
    soup = BeautifulSoup(page, "lxml")
    out, seen = [], set()
    for item in soup.select(".ndcn-item"):
        a = item.find("a", href=re.compile(r"^/new/[^/]+/$"))
        if not a:
            continue
        slug = a["href"].strip("/").split("/")[-1]
        if slug in seen:
            continue
        seen.add(slug)
        props = {txt(p.select_one(".c-prop-k")): txt(p.select_one(".c-prop-v")) for p in item.select(".c-prop")}
        prices = [number(x) for x in re.findall(r"\d[\d\s\u00a0]*\d", txt(item.select_one(".c-price")))]
        prices = [x for x in prices if x]
        photos = []
        for ph in item.select(".c-photo[data-src]"):
            base = img_base(ph.get("data-src"))
            if base and base not in photos:
                photos.append(base)
        out.append({
            "slug": slug,
            "brand": clean(item.get("data-brand")),
            "fuel": clean(item.get("data-fuel")),
            "body": clean(item.get("data-body")) or props.get("Кузов", ""),
            "drive": clean(item.get("data-drive")) or props.get("Привод", ""),
            "engine": props.get("Двиг.", ""),
            "power": props.get("Мощн.", ""),
            "gearbox": props.get("Коробка", ""),
            "year": props.get("Год", ""),
            "price": number(item.get("data-price") or "") or (min(prices) if prices else None),
            "priceMax": max(prices) if len(prices) > 1 else None,
            "labels": [t for t in (txt(l) for l in item.select(".c-label")) if t and t != clean(item.get("data-fuel"))],
            "photos": photos[:5],
        })
    return out


# ---------- страница модели ----------

def parse_model(slug: str, page: str) -> dict:
    soup = BeautifulSoup(page, "lxml")
    lds = []
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            lds.append(json.loads(sc.string or ""))
        except Exception:
            pass
    car_ld = next((d for d in lds if d.get("@type") == "Car"), {})
    faq_ld = next((d for d in lds if d.get("@type") == "FAQPage"), {})

    h1 = soup.select_one(".ndcb-h1")
    year_el = h1.find("em") if h1 else None
    year = txt(year_el)
    name = txt(h1).removesuffix(year).strip() if h1 else slug

    cover = soup.select_one(".ndcb-cover-body")
    ribbon = [{"value": txt(i.find("b")), "label": txt(i.find("span"))} for i in soup.select(".ndcb-rib-i")]

    # галерея
    gallery = []
    for th in soup.select(".ndcb-gal-strip [data-src]"):
        base = img_base(th.get("data-src"))
        if base:
            gallery.append({"img": base, "alt": clean(th.get("data-cap"))})
    intro = soup.select_one(".ndcb-gal").find_previous(class_="ndcb-sec-sub") if soup.select_one(".ndcb-gal") else None

    # главы «дизайн / комфорт / техника»
    chapters = []
    for ch in soup.select(".ndcb-chap"):
        card = ch.select_one(".ndcb-chap-card")
        ph = ch.select_one(".ndcb-chap-ph img")
        chapters.append({
            "eyebrow": txt(card.select_one(".ndcb-eyebrow")) if card else "",
            **heading(card.select_one(".ndcb-h2") if card else None),
            "text": txt(card.find("p")) if card else "",
            "img": img_base(ph.get("src")) if ph else None,
            "alt": clean(ph.get("alt")) if ph else "",
            "dark": "ndcb-chap--dark" in (ch.get("class") or []),
        })

    # комплектации
    badges = [txt(t.select_one(".ndcb-tab-badge")) for t in soup.select(".ndcb-tab")]
    trims = []
    for i, p in enumerate(soup.select(".ndcb-panel")):
        head_t = p.select_one(".ndcb-panel-t")
        price_el = p.select_one(".ndcb-panel-p b")
        features = [txt(li) for li in p.select(".ndcb-panel-body li")]
        trims.append({
            "name": txt(head_t.find("b")) if head_t else "",
            "sub": txt(head_t.find("span")) if head_t else "",
            "badge": badges[i] if i < len(badges) else "",
            "price": number(txt(price_el)) if price_el else None,
            "features": [f for f in features if f],
        })
    foot = soup.select_one(".ndcb-panel-foot")
    if foot:
        for b in foot.find_all(["a", "button", "label"]):
            b.decompose()
    trims_note = txt(foot)

    specs = [[txt(r.find("dt")), txt(r.find("dd"))] for r in soup.select(".ndcb-specs-r")]

    faq = [
        {"q": clean(q.get("name")), "a": clean((q.get("acceptedAnswer") or {}).get("text"))}
        for q in faq_ld.get("mainEntity", [])
    ]
    faq = [f for f in faq if f["q"] and f["a"]]

    similar = []
    for a in soup.select(".ndcb-sim a[href^='/new/']"):
        s = a["href"].strip("/").split("/")[-1]
        if s and s != "new" and s != slug and s not in similar:
            similar.append(s)

    meta_desc = soup.find("meta", attrs={"name": "description"})
    engine = car_ld.get("vehicleEngine") or {}
    power = (engine.get("enginePower") or {}).get("value")

    return {
        "slug": slug,
        "name": name,
        "year": year,
        "brand": clean((car_ld.get("brand") or {}).get("name")),
        "model": clean(car_ld.get("model")),
        "tag": txt(cover.select_one(".ndcb-tag")) if cover else "",
        "price": number(txt(cover.select_one(".ndcb-cover-priceline b"))) if cover else None,
        "lead": txt(cover.select_one(".ndcb-cover-sub")) if cover else "",
        "ribbon": [r for r in ribbon if r["value"]],
        "galleryIntro": txt(intro),
        "gallery": gallery,
        "chapters": [c for c in chapters if c["text"]],
        "trims": trims,
        "trimsNote": trims_note,
        "specs": [s for s in specs if s[0] and s[1]],
        "faq": faq,
        "similar": similar[:8],
        "fuelType": clean(engine.get("fuelType")),
        "powerHp": number(str(power)) if power else None,
        "bodyType": clean(car_ld.get("bodyType")),
        "transmission": clean(car_ld.get("vehicleTransmission")),
        "description": clean(car_ld.get("description") or (meta_desc.get("content") if meta_desc else "")),
    }


def download_images(slug: str, names: set[str]) -> int:
    folder = IMAGES / slug
    folder.mkdir(parents=True, exist_ok=True)
    count = 0
    for name in sorted(names):
        for size in SIZES:
            target = folder / f"{name}-{size}.webp"
            if target.exists() and target.stat().st_size > 0:
                continue
            try:
                target.write_bytes(fetch(f"{SOURCE}/new/{slug}/img/{name}-{size}.webp", binary=True))
                count += 1
            except NotFound:
                pass
        # у донора бывают не все размеры: недостающий заменяем ближайшим имеющимся
        have = [sz for sz in SIZES if (folder / f"{name}-{sz}.webp").exists()]
        for size in SIZES:
            if size not in have and have:
                nearest = min(have, key=lambda sz: abs(SIZES.index(sz) - SIZES.index(size)))
                (folder / f"{name}-{size}.webp").write_bytes((folder / f"{name}-{nearest}.webp").read_bytes())
    return count


def sync_model(slug: str, summary: dict) -> dict:
    data = parse_model(slug, fetch(f"{SOURCE}/new/{slug}/"))
    names = {g["img"] for g in data["gallery"]} | {c["img"] for c in data["chapters"] if c["img"]} | set(summary.get("photos", []))
    downloaded = download_images(slug, names)
    (DATA / "models" / f"{slug}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"  {slug}: {len(data['trims'])} компл., {len(data['gallery'])} фото, новых файлов {downloaded}", flush=True)
    return data


def main(only: list[str]) -> None:
    (DATA / "models").mkdir(parents=True, exist_ok=True)
    print("Список моделей…", flush=True)
    summaries = parse_list(fetch(f"{SOURCE}/new/"))
    if not summaries:
        sys.exit("Список моделей пуст — разметка сайта-донора изменилась")
    print(f"  моделей: {len(summaries)}", flush=True)
    todo = [s for s in summaries if not only or s["slug"] in only]

    models: dict[str, dict] = {}
    failed = []
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(sync_model, s["slug"], s): s["slug"] for s in todo}
        for f in cf.as_completed(futures):
            slug = futures[f]
            try:
                models[slug] = f.result()
            except Exception as e:
                failed.append(slug)
                print(f"  ! {slug}: {e}", flush=True)

    if not only:
        index = []
        for s in summaries:
            m = models.get(s["slug"])
            if m is None:
                path = DATA / "models" / f"{s['slug']}.json"
                if not path.exists():
                    continue  # новая модель, которую не удалось скачать, — попадёт в следующий раз
                m = json.loads(path.read_text())
            index.append({
                **s,
                "name": m["name"],
                "year": m["year"] or s.get("year", ""),
                "brand": s.get("brand") or m["brand"],
                "tag": m["tag"],
                "price": s.get("price") or m["price"],
                "photos": s["photos"] or [g["img"] for g in m["gallery"][:5]],
            })
        # модели, которых больше нет у донора, убираем
        live = {s["slug"] for s in index}
        for path in (DATA / "models").glob("*.json"):
            if path.stem not in live:
                path.unlink()
        (DATA / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
        print(f"Готово: {len(index)} моделей в каталоге", flush=True)

    leaked = [p.name for p in DATA.rglob("*.json") if re.search(r"encar|энкар|енкар", p.read_text(), re.I)]
    if leaked:
        sys.exit(f"В данных осталось упоминание чужого бренда: {leaked}")
    if failed:
        sys.exit(f"Не скачаны: {', '.join(failed)}")


if __name__ == "__main__":
    main(sys.argv[1:])
