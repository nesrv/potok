import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api("/api/auth/email/send", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код");
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const body = await api<{ token: string }>("/api/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      setToken(body.token);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный код");
    } finally {
      setPending(false);
    }
  }

  async function vk() {
    setError("");
    try {
      const start = await api<{ url: string; state: string; verifier: string }>("/api/auth/vk/start");
      sessionStorage.setItem("vk_state", start.state);
      sessionStorage.setItem("vk_verifier", start.verifier);
      window.location.href = start.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "VK недоступен");
    }
  }

  return (
    <form className="card stack auth" onSubmit={sent ? verify : sendCode}>
      <h2>Вход</h2>
      <p className="muted">Код придёт на почту. Если аккаунта ещё нет, он создастся после кода.</p>
      <input
        type="email"
        placeholder="Почта"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoComplete="email"
      />
      {sent && (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Код из письма"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={pending}>
        {sent ? "Войти" : "Получить код"}
      </button>
      {sent && (
        <button type="button" className="ghost" onClick={() => setSent(false)}>
          Другая почта
        </button>
      )}
      <button type="button" className="ghost" onClick={vk}>
        Войти через VK
      </button>
    </form>
  );
}

export function VkCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    const deviceId = params.get("device_id") || "";
    const state = params.get("state") || "";
    const saved = sessionStorage.getItem("vk_state") || "";
    const verifier = sessionStorage.getItem("vk_verifier") || "";
    if (!code || !verifier || state !== saved) {
      setError("Вход через VK не завершился");
      return;
    }
    api<{ token: string }>("/api/auth/vk/finish", {
      method: "POST",
      body: JSON.stringify({ code, device_id: deviceId, verifier, state }),
    })
      .then((body) => {
        sessionStorage.removeItem("vk_state");
        sessionStorage.removeItem("vk_verifier");
        setToken(body.token);
        navigate("/");
      })
      .catch((err: Error) => setError(err.message));
  }, [navigate]);

  return <p className={error ? "error" : "muted"}>{error || "Входим через VK…"}</p>;
}
