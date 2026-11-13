import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, ProductCard, userId } from "../api";

type Notice = { id: number; text: string; created_at: string };
type OrderLine = { id: number; buyer_id: number; quantity: string; address: string };

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState<ProductCard | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [address, setAddress] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [ownLines, setOwnLines] = useState<OrderLine[]>([]);

  function load() {
    setError("");
    return api<ProductCard>(`/api/products/${id}`)
      .then(async (next) => {
        setCard(next);
        if (next.progress.order_id && getToken()) {
          try {
            const order = await api<{ lines: OrderLine[] }>(`/api/orders/${next.progress.order_id}`);
            const me = userId();
            setOwnLines(order.lines.filter((line) => line.buyer_id === me));
          } catch {
            setOwnLines([]);
          }
        } else {
          setOwnLines([]);
        }
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!districtId) {
      setNotices([]);
      return;
    }
    api<Notice[]>(`/api/districts/${districtId}/notices`)
      .then(setNotices)
      .catch(() => setNotices([]));
  }, [districtId]);

  async function order(event: FormEvent) {
    event.preventDefault();
    if (!getToken()) {
      navigate("/login");
      return;
    }
    setInfo("");
    setError("");
    try {
      await api(`/api/products/${id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          quantity,
          district_id: Number(districtId),
          address,
        }),
      });
      setInfo("Заявка принята");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку");
    }
  }

  async function cancel(lineId: number) {
    setError("");
    try {
      await api(`/api/lines/${lineId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить");
    }
  }

  if (!card && !error) return <p>Загрузка…</p>;
  if (!card) return <p className="error">{error}</p>;
  const progress = card.progress;
  const minimum = Number(progress.minimum || card.minimum);
  const quantityNow = Number(progress.quantity || 0);
  const width = minimum > 0 ? Math.min(100, (quantityNow / minimum) * 100) : 0;

  return (
    <div className="grid split">
      <article className="card stack">
        <div className="photos">
          {card.photos.map((photo) => (
            <img key={photo.id} src={photo.url} alt="" />
          ))}
        </div>
        <h2>{card.description}</h2>
        <p className="muted">
          Минимум {card.minimum} {card.unit}. Окно дозаказа {card.topup_hours} ч.
        </p>
        {progress.status ? (
          <>
            <div className="bar-track"><span style={{ width: `${width}%` }} /></div>
            <p>
              {progress.status === "collecting" ? "Сбор" : "Дозаказ"} · {progress.buyers} чел. · набрано{" "}
              {progress.quantity} {card.unit}
              {progress.remaining && progress.status === "collecting" ? ` · ещё ${progress.remaining}` : ""}
            </p>
            {progress.topup_ends_at && <p>Дозаказать можно до {new Date(progress.topup_ends_at).toLocaleString()}</p>}
            {progress.cancel_blocked && <p>Отмена закрыта. Эту партию привезут быстрее следующего сбора.</p>}
            {progress.order_id && <Link to={`/orders/${progress.order_id}`}>Состав заказа</Link>}
          </>
        ) : (
          <p>Открытого сбора нет.</p>
        )}
        {ownLines.length > 0 && progress.status === "collecting" && (
          <div className="stack">
            {ownLines.map((line) => (
              <button key={line.id} className="ghost" onClick={() => cancel(line.id)}>
                Отменить {line.quantity} {card.unit}
              </button>
            ))}
          </div>
        )}
      </article>
      <form className="card stack" onSubmit={order}>
        <h3>Заявка</h3>
        <input placeholder="Количество" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        <select value={districtId} onChange={(event) => setDistrictId(event.target.value)} required>
          <option value="">Район</option>
          {card.districts.map((district) => (
            <option key={district.id} value={district.id}>{district.name}</option>
          ))}
        </select>
        <textarea placeholder="Адрес точки" value={address} onChange={(event) => setAddress(event.target.value)} required />
        {error && <p className="error">{error}</p>}
        {info && <p>{info}</p>}
        <button type="submit">Заказать</button>
        {notices.map((notice) => (
          <p key={notice.id} className="muted">{notice.text}</p>
        ))}
      </form>
    </div>
  );
}
