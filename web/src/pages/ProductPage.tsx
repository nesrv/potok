import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, ProductCard, userId } from "../api";
import { DeliveryMap } from "./DeliveryMap";

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

  const statusLabel = progress.status === "topup" ? "Дозаказ" : progress.status === "collecting" ? "Сбор" : "";

  return (
    <div className="product">
      <article className="card product-sheet">
        <div className="product-photo">
          {card.photos[0] ? <img src={card.photos[0].url} alt="" /> : <div className="product-photo ph" />}
          <span>Совместная покупка</span>
        </div>
        <div className="product-copy">
          <div className="offer-top">
            <h2>{card.description}</h2>
            <b>{card.unit}</b>
          </div>
          <Link className="shop-link" to={`/storefronts/${card.storefront_id}`}>В лавку</Link>
          <p className="muted">
            Доставка от {Number(card.minimum)}
            {card.maximum ? ` до ${Number(card.maximum)}` : ""} {card.unit}. После минимума дозаказ ещё {card.topup_hours} ч.
          </p>
          {progress.status ? (
            <>
              <p className="qty">
                <strong>{quantityNow} {card.unit} из {minimum} {card.unit}</strong>
                {progress.buyers != null && <span>Участвуют: {progress.buyers}</span>}
              </p>
              <div className="bar-track"><span style={{ width: `${width}%` }} /></div>
              <p className="product-status">
                {statusLabel}
                {progress.remaining && progress.status === "collecting" ? ` · ещё ${Number(progress.remaining)} ${card.unit}` : ""}
                {progress.status === "topup" ? " · минимум набран" : ""}
              </p>
              {progress.topup_ends_at && <p className="muted">Дозаказать можно до {new Date(progress.topup_ends_at).toLocaleString("ru")}</p>}
              {progress.cancel_blocked && <p className="note">Отмена закрыта. Эту партию привезут быстрее следующего сбора.</p>}
              {progress.order_id && getToken() && <Link className="text-link" to={`/orders/${progress.order_id}`}>Состав заказа</Link>}
            </>
          ) : (
            <p className="muted">Открытого сбора нет. Первая заявка его начнёт.</p>
          )}
          {ownLines.length > 0 && progress.status === "collecting" && (
            <div className="stack">
              {ownLines.map((line) => (
                <button key={line.id} className="ghost" type="button" onClick={() => cancel(line.id)}>
                  Отменить {line.quantity} {card.unit}
                </button>
              ))}
            </div>
          )}
        </div>
      </article>
      <form className="card product-order" onSubmit={order}>
        <h3>Присоединиться</h3>
        <p className="muted">Укажите количество, район и точку. Оплата на этой странице не нужна.</p>
        <label className="field">
          <span>Количество, {card.unit}</span>
          <input
            inputMode="decimal"
            placeholder="Например, 2"
            value={quantity}
            max={card.maximum && progress.quantity != null ? Math.max(0, Number(card.maximum) - Number(progress.quantity)) : card.maximum ? Number(card.maximum) : undefined}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Район доставки</span>
          <select value={districtId} onChange={(event) => setDistrictId(event.target.value)} required>
            <option value="">Выберите район</option>
            {card.districts.map((district) => (
              <option key={district.id} value={district.id}>{district.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Точка</span>
          <textarea placeholder="Улица, дом, подъезд" value={address} onChange={(event) => setAddress(event.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        {info && <p className="ok">{info}</p>}
        <button type="submit">Присоединиться</button>
        {notices.map((notice) => (
          <p key={notice.id} className="note">{notice.text}</p>
        ))}
      </form>
      <DeliveryMap
        productId={card.id}
        ownerId={card.owner_id}
        districts={card.districts}
        route={card.route || []}
        selectedDistrictId={districtId}
        onSaved={() => void load()}
      />
    </div>
  );
}
