import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ProductCard } from "../api";

type Storefront = { id: number; name: string };
type Offer = {
  id: number;
  description: string;
  unit: string;
  storefrontName: string;
  photo?: string;
  quantity: string;
  minimum: string;
  buyers: number | null;
  remaining: string | null;
};

const categories = [
  { id: "meat", label: "Мясо\nи птица", words: ["мяс", "птиц", "индей", "кур", "говя"], icon: "/cat-meat.png" },
  { id: "milk", label: "Молочные\nпродукты", words: ["молок", "сыр", "творог", "кефир"], icon: "/cat-milk.png" },
  { id: "veg", label: "Овощи\nи фрукты", words: ["овощ", "фрукт", "помид", "яблок", "зелен"], icon: "/cat-veg.png" },
  { id: "other", label: "Другое", words: [], icon: "/cat-other.png" },
];

const nearby = [
  { name: "Зелёный луг", line: "Молоко, сыры", cover: "/farm-cow.jpg" },
  { name: "Доброе подворье", line: "Яйца, птица", cover: "/farm-eggs.jpg" },
  { name: "Солнечная грядка", line: "Овощи, зелень", cover: "/farm-tomatoes.jpg" },
];

type Shop = { id: number; name: string; title: string; latitude: number; longitude: number; km: number };

function NearbyMap({
  here,
  label,
  onClose,
  onPick,
}: {
  here: [number, number] | null;
  label: string;
  onClose: () => void;
  onPick: (point: [number, number]) => void;
}) {
  const node = useState<HTMLDivElement | null>(null);
  const [box, setBox] = node;
  const [note, setNote] = useState(here ? "Ищем лавки в радиусе 80 км" : "Нужно местоположение");

  useEffect(() => {
    if (!box || !here) return;
    let map: { destroy?: () => void } | null = null;
    let cancelled = false;
    api<{ yandex_key: string }>("/api/maps")
      .then(async (config) => {
        const shops = await api<Shop[]>(`/api/storefronts/nearby?lat=${here[0]}&lon=${here[1]}&km=80`);
        if (cancelled) return;
        setNote(shops.length ? `${shops.length} в радиусе 80 км` : "В радиусе 80 км лавок пока нет");
        await loadYandex(config.yandex_key);
        if (cancelled) return;
        const ymaps = (window as unknown as { ymaps: Ymaps }).ymaps;
        await new Promise<void>((resolve) => ymaps.ready(resolve));
        map = new ymaps.Map(box, { center: here, zoom: 8, controls: ["zoomControl"] });
        map.events.add("click", (event: { get: (name: string) => [number, number] }) => {
          const coords = event.get("coords");
          onPick([coords[0], coords[1]]);
        });
        const circle = new ymaps.Circle([here, 80000], {}, {
          fillColor: "#1f9d4522",
          strokeColor: "#1f9d45",
          strokeWidth: 2,
        });
        map.geoObjects.add(circle);
        map.geoObjects.add(new ymaps.Placemark(here, { balloonContent: label }, { preset: "islands#greenDotIcon" }));
        shops.forEach((shop) => {
          map?.geoObjects.add(new ymaps.Placemark(
            [shop.latitude, shop.longitude],
            { balloonContent: `${shop.name}<br>${shop.title} · ${shop.km} км` },
            { preset: "islands#greenIcon" },
          ));
        });
        const bounds = circle.geometry.getBounds();
        if (bounds) map.setBounds(bounds, { checkZoomRange: true });
      })
      .catch(() => setNote("Карта не открылась"));
    return () => {
      cancelled = true;
      map?.destroy?.();
    };
  }, [box, here]);

  return (
    <div className="map-layer" role="dialog" aria-label="Лавки рядом">
      <div className="map-sheet">
        <div className="map-bar">
          <strong>80 км. Нажмите карту, чтобы перенести точку</strong>
          <span>{note}</span>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
        <div className="map-canvas" ref={setBox} />
      </div>
    </div>
  );
}

type Ymaps = {
  ready: (cb: () => void) => void;
  Map: new (node: HTMLElement, state: object) => {
    geoObjects: { add: (item: unknown) => void };
    events: { add: (name: string, cb: (event: { get: (key: string) => [number, number] }) => void) => void };
    setBounds: (b: unknown, o: object) => void;
    destroy: () => void;
  };
  Circle: new (geometry: unknown, props: object, opts: object) => { geometry: { getBounds: () => unknown } };
  Placemark: new (point: number[], props: object, opts: object) => unknown;
};

function loadYandex(key: string) {
  const existing = document.querySelector("script[data-ymaps]");
  if ((window as unknown as { ymaps?: Ymaps }).ymaps) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("ymaps")));
    if (!existing) {
      script.setAttribute("data-ymaps", "1");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=ru_RU`;
      document.head.appendChild(script);
    }
  });
}

function matches(text: string, words: string[]) {
  const value = text.toLowerCase();
  return words.some((word) => value.includes(word));
}

export function StorefrontsPage() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [farms, setFarms] = useState<Storefront[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("Укажите населённый пункт");
  const [draft, setDraft] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const hintRequest = useRef(0);
  const [here, setHere] = useState<[number, number] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [category, setCategory] = useState("");

  function remember(label: string, point: [number, number]) {
    setPlace(label);
    setDraft(label);
    setHere(point);
    setHints([]);
    localStorage.setItem("potok_place", JSON.stringify({ label, lat: point[0], lon: point[1] }));
  }

  useEffect(() => {
    const saved = localStorage.getItem("potok_place");
    if (saved) {
      try {
        const row = JSON.parse(saved) as { label: string; lat: number; lon: number };
        setPlace(row.label);
        setDraft(row.label);
        setHere([row.lat, row.lon]);
        return;
      } catch {
        localStorage.removeItem("potok_place");
      }
    }
    if (!navigator.geolocation) {
      setPlace("Укажите населённый пункт");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [position.coords.latitude, position.coords.longitude];
        setHere(point);
        api<{ label: string }>(`/api/geo/here?lat=${point[0]}&lon=${point[1]}`)
          .then((row) => setPlace(row.label || "Место не определилось"))
          .catch(() => setPlace("Место не определилось"));
      },
      () => setPlace("Разрешите доступ к местоположению"),
    );
  }, []);

  useEffect(() => {
    api<Storefront[]>("/api/storefronts")
      .then(async (rows) => {
        setFarms(rows);
        const lists = await Promise.all(
          rows.map((row) =>
            api<{ products: { id: number }[] }>(`/api/storefronts/${row.id}`).then((detail) =>
              Promise.all(
                detail.products.map((product) =>
                  api<ProductCard>(`/api/products/${product.id}`).then((card) => ({
                    id: card.id,
                    description: card.description,
                    unit: card.unit,
                    storefrontName: row.name,
                    photo: card.photos[0]?.url,
                    quantity: card.progress.quantity || "0",
                    minimum: card.progress.minimum || card.minimum,
                    buyers: card.progress.buyers,
                    remaining: card.progress.remaining,
                  })),
                ),
              ),
            ),
          ),
        );
        setOffers(lists.flat());
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (offers || []).filter((offer) => {
      const text = `${offer.description} ${offer.storefrontName}`;
      if (q && !text.toLowerCase().includes(q)) return false;
      if (!category || category === "other") {
        if (category === "other") {
          const known = categories.filter((item) => item.id !== "other");
          return !known.some((item) => matches(text, item.words));
        }
        return true;
      }
      const picked = categories.find((item) => item.id === category);
      return picked ? matches(text, picked.words) : true;
    });
  }, [offers, query, category]);

  if (error) return <p className="error">{error}</p>;
  if (!offers) return <p>Загрузка…</p>;

  return (
    <div className="home">
      <header className="hero">
        <form
          className="place-line"
          onSubmit={(event) => {
            event.preventDefault();
            api<{ label: string; lat: number; lon: number }>(`/api/geo/place?q=${encodeURIComponent(draft)}`)
              .then((row) => remember(row.label, [row.lat, row.lon]))
              .catch(() => setPlace("Населённый пункт не найден"));
          }}
        >
          <input
            value={draft}
            placeholder="Населённый пункт"
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              const requestId = ++hintRequest.current;
              if (value.trim().length < 2) {
                setHints([]);
                return;
              }
              window.setTimeout(() => {
                if (requestId !== hintRequest.current) return;
                api<string[]>(`/api/geo/suggest?q=${encodeURIComponent(value)}`)
                  .then((rows) => {
                    if (requestId === hintRequest.current) setHints(rows);
                  })
                  .catch(() => {
                    if (requestId === hintRequest.current) setHints([]);
                  });
              }, 250);
            }}
          />
          {hints.length > 0 && (
            <div className="place-hints">
              {hints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setDraft(hint);
                    setHints([]);
                    api<{ label: string; lat: number; lon: number }>(`/api/geo/place?q=${encodeURIComponent(hint)}`)
                      .then((row) => remember(row.label, [row.lat, row.lon]))
                      .catch(() => setPlace("Населённый пункт не найден"));
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          )}
          <button type="submit">Это мой город</button>
        </form>
        <img className="header-art" src="/potok-header.png?v=1" alt="Поток. Совместные закупки у фермеров" />
      </header>
      {mapOpen && (
        <NearbyMap
          here={here}
          label={place}
          onClose={() => setMapOpen(false)}
          onPick={(point) => {
            api<{ label: string }>(`/api/geo/here?lat=${point[0]}&lon=${point[1]}`)
              .then((row) => remember(row.label || "Точка на карте", point))
              .catch(() => remember("Точка на карте", point));
          }}
        />
      )}
      <div className="search-row">
      <label className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="#9aa096" strokeWidth="1.8" />
          <path d="M16 16.5 20 20.5" fill="none" stroke="#9aa096" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          placeholder="Найти товар или ферму"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="clear" aria-label="Очистить поиск" onClick={() => setQuery("")}>
            ×
          </button>
        )}
        <button type="button" className="filters" aria-label="Фильтры">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="#1d6b32" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="8" cy="7" r="2.2" fill="#fff" stroke="#1d6b32" strokeWidth="1.8" />
            <circle cx="15" cy="12" r="2.2" fill="#fff" stroke="#1d6b32" strokeWidth="1.8" />
            <circle cx="10" cy="17" r="2.2" fill="#fff" stroke="#1d6b32" strokeWidth="1.8" />
          </svg>
        </button>
      </label>
      <button type="button" className="map-link" onClick={() => setMapOpen(true)}>Показать на карте</button>
      </div>
      <div className="cats">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={category === item.id ? "cat on" : "cat"}
            aria-pressed={category === item.id}
            onClick={() => setCategory(category === item.id ? "" : item.id)}
          >
            <img src={item.icon} alt="" />
            {item.label}
          </button>
        ))}
      </div>
      <div className="section-head">
        <h2>Актуальные сборы</h2>
        <Link to="/catalog">Смотреть все →</Link>
      </div>
      <div className="offers">
        {visible.map((offer) => (
          <Link key={offer.id} className="offer" to={`/products/${offer.id}`}>
            <div className="offer-photo">
              <img src={offer.photo || "/fillet.jpg"} alt="" />
              <span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="5" r="2.2" fill="none" stroke="#fff" strokeWidth="1.4" />
                  <path d="M3.5 13c.6-2.4 2.2-3.5 4.5-3.5S12 10.6 12.5 13" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Совместная покупка
              </span>
            </div>
            <div className="offer-body">
              <div className="offer-top">
                <h3>{offer.description}</h3>
                <b>{offer.unit}</b>
              </div>
              <p className="farm">Ферма «{offer.storefrontName}»</p>
              <p className="qty">
                <strong>
                  {Number(offer.quantity)} {offer.unit} из {Number(offer.minimum)} {offer.unit}
                </strong>
                {offer.buyers != null ? <span>Участвуют: {offer.buyers}</span> : null}
              </p>
              <div className="bar-track">
                <span
                  style={{
                    width: `${Math.min(100, (Number(offer.quantity) / Number(offer.minimum || 1)) * 100)}%`,
                  }}
                />
              </div>
              <div className="offer-foot">
                <p>{offer.remaining ? `Ещё нужно: ${offer.remaining} ${offer.unit}` : "Минимум набран"}</p>
                <span className="join">Присоединиться</span>
              </div>
            </div>
          </Link>
        ))}
        {visible.length === 0 && <p className="empty">Сборов по этому запросу нет. Снимите фильтр или поищите другое название.</p>}
      </div>
      <div className="section-head">
        <h2>Фермеры рядом</h2>
        <Link to="/shops">Смотреть все →</Link>
      </div>
      <div className="farms">
        {nearby.map((farm) => {
          const live = farms.find((row) => row.name === farm.name);
          const card = (
            <>
              <img src={farm.cover} alt="" />
              <strong>{farm.name}</strong>
              <span>{farm.line}</span>
            </>
          );
          return live ? (
            <Link key={farm.name} className="farm-card" to={`/storefronts/${live.id}`}>{card}</Link>
          ) : (
            <div key={farm.name} className="farm-card">{card}</div>
          );
        })}
      </div>
    </div>
  );
}
