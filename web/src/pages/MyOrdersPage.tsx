import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Line = {
  id: number;
  order_id: number;
  product_id: number;
  description: string;
  farm: string;
  quantity: string;
  unit: string;
  status: string;
  address: string;
};

const statusName: Record<string, string> = {
  collecting: "Сбор",
  topup: "Дозаказ",
  closed: "Закрыт",
};

export function MyOrdersPage() {
  const [rows, setRows] = useState<Line[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Line[]>("/api/me/lines")
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Загрузка…</p>;

  return (
    <div className="page">
      <div className="section-head">
        <h2>Мои заказы</h2>
      </div>
      {rows.length === 0 && (
        <p className="empty">
          Заявок пока нет. Откройте сбор на главной и нажмите «Присоединиться».
        </p>
      )}
      <div className="stack">
        {rows.map((row) => (
          <Link key={row.id} className="order-card" to={`/products/${row.product_id}`}>
            <div>
              <strong>{row.description}</strong>
              <span>{row.farm}</span>
              <em>{row.address}</em>
            </div>
            <div className="order-side">
              <b>
                {Number(row.quantity)} {row.unit}
              </b>
              <span>{statusName[row.status] || row.status}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
