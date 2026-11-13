import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Order = {
  id: number;
  status: string;
  quantity: string;
  minimum: string | null;
  unit: string;
  topup_ends_at: string | null;
  lines: { id: number; buyer_id: number; quantity: string; address: string }[];
};

export function OrderPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Order>(`/api/orders/${id}`)
      .then(setOrder)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!order) return <p>Загрузка…</p>;
  return (
    <section className="card">
      <h2>Заказ {order.id}</h2>
      <p>
        {order.status} · {order.quantity} {order.unit}
        {order.minimum ? ` · минимум был ${order.minimum}` : ""}
      </p>
      {order.topup_ends_at && <p>Окно до {new Date(order.topup_ends_at).toLocaleString()}</p>}
      <div className="stack">
        {order.lines.map((line) => (
          <p key={line.id}>
            Участник {line.buyer_id}: {line.quantity} · {line.address}
          </p>
        ))}
      </div>
    </section>
  );
}
