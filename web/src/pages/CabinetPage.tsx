import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, userId } from "../api";
import { FarmMap } from "./FarmMap";

const serviceOptions = ["экскурсия по ферме", "контактный зоопарк", "рыбалка", "охота", "тир"];

const titles = ["лавка", "витрина", "магазин", "прилавок", "бутик"];

function label(title: string) {
  const word = titles.includes(title) ? title : "лавка";
  const mine = word === "магазин" || word === "прилавок" || word === "бутик" ? "Мой" : "Моя";
  return { word, mine, cap: word[0].toUpperCase() + word.slice(1) };
}

type Storefront = {
  id: number;
  name: string;
  title?: string;
  owner_id: number;
  address?: string;
  pickup?: boolean;
  services?: string[];
  latitude?: number | null;
  longitude?: number | null;
  area?: number[][];
};
type Product = {
  id: number;
  description: string;
  unit: string;
  minimum: string;
  topup_hours: number;
  districts: string[];
  photo: string;
  status: string | null;
  quantity: string | null;
  buyers: number | null;
  remaining: string | null;
};

const statusName: Record<string, string> = {
  collecting: "Сбор",
  topup: "Дозаказ",
  closed: "Закрыт",
};

export function CabinetPage() {
  const [mine, setMine] = useState<Storefront | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("лавка");
  const [address, setAddress] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintFor, setHintFor] = useState("");
  const [pickup, setPickup] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("кг");
  const [minimum, setMinimum] = useState("10");
  const [hours, setHours] = useState("2");
  const [price, setPrice] = useState("");
  const [districts, setDistricts] = useState("Анапа");
  const [productId, setProductId] = useState<number | null>(null);

  async function refresh(storefrontId: number) {
    const detail = await api<{ products: Product[] }>(`/api/storefronts/${storefrontId}`);
    setProducts(detail.products);
  }

  useEffect(() => {
    api<Storefront[]>("/api/storefronts")
      .then(async (rows) => {
        const found = rows.find((row) => row.owner_id === userId()) || null;
        setMine(found);
        if (found) {
          setAddress(found.address || "");
          setPickup(Boolean(found.pickup));
          const known = (found.services || []).filter((item) => serviceOptions.includes(item));
          const rest = (found.services || []).filter((item) => !serviceOptions.includes(item));
          setPicked(known);
          setCustom(rest);
          setExtra("");
        }
        if (found) await refresh(found.id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const text = address.trim();
    if (text.length < 2 || text === hintFor) {
      setHints([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api<string[]>(`/api/geo/suggest?q=${encodeURIComponent(text)}`)
        .then((rows) => setHints(rows))
        .catch(() => setHints([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [address, hintFor]);

  async function createStorefront(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<Storefront>("/api/storefronts", {
        method: "POST",
        body: JSON.stringify({
          name,
          title,
          address,
          pickup,
          services: [...picked, ...custom, ...extra.split(",").map((item) => item.trim()).filter(Boolean)],
        }),
      });
      setMine({ ...created, owner_id: userId() || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    }
  }

  function typedServices() {
    return extra.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function services() {
    return [...picked, ...custom, ...typedServices()];
  }

  function addCustom() {
    const next = typedServices().filter((item) => !picked.includes(item) && !custom.includes(item));
    if (!next.length) return;
    setCustom((current) => [...current, ...next]);
    setExtra("");
  }

  async function savePlace(event?: FormEvent, list = services()) {
    event?.preventDefault();
    if (!mine) return;
    setError("");
    try {
      const saved = await api<Storefront>(`/api/storefronts/${mine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ address, pickup, services: list }),
      });
      setPicked(list.filter((item) => serviceOptions.includes(item)));
      setCustom(list.filter((item) => !serviceOptions.includes(item)));
      setExtra("");
      setMine({ ...mine, ...saved });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить адрес");
    }
  }

  function placeFields() {
    return (
      <>
        <label className="field">
          <span>Адрес хозяйства</span>
          <input
            placeholder="Населённый пункт, улица, дом"
            value={address}
            autoComplete="off"
            onChange={(event) => {
              setHintFor("");
              setAddress(event.target.value);
            }}
          />
          {hints.length > 0 && (
            <div className="hints">
              {hints.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setAddress(item);
                    setHintFor(item);
                    setHints([]);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </label>
        <button type="button" className={pickup ? "chip on" : "chip"} onClick={() => setPickup((value) => !value)}>
          Самовывоз
        </button>
        <div className="services">
          <span>Услуги на месте</span>
          <div className="chips">
            {serviceOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={picked.includes(item) ? "chip on" : "chip"}
                onClick={() => setPicked((current) => (current.includes(item) ? current : [...current, item]))}
                onDoubleClick={() => {
                  const list = services().filter((value) => value !== item);
                  setPicked((current) => current.filter((value) => value !== item));
                  void savePlace(undefined, list);
                }}
              >
                {item}
              </button>
            ))}
            {custom.map((item) => (
              <button
                key={item}
                type="button"
                className="chip on"
                onDoubleClick={() => {
                  const list = services().filter((value) => value !== item);
                  setCustom((current) => current.filter((value) => value !== item));
                  void savePlace(undefined, list);
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Своя услуга</span>
            <span className="add-row">
              <input
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="Дегустация"
              />
              <button type="button" className="ghost" onClick={addCustom}>Добавить</button>
            </span>
          </label>
        </div>
      </>
    );
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!mine) return;
    setError("");
    try {
      const created = await api<{ id: number }>("/api/products", {
        method: "POST",
        body: JSON.stringify({
          storefront_id: mine.id,
          description,
          unit,
          minimum,
          topup_hours: Number(hours),
          price: price.trim() ? price : null,
        }),
      });
      await api(`/api/products/${created.id}/districts`, {
        method: "PUT",
        body: JSON.stringify({ names: districts.split(",").map((item) => item.trim()).filter(Boolean) }),
      });
      setProductId(created.id);
      await refresh(mine.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать товар");
    }
  }

  async function upload(file: File) {
    if (!productId) return;
    const body = new FormData();
    body.append("file", file);
    await api(`/api/products/${productId}/photos`, { method: "POST", body });
    if (mine) await refresh(mine.id);
  }

  if (mine === undefined) return <p className="muted">Загрузка…</p>;
  return (
    <div className="page">
      <div className="section-head">
        <h2>{label(mine?.title || title).mine} {label(mine?.title || title).word}</h2>
      </div>
      {mine && (
        <form className="card place-form" onSubmit={savePlace}>
          <h3>Хозяйство</h3>
          <p className="muted">Адрес необязателен. Услуги увидят те, кто приедет сам.</p>
          {placeFields()}
          <button type="submit">Сохранить</button>
        </form>
      )}
      {mine && (
        <FarmMap
          storefrontId={mine.id}
          name={mine.name}
          latitude={mine.latitude ?? null}
          longitude={mine.longitude ?? null}
          area={mine.area || []}
          onMoved={(latitude, longitude, area) => setMine({ ...mine, latitude, longitude, area })}
        />
      )}
      {error && <p className="error">{error}</p>}
      {!mine && (
        <form className="card product-order" onSubmit={createStorefront}>
          <h3>Название хозяйства</h3>
          <p className="muted">Одно хозяйство на аккаунт. Покупатели увидят его на главной.</p>
          <label className="field">
            <span>Как называть</span>
            <select value={title} onChange={(event) => setTitle(event.target.value)}>
              {titles.map((item) => (
                <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Название</span>
            <input placeholder="Зелёный луг" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          {placeFields()}
          <button type="submit">Создать {label(title).word}</button>
        </form>
      )}
      {mine && (
        <div className="product">
          <section className="card product-sheet">
            <div className="product-copy">
              <h2>{mine.name}</h2>
              {products.length === 0 && <p className="muted">Товаров ещё нет. Добавьте первый сбор справа.</p>}
              <div className="cabinet-goods">
                {products.map((product) => (
                  <Link key={product.id} className="catalog-card" to={`/products/${product.id}`}>
                    {product.photo ? <img src={product.photo} alt="" /> : <div className="ph" />}
                    <div>
                      <strong>{product.description}</strong>
                      <span>
                        Минимум {Number(product.minimum)} {product.unit} · дозаказ {product.topup_hours} ч
                      </span>
                      <span>{product.districts.length ? product.districts.join(", ") : "Районы не указаны"}</span>
                      <em>
                        {product.status
                          ? `${statusName[product.status] || product.status} · ${Number(product.quantity || 0)} ${product.unit}${product.buyers != null ? ` · ${product.buyers} чел.` : ""}`
                          : "Сбор ещё не открыт"}
                        {product.remaining ? ` · ещё ${Number(product.remaining)} ${product.unit}` : ""}
                      </em>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
          <form className="card product-order" onSubmit={createProduct}>
            <h3>Новый товар</h3>
            <label className="field">
              <span>Описание</span>
              <textarea placeholder="Помидоры грунтовые" value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label className="field">
              <span>Единица</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} required />
            </label>
            <label className="field">
              <span>Цена за единицу, ₽</span>
              <input inputMode="decimal" placeholder="Необязательно" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
            <label className="field">
              <span>Минимум для сбора</span>
              <input value={minimum} onChange={(event) => setMinimum(event.target.value)} required />
            </label>
            <label className="field">
              <span>Окно дозаказа, часы</span>
              <input value={hours} onChange={(event) => setHours(event.target.value)} required />
            </label>
            <label className="field">
              <span>Районы через запятую</span>
              <input value={districts} onChange={(event) => setDistricts(event.target.value)} required />
            </label>
            <button type="submit">Добавить товар</button>
            {productId && (
              <label className="field">
                <span>Фото товара</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </label>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
