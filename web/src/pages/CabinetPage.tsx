import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, userId } from "../api";

type Storefront = { id: number; name: string; owner_id: number };
type Product = { id: number; description: string; unit: string };

export function CabinetPage() {
  const [mine, setMine] = useState<Storefront | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("кг");
  const [minimum, setMinimum] = useState("10");
  const [hours, setHours] = useState("2");
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
        if (found) await refresh(found.id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function createStorefront(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<Storefront>("/api/storefronts", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setMine({ ...created, owner_id: userId() || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать витрину");
    }
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
  }

  if (mine === undefined) return <p>Загрузка…</p>;
  return (
    <div className="grid">
      {error && <p className="error">{error}</p>}
      {!mine && (
        <form className="card stack" onSubmit={createStorefront}>
          <h2>Моя витрина</h2>
          <input placeholder="Название хозяйства" value={name} onChange={(event) => setName(event.target.value)} required />
          <button type="submit">Создать витрину</button>
        </form>
      )}
      {mine && (
        <>
          <section className="card">
            <h2>{mine.name}</h2>
            <div className="stack">
              {products.map((product) => (
                <Link key={product.id} to={`/products/${product.id}`}>
                  {product.description} · {product.unit}
                </Link>
              ))}
            </div>
          </section>
          <form className="card stack" onSubmit={createProduct}>
            <h3>Новый товар</h3>
            <textarea placeholder="Описание" value={description} onChange={(event) => setDescription(event.target.value)} required />
            <input placeholder="Единица" value={unit} onChange={(event) => setUnit(event.target.value)} required />
            <input placeholder="Минимум" value={minimum} onChange={(event) => setMinimum(event.target.value)} required />
            <input placeholder="Окно X, часы" value={hours} onChange={(event) => setHours(event.target.value)} required />
            <input placeholder="Районы через запятую" value={districts} onChange={(event) => setDistricts(event.target.value)} required />
            <button type="submit">Добавить товар</button>
            {productId && (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            )}
          </form>
        </>
      )}
    </div>
  );
}
