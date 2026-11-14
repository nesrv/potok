import { FormEvent, useEffect, useState } from "react";
import { api, userId } from "../api";

type Note = { id: number; author_id: number; mine: boolean; text: string };

export function LineChat({ lineId, hint }: { lineId: number; hint?: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function load() {
    api<Note[]>(`/api/lines/${lineId}/messages`)
      .then(setNotes)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [lineId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/lines/${lineId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не отправилось");
    }
  }

  const me = userId();
  return (
    <div className="chat">
      <p className="chat-title">{hint || "Уточнение заказа"}</p>
      <div className="chat-log">
        {notes?.length === 0 && <p className="muted">Пока тихо. Можно спросить, например: курицу побольше или поменьше?</p>}
        {notes?.map((note) => (
          <p key={note.id} className={note.mine || note.author_id === me ? "bubble mine" : "bubble"}>
            {note.text}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Сообщение" maxLength={500} required />
        <button type="submit">Отправить</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
