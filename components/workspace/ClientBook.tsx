"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export type ClientRecord = {
  id: string;
  name: string;
  status: string;
  source: string | null;
  notes: string | null;
  estimated_value: number | null;
  currency_code: string;
};
const statuses: Record<string, string> = {
  lead: "Новый контакт",
  contacted: "Связались",
  replied: "Получен ответ",
  meeting: "Встреча",
  proposal: "Предложение",
  won: "Клиент",
  lost: "Не сложилось",
  archived: "Архив",
};
export function ClientBook({
  items,
  userId,
}: {
  items: ClientRecord[];
  userId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState("");
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("clients")
        .insert({
          user_id: userId,
          name: name.trim(),
          notes: notes.trim() || null,
          source: source.trim() || null,
          status: "lead",
        });
      if (error) throw error;
      setName("");
      setNotes("");
      setSource("");
      router.refresh();
      setNotice("Контакт добавлен.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Не удалось добавить контакт.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, status: string) {
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("clients")
        .update({ status })
        .eq("user_id", userId)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      router.refresh();
      setNotice("Статус клиента сохранён.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("clients")
        .delete()
        .eq("user_id", userId)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      router.refresh();
      setNotice("Контакт удалён.");
      setDeleting("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось удалить.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="two-col client-book">
      <section className="panel">
        <h2>Твои контакты</h2>
        <label className="profile-label" style={{ marginBottom: 20 }}>
          Поиск
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя, компания или заметка"
          />
        </label>
        <div className="profile-entry-list">
          {items
            .filter((c) =>
              `${c.name} ${c.notes || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((c) => (
              <article className="profile-entry" key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <small>{c.source || "Источник не указан"}</small>
                  {c.notes && (
                    <small style={{ whiteSpace: "pre-wrap" }}>{c.notes}</small>
                  )}
                  <label className="sr-only" htmlFor={`client-${c.id}`}>
                    Статус {c.name}
                  </label>
                  <select
                    id={`client-${c.id}`}
                    value={c.status}
                    disabled={busy}
                    onChange={(e) => update(c.id, e.target.value)}
                  >
                    {Object.entries(statuses).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                {deleting === c.id ? (
                  <div>
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => remove(c.id)}
                    >
                      Удалить
                    </button>
                    <button className="ghost" onClick={() => setDeleting("")}>
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Удалить ${c.name}`}
                    onClick={() => setDeleting(c.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            ))}
        </div>
        {items.length === 0 && (
          <div className="empty-state compact-empty">
            <span className="empty-icon">
              <UsersRound size={22} />
            </span>
            <h3>Хорошая работа начинается со знакомства</h3>
            <p>
              Сохрани первый контакт. Здесь будут люди, договорённости и
              следующие шаги.
            </p>
            <a href="#new-client-form" className="ghost">
              <Plus size={15} /> Добавить контакт
            </a>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Новый контакт</h2>
        <p className="muted">
          Заказчик, компания или человек, с которым хочешь работать.
        </p>
        <form className="profile-form" id="new-client-form" onSubmit={add}>
          <label className="profile-label">
            Имя или компания
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="profile-label">
            Откуда контакт
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={500}
              placeholder="Рекомендация, встреча, ссылка…"
            />
          </label>
          <label className="profile-label">
            Заметка
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Задача, контактные данные, договорённости"
            />
          </label>
          <button className="primary" disabled={busy || !name.trim()}>
            <Plus size={16} />
            Добавить контакт
          </button>
        </form>
        {notice && (
          <p className="auth-message" role="status">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
