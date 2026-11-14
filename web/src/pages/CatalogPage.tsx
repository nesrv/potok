import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ProductCard } from "../api";

type Storefront = { id: number; name: string };
type Row = {
  id: number;
  description: string;
  unit: string;
  farm: string;
  photo?: string;
  quantity: number;
  minimum: number;
  price: number | null;
  hours: number;
  due: number | null;
  point: [number, number] | null;
};

function center(points?: number[][]): [number, number] | null {
  if (!points?.length) return null;
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lon = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lat, lon];
}

function km(from: [number, number], to: [number, number]) {
  const [lat1, lon1] = from.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = to.map((value) => (value * Math.PI) / 180);
  const d = 2 * 6371 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));
  return d;
}

export function CatalogPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"distance" | "price" | "term">("term");
  const [here, setHere] = useState<[number, number] | null>(null);
  const [geo, setGeo] = useState("");

  useEffect(() => {
    api<Storefront[]>("/api/storefronts")
      .then(async (farms) => {
        const lists = await Promise.all(
          farms.map((farm) =>
            api<{ products: { id: number }[] }>(`/api/storefronts/${farm.id}`).then((detail) =>
              Promise.all(
                detail.products.map((product) =>
                  api<ProductCard>(`/api/products/${product.id}`).then((card) => ({
                    id: card.id,
                    description: card.description,
                    unit: card.unit,
                    farm: farm.name,
                    photo: card.photos[0]?.url,
                    quantity: Number(card.progress.quantity || 0),
                    minimum: Number(card.progress.minimum || card.minimum),
                    price: card.price == null || card.price === "" ? null : Number(card.price),
                    hours: card.topup_hours,
                    due: card.progress.topup_ends_at ? Date.parse(card.progress.topup_ends_at) : null,
                    point: center(card.districts.find((district) => district.polygon?.length)?.polygon),
                  })),
                ),
              ),
            ),
          ),
        );
        setRows(lists.flat());
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (sort !== "distance" || here || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setHere([position.coords.latitude, position.coords.longitude]),
      () => setGeo("Браузер не отдал местоположение, удалённость не посчитать."),
    );
  }, [sort, here]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows || []).filter((row) => !q || row.description.toLowerCase().includes(q));
    const copy = [...list];
    if (sort === "price") {
      copy.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY));
    } else if (sort === "distance") {
      copy.sort((a, b) => {
        const left = here && a.point ? km(here, a.point) : Number.POSITIVE_INFINITY;
        const right = here && b.point ? km(here, b.point) : Number.POSITIVE_INFINITY;
        return left - right;
      });
    } else {
      copy.sort((a, b) => (a.due ?? Number.POSITIVE_INFINITY) - (b.due ?? Number.POSITIVE_INFINITY) || a.hours - b.hours);
    }
    return copy;
  }, [rows, query, sort, here]);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Загрузка…</p>;
  return (
    <div className="page">
      <div className="section-head">
        <h2>Каталог</h2>
      </div>
      <div className="catalog-tools">
        <label className="search">
          <input
            placeholder="Название товара"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Сортировка">
          <option value="distance">По удалению</option>
          <option value="price">По цене</option>
          <option value="term">По сроку доставки</option>
        </select>
      </div>
      {geo && sort === "distance" && <p className="muted">{geo}</p>}
      <div className="catalog">
        {visible.map((row) => {
          const away = here && row.point ? km(here, row.point) : null;
          return (
            <Link key={row.id} className="catalog-card" to={`/products/${row.id}`}>
              {row.photo ? <img src={row.photo} alt="" /> : <div className="ph" />}
              <div>
                <strong>{row.description}</strong>
                <span>{row.farm}</span>
                <em>
                  {row.price == null ? "Цена не указана" : `${row.price} ₽ / ${row.unit}`}
                  {away != null ? ` · ${away < 10 ? away.toFixed(1) : Math.round(away)} км` : ""}
                </em>
                <em>
                  {row.due
                    ? `Привезут к ${new Date(row.due).toLocaleString("ru")}`
                    : `Окно дозаказа ${row.hours} ч · ${row.quantity} из ${row.minimum} ${row.unit}`}
                </em>
              </div>
            </Link>
          );
        })}
      </div>
      {visible.length === 0 && <p className="empty">Таких товаров нет.</p>}
    </div>
  );
}
