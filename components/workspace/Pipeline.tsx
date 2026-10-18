"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export type PipelineItem = {
  opportunity_id: string;
  status: string;
  is_saved: boolean;
  notes: string | null;
  opportunities: {
    title: string;
    company_name: string | null;
    type: string;
  } | null;
};
const labels: Record<string, string> = {
  new: "Новая",
  saved: "Сохранена",
  applied: "Отклик отправлен",
  replied: "Получен ответ",
  negotiating: "Переговоры",
  won: "Успех",
  lost: "Не подошла",
  archived: "Архив",
};
const columns = [
  { label: "На примете", statuses: ["new", "saved"] },
  { label: "В общении", statuses: ["applied", "replied"] },
  { label: "Переговоры", statuses: ["negotiating"] },
  { label: "Результат", statuses: ["won", "lost", "archived"] },
];
export function Pipeline({ items }: { items: PipelineItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  async function change(id: string, status: string) {
    setBusy(id);
    setNotice("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc(
        "leadly_update_opportunity",
        { p_opportunity_id: id, p_status: status },
      );
      if (error) throw error;
      router.refresh();
      setNotice("Статус и история сохранены.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Не удалось сохранить статус.",
      );
    } finally {
      setBusy("");
    }
  }
  const list = items.filter((i) =>
    `${i.opportunities?.title || ""} ${i.notes || ""}`
      .toLocaleLowerCase("ru")
      .includes(search.toLocaleLowerCase("ru")),
  );
  return (
    <>
      <label
        className="profile-label"
        style={{ maxWidth: 400, marginBottom: 22 }}
      >
        Быстрый поиск
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название или твоя заметка"
        />
      </label>
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
      <div className="kanban">
        {columns.map((col) => (
          <section key={col.label} className="kanban-column">
            <div className="kanban-heading">
              {col.label}
              <span>
                {list.filter((i) => col.statuses.includes(i.status)).length}
              </span>
            </div>
            {list
              .filter((i) => col.statuses.includes(i.status))
              .map((i) => (
                <article className="kanban-card" key={i.opportunity_id}>
                  <small>
                    {i.opportunities?.company_name || "Твоя возможность"}
                  </small>
                  <h3>
                    <Link href={`/opportunities/${i.opportunity_id}`}>
                      {i.opportunities?.title || "Предложение недоступно"}
                    </Link>
                  </h3>
                  {i.notes && (
                    <p
                      className="muted"
                      style={{ fontSize: 14, whiteSpace: "pre-wrap" }}
                    >
                      {i.notes.slice(0, 150)}
                    </p>
                  )}
                  <label
                    className="sr-only"
                    htmlFor={`status-${i.opportunity_id}`}
                  >
                    Статус: {i.opportunities?.title}
                  </label>
                  <select
                    id={`status-${i.opportunity_id}`}
                    value={i.status}
                    disabled={busy === i.opportunity_id}
                    onChange={(e) => change(i.opportunity_id, e.target.value)}
                  >
                    {Object.entries(labels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            {!list.some((i) => col.statuses.includes(i.status)) && (
              <p className="kanban-empty">
                Здесь появятся предложения на этом этапе.
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
