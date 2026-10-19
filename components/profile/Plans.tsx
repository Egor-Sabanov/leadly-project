"use client";
import { useState } from "react";
import { Check, ArrowUpRight, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
const plans = [
  {
    id: "free",
    name: "FREE",
    price: "0",
    caption: "Начни со своего фокуса",
    features: [
      "Профиль и персональная оценка",
      "Поиск и сохранение возможностей",
      "Отклики и мои проекты",
    ],
  },
  {
    id: "pro",
    name: "PRO",
    price: "990",
    caption: "Для регулярной работы",
    features: [
      "Возможности бесплатного плана",
      "Планируется: умные уведомления",
      "Планируется: расширенные фильтры",
    ],
  },
  {
    id: "pro_plus",
    name: "PRO+",
    price: "2 490",
    caption: "Больше контекста и контроля",
    features: [
      "Возможности плана PRO",
      "Планируется: расширенный AI",
      "Планируется: аудит сайтов",
    ],
  },
  {
    id: "agency",
    name: "AGENCY",
    price: "4 990",
    caption: "Для небольшой команды",
    features: [
      "Возможности плана PRO+",
      "Планируется: до 5 участников",
      "Планируется: общие проекты",
    ],
  },
];
export function Plans({
  userId,
  requestedPlan = "",
}: {
  userId: string;
  requestedPlan?: string;
}) {
  const [selected, setSelected] = useState(requestedPlan);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  async function select(id: string) {
    setBusy(id);
    setNotice("");
    try {
      if (!userId) throw new Error("Сначала войди в аккаунт.");
      const { error } = await getSupabaseBrowserClient()
        .from("profiles")
        .update({ requested_plan: id })
        .eq("id", userId)
        .select("id")
        .single();
      if (error) throw error;
      setSelected(id);
      setNotice(
        "Предпочтение сохранено. Деньги не списаны, подписка не оформлена. Платные функции ещё готовятся к запуску.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось сохранить выбор.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel profile-section" id="plans">
      <div>
        <div className="eyebrow">ТВОЙ УРОВЕНЬ ВОЗМОЖНОСТЕЙ</div>
        <h2>Расти в своём темпе.</h2>
        <p className="muted">
          Бесплатный план уже доступен. Платные подписки готовятся к запуску.
          Можно сохранить интересующий тариф — без оплаты и списаний.
        </p>
      </div>
      <div className="plans-grid">
        {plans.map((p) => (
          <article
            className={`plan-card ${p.id === "pro" ? "featured" : ""} ${selected === p.id ? "plan-selected" : ""}`}
            key={p.id}
          >
            <span className="badge">
              {p.id === "free" ? "ДОСТУПЕН СЕЙЧАС" : "ПРЕДВАРИТЕЛЬНЫЙ ДОСТУП"}
            </span>
            <h3>{p.name}</h3>
            <p style={{ fontSize: 14, opacity: 0.7 }}>{p.caption}</p>
            <div className="plan-price">
              {p.price} ₽<small> / мес.</small>
            </div>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={13} />
                  {f}
                </li>
              ))}
            </ul>
            {p.id === "free" ? (
              <button className="ghost" disabled>
                Текущий план
              </button>
            ) : (
              <button
                className="ghost"
                type="button"
                disabled={!!busy || !userId}
                onClick={() => select(p.id)}
              >
                {busy === p.id ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <ArrowUpRight size={14} />
                )}
                {selected === p.id ? "Выбор сохранён" : "Мне подходит"}
              </button>
            )}
          </article>
        ))}
      </div>
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
      <p className="profile-muted">
        Цены в рублях за месяц. AGENCY — стартовая цена для команды до 5 человек
        после запуска командных функций. Выбор не является покупкой.
      </p>
    </section>
  );
}
