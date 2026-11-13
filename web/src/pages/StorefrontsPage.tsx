import { useEffect, useMemo, useState } from "react";
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

function matches(text: string, words: string[]) {
  const value = text.toLowerCase();
  return words.some((word) => value.includes(word));
}

export function StorefrontsPage() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [farms, setFarms] = useState<Storefront[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

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
        <img className="header-art" src="/header.png?v=3" alt="Поток. Совместные закупки у фермеров" />
      </header>
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
        <Link to="/catalog">Смотреть все →</Link>
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
