import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Shop = {
  id: number;
  name: string;
  title: string;
  address: string;
  about?: string;
  cover: string;
  km: number | null;
  latitude: number | null;
  longitude: number | null;
};

type Ymaps = {
  ready: (cb: () => void) => void;
  Map: new (node: HTMLElement, state: object) => {
    geoObjects: { add: (item: unknown) => void };
    setBounds: (bounds: number[][], options: object) => void;
    destroy: () => void;
  };
  Placemark: new (point: number[], props: object, opts: object) => unknown;
};

function loadYandex(key: string) {
  const existing = document.querySelector("script[data-ymaps]");
  if ((window as unknown as { ymaps?: Ymaps }).ymaps) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Карта не загрузилась")));
    if (!existing) {
      script.setAttribute("data-ymaps", "1");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=ru_RU`;
      document.head.appendChild(script);
    }
  });
}

function ShopsMap({ shops, here, onClose }: { shops: Shop[]; here: [number, number] | null; onClose: () => void }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!box) return;
    let map: { destroy?: () => void } | null = null;
    let cancelled = false;
    const points = shops.filter((shop) => shop.latitude != null && shop.longitude != null);
    api<{ yandex_key: string }>("/api/maps")
      .then(async (config) => {
        await loadYandex(config.yandex_key);
        if (cancelled) return;
        const ymaps = (window as unknown as { ymaps: Ymaps }).ymaps;
        await new Promise<void>((resolve) => ymaps.ready(resolve));
        const center = here || [points[0]?.latitude || 45.03, points[0]?.longitude || 37.3];
        const next = new ymaps.Map(box, { center, zoom: 8, controls: ["zoomControl"] });
        map = next;
        if (here) {
          next.geoObjects.add(new ymaps.Placemark(here, { balloonContent: "Вы здесь" }, { preset: "islands#greenDotIcon" }));
        }
        points.forEach((shop) => {
          next.geoObjects.add(new ymaps.Placemark(
            [shop.latitude as number, shop.longitude as number],
            { balloonContent: `${shop.name}<br>${shop.km != null ? shop.km + " км" : ""}` },
            { preset: "islands#greenIcon" },
          ));
        });
        const bounds = points.map((shop) => [shop.latitude as number, shop.longitude as number]);
        if (here) bounds.push(here);
        if (bounds.length > 1) next.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      map?.destroy?.();
    };
  }, [box, here, shops]);
  return (
    <div className="map-layer" role="dialog" aria-label="Лавки на карте">
      <div className="map-sheet">
        <div className="map-bar">
          <strong>Лавки на карте</strong>
          <span />
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
        <div className="map-canvas" ref={setBox} />
      </div>
    </div>
  );
}

export function ShopsPage() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [note, setNote] = useState("Определяем, где вы");
  const [error, setError] = useState("");
  const [here, setHere] = useState<[number, number] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    function load(lat?: number, lon?: number) {
      const query = lat != null && lon != null ? `?lat=${lat}&lon=${lon}&all=1` : "?all=1";
      api<Shop[]>(`/api/storefronts/nearby${query}`)
        .then((rows) => {
          setShops(rows);
          setNote(lat == null ? "Без геолокации порядок общий" : "Ближние сверху");
        })
        .catch((err: Error) => setError(err.message));
    }
    if (!navigator.geolocation) {
      load();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere([position.coords.latitude, position.coords.longitude]);
        load(position.coords.latitude, position.coords.longitude);
      },
      () => load(),
    );
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!shops) return <p className="muted">Загрузка…</p>;
  return (
    <div className="page">
      <div className="section-head shops-head">
        <div>
          <h2>Лавки</h2>
          <p>{note}</p>
        </div>
        <button type="button" className="map-link" onClick={() => setMapOpen(true)}>Смотреть на карте</button>
      </div>
      {mapOpen && <ShopsMap shops={shops} here={here} onClose={() => setMapOpen(false)} />}
      <div className="shop-list">
        {shops.map((shop) => (
          <Link key={shop.id} className="shop-row" to={`/storefronts/${shop.id}`}>
            {shop.cover ? <img src={shop.cover} alt="" /> : <div className="ph" />}
            <div>
              <span>{shop.title ? shop.title[0].toUpperCase() + shop.title.slice(1) : "Лавка"}</span>
              <strong>{shop.name}</strong>
              <em>{shop.address || "Адрес не указан"}</em>
              {shop.about && <p>{shop.about}</p>}
            </div>
            {shop.km != null && <b>{shop.km < 1 ? "рядом" : `${shop.km} км`}</b>}
          </Link>
        ))}
        {shops.length === 0 && <p className="muted">Лавок пока нет.</p>}
      </div>
    </div>
  );
}
