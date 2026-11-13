import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

type Detail = {
  id: number;
  name: string;
  products: { id: number; description: string; unit: string }[];
};

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
  if (!row) return <p>Загрузка…</p>;
  return (
    <>
      <h2>{row.name}</h2>
      <div className="grid cards">
        {row.products.map((product) => (
          <Link key={product.id} className="card" to={`/products/${product.id}`}>
            <h3>{product.description || "Товар"}</h3>
            <p className="muted">{product.unit}</p>
          </Link>
        ))}
        {row.products.length === 0 && <p>На витрине пока нет товаров.</p>}
      </div>
    </>
  );
}
