import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, ProductCard, userId } from "../api";
import { DeliveryMap } from "./DeliveryMap";
import { LineChat } from "./LineChat";

type Notice = { id: number; text: string; created_at: string };
type OrderLine = { id: number; buyer_id: number; quantity: string; address: string };

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState<ProductCard | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [quantity, setQuantity] = useState("");
  const [address, setAddress] = useState("");
  const [spot, setSpot] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickedAddress = useRef("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [ownLines, setOwnLines] = useState<OrderLine[]>([]);
  const [chatLines, setChatLines] = useState<OrderLine[]>([]);
  const [stopped, setStopped] = useState(false);

  function load() {
    setError("");
    return api<ProductCard>(`/api/products/${id}`)
      .then(async (next) => {
        setCard(next);
        if (next.progress.order_id && getToken()) {
          try {
            const order = await api<{ lines: OrderLine[] }>(`/api/orders/${next.progress.order_id}`);
            const me = userId();
            const mine = order.lines.filter((line) => line.buyer_id === me);
            setOwnLines(mine);
            setChatLines(next.owner_id === me ? order.lines : mine);
          } catch {
            setOwnLines([]);
          }
        } else {
          setOwnLines([]);
          setChatLines([]);
        }
        if (getToken()) {
          const mine = await api<{ product_id: number; status: string }[]>("/api/me/lines").catch(() => []);
          setStopped(mine.some((line) => line.product_id === next.id && line.status !== "collecting"));
        } else {
          setStopped(false);
        }
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!getToken()) return;
    api<{ address: string; lat: number | null; lon: number | null }>("/api/me/delivery")
      .then((saved) => {
        if (!saved.address) return;
        setAddress((current) => {
          if (current) return current;
          if (saved.lat != null && saved.lon != null) {
            pickedAddress.current = saved.address;
            setSpot({ lat: saved.lat, lon: saved.lon });
          }
          return saved.address;
        });
      })
      .catch(() => undefined);
  }, [id]);

  function covers(ring: number[][], point: { lat: number; lon: number }) {
    if (ring.length < 3) return false;
    let inside = false;
    let previous = ring[ring.length - 1];
    for (const current of ring) {
      const yi = current[0];
      const xi = current[1];
      const yj = previous[0];
      const xj = previous[1];
      if ((yi > point.lat) !== (yj > point.lat) && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
      previous = current;
    }
    return inside;
  }

  const districts = card?.districts || [];
  const zones = districts.filter((item) => (item.polygon?.length || 0) >= 3);
  const matched = spot
    ? zones.find((item) => covers(item.polygon || [], spot)) || null
    : zones.length === 0 && districts.length === 1
      ? districts[0]
      : null;
  const outside = Boolean(zones.length && address.trim() && !locating && !matched);

  useEffect(() => {
    if (!address.trim() || address === pickedAddress.current) {
      setLocating(false);
      return;
    }
    setSpot(null);
    const timer = window.setTimeout(() => {
      setLocating(true);
      api<{ lat: number; lon: number }>(`/api/geo/place?q=${encodeURIComponent(address.trim())}`)
        .then((found) => setSpot({ lat: found.lat, lon: found.lon }))
        .catch(() => setSpot(null))
        .finally(() => setLocating(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [address]);

  useEffect(() => {
    if (!matched) {
      setNotices([]);
      return;
    }
    api<Notice[]>(`/api/districts/${matched.id}/notices`)
      .then(setNotices)
      .catch(() => setNotices([]));
  }, [matched?.id]);

  async function order(event: FormEvent) {
    event.preventDefault();
    if (!getToken()) {
      navigate("/login");
      return;
    }
    setInfo("");
    setError("");
    if (zones.length && !matched) {
      setError("Выберите адрес из зоны доставки.");
      return;
    }
    try {
      await api(`/api/products/${id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          quantity,
          address,
          lat: spot?.lat,
          lon: spot?.lon,
        }),
      });
      setInfo("Заявка принята");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку");
    }
  }

  async function closeEarly() {
    if (!card) return;
    setError("");
    try {
      await api(`/api/products/${card.id}/close`, { method: "POST" });
      setInfo("Сбор закрыт. Уже набранное уйдёт ближайшей доставкой.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось закрыть сбор");
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
  const title = card.description.split(".")[0];
  const rest = card.description.slice(title.length).replace(/^\.\s*/, "");
  const price = card.price ? `${Number(card.price)} ₽ / ${card.unit}` : "";

  return (
    <div className="product">
      <article className="card product-sheet">
        <div className="product-photo">
          {card.photos[0] ? <img src={card.photos[0].url} alt="" /> : <div className="product-photo ph" />}
          <span>Совместная покупка</span>
        </div>
        <div className="product-copy">
          <div className="offer-top">
            <h2>{title}</h2>
            <b>{price || card.unit}</b>
          </div>
          {rest ? <p className="product-lead">{rest}</p> : null}
          <Link className="shop-link" to={`/storefronts/${card.storefront_id}`}>В лавку</Link>
          <p className="muted">
            Сбор от {Number(card.minimum)}
            {card.maximum ? ` до ${Number(card.maximum)}` : ""} {card.unit}. За время дозаказа ({card.topup_hours} ч) больше максимума добавить нельзя.
          </p>
          {(stopped || progress.cancel_blocked) && (
            <p className="stop-note">Стоп закупок. Отказаться от заказа нельзя.</p>
          )}
          {getToken() && userId() === card.owner_id && (progress.status === "collecting" || progress.status === "topup") && quantityNow > 0 && (
            <button type="button" className="ghost" onClick={() => void closeEarly()}>
              Отправить набранное сейчас
            </button>
          )}
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
              {progress.cancel_blocked && <p className="muted">Эту партию привезут быстрее следующего сбора.</p>}
              {progress.order_id && getToken() && <Link className="text-link" to={`/orders/${progress.order_id}`}>Состав заказа</Link>}
            </>
          ) : (
            <p className="muted">Открытого сбора нет. Первая заявка его начнёт.</p>
          )}
          {chatLines.map((line) => (
            <LineChat
              key={line.id}
              lineId={line.id}
              hint={line.buyer_id === userId() ? "Переписка с продавцом" : `Покупатель ${line.buyer_id}: ${line.quantity} ${card.unit}`}
            />
          ))}
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
        <p className="muted">Укажите количество и точку внутри зоны на карте. Оплата на этой странице не нужна. Сервис бесплатный до 2027 года.</p>
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
          <span>Точка</span>
          <textarea
            placeholder="Улица, дом, подъезд"
            value={address}
            onChange={(event) => {
              pickedAddress.current = "";
              setSpot(null);
              setAddress(event.target.value);
            }}
            required
          />
        </label>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setPicking(true);
            document.querySelector(".map-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          {address ? "Изменить точку на карте" : "Выбрать на карте"}
        </button>
        {outside && <p className="error">Выберите адрес из зоны доставки.</p>}
        {error && <p className="error">{error}</p>}
        {info && <p className="ok">{info}</p>}
        <button type="submit" disabled={outside || locating}>Присоединиться</button>
        {notices.map((notice) => (
          <p key={notice.id} className="note">{notice.text}</p>
        ))}
      </form>
      <DeliveryMap
        productId={card.id}
        ownerId={card.owner_id}
        districts={card.districts}
        route={card.route || []}
        selectedDistrictId={matched ? String(matched.id) : ""}
        picking={picking}
        onPoint={(label, point) => {
          pickedAddress.current = label;
          setSpot({ lat: point[0], lon: point[1] });
          setAddress(label);
          setPicking(false);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
}
