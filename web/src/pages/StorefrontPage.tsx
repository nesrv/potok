import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

type Product = {
  id: number;
  description: string;
  unit: string;
  photo?: string;
  minimum?: string;
  price?: string;
  status?: string;
  quantity?: string;
  buyers?: number;
  remaining?: string;
  districts?: string[];
};

type Detail = {
  id: number;
  name: string;
  title?: string;
  address?: string;
  pickup?: boolean;
  services?: string[];
  offers?: { name: string; text: string; photo?: string }[];
  gallery?: { photo: string; caption: string }[];
  products: Product[];
};

const statusName: Record<string, string> = {
  collecting: "Собираем",
  topup: "Минимум набран",
  closed: "Сбор закрыт",
};

function amount(value?: string) {
  if (!value) return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : value;
}

function kind(title?: string) {
  const word = (title || "лавка").trim();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function StorefrontPage() {
  const { id } = useParams();
  const [row, setRow] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Detail>(`/api/storefronts/${id}`)
      .then(setRow)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!row) return <p className="stall-wait">Загрузка…</p>;

  const tags = [
    ...(row.pickup ? ["Самовывоз"] : []),
    ...(row.services || []),
  ];

  return (
    <article className="stall">
      <header className="stall-head">
        <p className="stall-kind">{kind(row.title)}</p>
        <h1>{row.name}</h1>
        {row.address ? <p className="stall-address">{row.address}</p> : null}
        {tags.length > 0 && (
          <ul className="stall-tags">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </header>

      <section className="stall-block">
        <h2>В продаже</h2>
        <div className="grid cards">
          {row.products.map((product) => (
            <Link key={product.id} className="card product-card" to={`/products/${product.id}`}>
              {product.photo ? (
                <img src={product.photo} alt="" />
              ) : (
                <span className="ph" aria-hidden="true" />
              )}
              {product.status ? (
                <span className={`stall-status ${product.status}`}>{statusName[product.status] || "Сбор"}</span>
              ) : null}
              <h3>{(product.description || "Товар").split(".")[0]}</h3>
              {product.price ? <p className="stall-price">{amount(product.price)} ₽ / {product.unit}</p> : null}
              <p className="stall-meta">
                {product.minimum ? `от ${amount(product.minimum)} ${product.unit}` : product.unit}
                {product.districts?.length ? ` · ${product.districts.join(", ")}` : ""}
              </p>
              {product.quantity ? (
                <p className="stall-progress">Уже {amount(product.quantity)} {product.unit}</p>
              ) : null}
            </Link>
          ))}
          {row.products.length === 0 && <p className="muted">Пока нет товаров.</p>}
        </div>
      </section>

      {!!row.gallery?.length && (
        <div className="gallery">
          {row.gallery.map((shot) => (
            <figure key={shot.photo}>
              <img src={shot.photo} alt={shot.caption || row.name} />
              {shot.caption ? <figcaption>{shot.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      )}

      {!!row.offers?.length && (
        <section className="stall-block">
          <h2>На хозяйстве</h2>
          <div className="offer-services">
            {row.offers.map((offer) => (
              <article key={offer.name} className="card service-card">
                {offer.photo ? <img src={offer.photo} alt="" /> : null}
                <div>
                  <h3>{offer.name}</h3>
                  <p>{offer.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
