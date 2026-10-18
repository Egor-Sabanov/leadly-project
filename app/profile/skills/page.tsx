"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CatalogItem = { id: string; name: string; category: string | null };
type UserSkill = {
  skill_id: string;
  level: number | null;
  years_experience: number | null;
  is_primary: boolean;
  skill: CatalogItem;
};
type UserService = {
  service_id: string;
  price_from: number | null;
  price_to: number | null;
  currency_code: string;
  service: CatalogItem;
};

export default function ProfileSkillsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [skillsCatalog, setSkillsCatalog] = useState<CatalogItem[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<CatalogItem[]>([]);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [services, setServices] = useState<UserService[]>([]);
  const [skillId, setSkillId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [level, setLevel] = useState("3");
  const [years, setYears] = useState("1");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) {
      router.replace("/auth");
      return;
    }
    setUserId(user.id);
    const [sc, svc, us, uvc] = await Promise.all([
      supabase.from("skills").select("id,name,category").order("name"),
      supabase.from("services").select("id,name,category").order("name"),
      supabase
        .from("profile_skills")
        .select(
          "skill_id,level,years_experience,is_primary,skills(id,name,category)",
        )
        .eq("user_id", user.id),
      supabase
        .from("profile_services")
        .select(
          "service_id,price_from,price_to,currency_code,services(id,name,category)",
        )
        .eq("user_id", user.id),
    ]);
    for (const result of [sc, svc, us, uvc])
      if (result.error) throw result.error;
    setSkillsCatalog((sc.data || []) as CatalogItem[]);
    setServicesCatalog((svc.data || []) as CatalogItem[]);
    setSkills(
      (
        (us.data || []) as unknown as Array<
          Omit<UserSkill, "skill"> & { skills: CatalogItem }
        >
      ).map((row) => ({ ...row, skill: row.skills })),
    );
    setServices(
      (
        (uvc.data || []) as unknown as Array<
          Omit<UserService, "service"> & { services: CatalogItem }
        >
      ).map((row) => ({ ...row, service: row.services })),
    );
    setSkillId((current) => current || sc.data?.[0]?.id || "");
    setServiceId((current) => current || svc.data?.[0]?.id || "");
  }, [router]);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      await Promise.resolve();
      try {
        await load();
      } catch (caught) {
        if (alive)
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить навыки и услуги.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    };
    void initialize();
    return () => {
      alive = false;
    };
  }, [load]);

  async function addSkill() {
    if (!userId || !skillId) return;
    const experience = years === "" ? null : Number(years);
    if (
      experience !== null &&
      (!Number.isFinite(experience) || experience < 0 || experience > 80)
    ) {
      setError("Укажи опыт от 0 до 80 лет.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: saveError } = await supabase.from("profile_skills").upsert(
        {
          user_id: userId,
          skill_id: skillId,
          level: Number(level),
          years_experience: experience,
          is_primary: skills.length === 0,
        },
        { onConflict: "user_id,skill_id" },
      );
      if (saveError) throw saveError;
      await load();
      setNotice("Навык добавлен.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось добавить навык.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addService() {
    if (!userId || !serviceId) return;
    const from = priceFrom === "" ? null : Number(priceFrom);
    const to = priceTo === "" ? null : Number(priceTo);
    if (
      (from !== null && (!Number.isFinite(from) || from < 0)) ||
      (to !== null && (!Number.isFinite(to) || to < 0)) ||
      (from !== null && to !== null && to < from)
    ) {
      setError(
        "Проверь диапазон цены: значения неотрицательные, верхняя граница не меньше нижней.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: saveError } = await supabase
        .from("profile_services")
        .upsert(
          {
            user_id: userId,
            service_id: serviceId,
            price_from: from,
            price_to: to,
            currency_code: "RUB",
          },
          { onConflict: "user_id,service_id" },
        );
      if (saveError) throw saveError;
      await load();
      setNotice("Услуга добавлена.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось добавить услугу.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(
    kind: "profile_skills" | "profile_services",
    id: string,
  ) {
    if (!userId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = getSupabaseBrowserClient();
      const key = kind === "profile_skills" ? "skill_id" : "service_id";
      const { error: removeError } = await supabase
        .from(kind)
        .delete()
        .eq("user_id", userId)
        .eq(key, id);
      if (removeError) throw removeError;
      await load();
      setNotice(
        kind === "profile_skills" ? "Навык удалён." : "Услуга удалена.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось удалить запись.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <Sidebar activeHref="/profile" />
      <section className="content profile-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">ТВОИ СИЛЬНЫЕ СТОРОНЫ</div>
            <h1>Навыки и услуги</h1>
            <p>Укажи, что умеешь делать и что готов продавать клиентам.</p>
          </div>
          <Link href="/profile" className="ghost">
            <ArrowLeft size={15} /> К профилю
          </Link>
        </header>
        {loading ? (
          <div className="panel profile-loading">
            <LoaderCircle size={22} className="spin" /> Загружаем навыки и
            услуги…
          </div>
        ) : (
          <div className="profile-form">
            <section className="panel profile-section">
              <div className="profile-section-heading">
                <span className="onboarding-icon">
                  <Wrench size={20} />
                </span>
                <div>
                  <h2>Мои навыки</h2>
                  <p>
                    Уровень и опыт помогут точнее ранжировать подходящие
                    возможности.
                  </p>
                </div>
              </div>
              {skillsCatalog.length ? (
                <div className="profile-add-row">
                  <label className="profile-label">
                    Навык
                    <select
                      value={skillId}
                      onChange={(e) => setSkillId(e.target.value)}
                    >
                      {skillsCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.category ? ` · ${item.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="profile-label">
                    Уровень
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                    >
                      <option value="1">1 — начинающий</option>
                      <option value="2">2 — базовый</option>
                      <option value="3">3 — уверенный</option>
                      <option value="4">4 — продвинутый</option>
                      <option value="5">5 — эксперт</option>
                    </select>
                  </label>
                  <label className="profile-label">
                    Лет опыта
                    <input
                      type="number"
                      min="0"
                      max="80"
                      step="0.5"
                      value={years}
                      onChange={(e) => setYears(e.target.value)}
                    />
                  </label>
                  <button
                    className="auth-submit profile-save"
                    type="button"
                    disabled={busy || !skillId}
                    onClick={addSkill}
                  >
                    <Plus size={16} /> Добавить
                  </button>
                </div>
              ) : (
                <p className="auth-message">
                  Каталог навыков пока пуст. Примени SQL-миграцию
                  `0002_seed_skill_service_catalog.sql` из архива.
                </p>
              )}
              <div className="profile-entry-list">
                {skills.map((item) => (
                  <div className="profile-entry" key={item.skill_id}>
                    <div>
                      <strong>{item.skill?.name || "Навык"}</strong>
                      <small>
                        Уровень {item.level ?? "—"} из 5 · Опыт:{" "}
                        {item.years_experience ?? "—"} лет
                        {item.is_primary ? " · Основной" : ""}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Удалить навык ${item.skill?.name}`}
                      disabled={busy}
                      onClick={() => remove("profile_skills", item.skill_id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!skills.length && (
                  <p className="profile-muted">Ты пока не добавил навыки.</p>
                )}
              </div>
            </section>
            <section className="panel profile-section">
              <div className="profile-section-heading">
                <span className="onboarding-icon">
                  <BriefcaseBusiness size={20} />
                </span>
                <div>
                  <h2>Мои услуги</h2>
                  <p>
                    Добавь услуги и примерный диапазон цены для потенциальных
                    клиентов.
                  </p>
                </div>
              </div>
              {servicesCatalog.length ? (
                <div className="profile-add-row">
                  <label className="profile-label">
                    Услуга
                    <select
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                    >
                      {servicesCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.category ? ` · ${item.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="profile-label">
                    Цена от, ₽
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={priceFrom}
                      onChange={(e) => setPriceFrom(e.target.value)}
                      placeholder="Например, 15000"
                    />
                  </label>
                  <label className="profile-label">
                    Цена до, ₽
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={priceTo}
                      onChange={(e) => setPriceTo(e.target.value)}
                      placeholder="Например, 50000"
                    />
                  </label>
                  <button
                    className="auth-submit profile-save"
                    type="button"
                    disabled={busy || !serviceId}
                    onClick={addService}
                  >
                    <Plus size={16} /> Добавить
                  </button>
                </div>
              ) : (
                <p className="auth-message">
                  Каталог услуг пока пуст. Примени SQL-миграцию
                  `0002_seed_skill_service_catalog.sql` из архива.
                </p>
              )}
              <div className="profile-entry-list">
                {services.map((item) => (
                  <div className="profile-entry" key={item.service_id}>
                    <div>
                      <strong>{item.service?.name || "Услуга"}</strong>
                      <small>
                        {item.price_from == null && item.price_to == null
                          ? "Цена не указана"
                          : `${item.price_from == null ? "от —" : `от ${Number(item.price_from).toLocaleString("ru-RU")} ₽`} · ${item.price_to == null ? "до —" : `до ${Number(item.price_to).toLocaleString("ru-RU")} ₽`}`}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Удалить услугу ${item.service?.name}`}
                      disabled={busy}
                      onClick={() =>
                        remove("profile_services", item.service_id)
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!services.length && (
                  <p className="profile-muted">Ты пока не добавил услуги.</p>
                )}
              </div>
            </section>
            {error && (
              <p className="auth-message error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="auth-message success" role="status">
                {notice}
              </p>
            )}
            <div className="profile-save-row">
              <span>Данные принадлежат твоему аккаунту и защищены RLS.</span>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  load().catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Не удалось обновить данные.",
                    ),
                  )
                }
              >
                <Save size={16} /> Обновить данные
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
