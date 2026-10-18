"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Download } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export type Transaction = {
  id: string;
  type: string;
  amount: number;
  currency_code: string;
  occurred_on: string;
  description: string | null;
};
export function FinanceLedger({
  items,
  userId,
}: {
  items: Transaction[];
  userId: string;
}) {
  const router = useRouter();
  const [type, setType] = useState("income");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState("");
  const visible = items.filter((t) => t.currency_code === currency);
  const total = (kind: string) =>
    visible
      .filter((t) => t.type === kind)
      .reduce((n, t) => n + Number(t.amount), 0);
  const money = (n: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  async function add(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) {
      setNotice("Укажи сумму от 0,01 до 1 000 000 000.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("transactions")
        .insert({
          user_id: userId,
          type,
          amount: value,
          currency_code: currency,
          occurred_on: date,
          description: description.trim() || null,
        });
      if (error) throw error;
      setAmount("");
      setDescription("");
      setNotice("Запись добавлена.");
      router.refresh();
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
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw error;
      setDeleting("");
      router.refresh();
      setNotice("Запись удалена.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось удалить.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leadly-finances.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div
        className="stats"
        style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}
      >
        {[
          { label: "Доходы", value: total("income") },
          { label: "Расходы", value: total("expense") },
          { label: "Разница", value: total("income") - total("expense") },
        ].map((i) => (
          <div className="stat" key={i.label}>
            <span>{i.label}</span>
            <strong style={{ fontSize: 23 }}>{money(i.value)}</strong>
            <small>По загруженным записям · {currency}</small>
          </div>
        ))}
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="section-heading" style={{ marginTop: 0 }}>
            <h2>Журнал операций</h2>
            <button
              className="ghost"
              disabled={!items.length}
              onClick={download}
            >
              <Download size={14} />
              Экспорт
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата / описание</th>
                  <th>Сумма</th>
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {new Date(t.occurred_on + "T12:00:00").toLocaleDateString(
                        "ru-RU",
                      )}
                      <small
                        style={{ display: "block", color: "var(--muted)" }}
                      >
                        {t.description || "Без описания"}
                      </small>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {t.type === "income" ? "+" : "−"}
                      {money(Number(t.amount))}
                    </td>
                    <td>
                      {deleting === t.id ? (
                        <>
                          <button
                            className="ghost"
                            disabled={busy}
                            onClick={() => remove(t.id)}
                          >
                            Удалить
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setDeleting("")}
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label="Удалить операцию"
                          disabled={busy}
                          onClick={() => setDeleting(t.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="muted" style={{ marginTop: 20 }}>
              Записей в этой валюте пока нет. Добавь первый доход или расход.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Новая запись</h2>
          <form className="finance-form" onSubmit={add}>
            <label className="profile-label">
              Тип
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
              </select>
            </label>
            <label className="profile-label">
              Валюта
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>RUB</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <label className="profile-label">
              Сумма
              <input
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="profile-label">
              Дата
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="profile-label wide">
              Описание
              <input
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="За какой проект или услугу"
              />
            </label>
            <button className="primary wide" disabled={busy}>
              <Plus size={16} />
              Добавить запись
            </button>
          </form>
          {notice && (
            <p className="auth-message" role="status">
              {notice}
            </p>
          )}
          <p className="profile-muted" style={{ marginTop: 16 }}>
            Личный учёт по введённым тобой данным. Валюты считаются отдельно;
            подключений к банку нет.
          </p>
        </section>
      </div>
    </>
  );
}
