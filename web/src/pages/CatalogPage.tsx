import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Storefront = { id: number; name: string };

export function CatalogPage() {
  const [rows, setRows] = useState<{ id: number; description: string; unit: string; farm: string }[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Storefront[]>("/api/storefronts")
      .then(async (farms) => {
        const lists = await Promise.all(
          farms.map((farm) =>
            api<{ products: { id: number; description: string; unit: string }[] }>(`/api/storefronts/${farm.id}`).then(
              (detail) => detail.products.map((product) => ({ ...product, farm: farm.name })),
            ),
          ),
        );
        setRows(lists.flat());
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p>Загрузка…</p>;
  return (
    <div className="grid cards">
      <h2>Каталог</h2>
      {rows.map((row) => (
        <Link key={row.id} className="card" to={`/products/${row.id}`}>
          <h3>{row.description}</h3>
          <p className="muted">{row.farm} · {row.unit}</p>
        </Link>
      ))}
      {rows.length === 0 && <p>Товаров пока нет.</p>}
    </div>
  );
}
