"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Save, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
export function OpportunityActions({
  id,
  initialStatus = "new",
  initialSaved = false,
  initialNotes = "",
}: {
  id: string;
  initialStatus?: string;
  initialSaved?: boolean;
  initialNotes?: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saved, setSaved] = useState(initialSaved);
  const [notes, setNotes] = useState(initialNotes || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc(
        "leadly_update_opportunity",
        {
          p_opportunity_id: id,
          p_status: status,
          p_saved: saved,
          p_notes: notes,
        },
      );
      if (error) throw error;
      setNotice("Изменения сохранены. История статусов обновлена.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2>Следующий шаг</h2>
      <label className="profile-label">
        Статус
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button
        className={`secondary ${saved ? "selected" : ""}`}
        type="button"
        aria-pressed={saved}
        onClick={() => setSaved(!saved)}
      >
        <Bookmark size={15} />
        {saved ? "В сохранённых" : "Добавить в сохранённые"}
      </button>
      <label className="profile-label">
        Личная заметка
        <textarea
          rows={5}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Контакт, договорённости, следующий шаг…"
        />
      </label>
      <button className="primary full" disabled={busy} onClick={save}>
        {busy ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Save size={15} />
        )}
        Сохранить изменения
      </button>
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
