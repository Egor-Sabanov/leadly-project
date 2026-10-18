import Link from "next/link";
import { ArrowUpRight, Database, ShieldCheck } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function SetupScreen() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="content">
        <div className="eyebrow">ТВОЁ РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <div className="welcome-hero">
          <span className="badge">LEADLY · ПЕРВЫЙ ЗАПУСК</span>
          <h1>
            Возможности.
            <br />С ясным планом.
          </h1>
          <p>
            От первого подходящего предложения до результата. Настрой профиль,
            собери свою ленту и веди каждый следующий шаг в одном месте.
          </p>
          <Link href="/demo" className="primary">
            Посмотреть, как это работает <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="two-col">
          <section className="panel">
            <Database size={24} />
            <h2>Подключи своё пространство</h2>
            <p className="muted">
              Для регистрации и сохранения данных нужен Supabase. Укажи адрес
              проекта и публичный ключ в настройках среды, примени миграции из
              инструкции запуска и перезапусти приложение.
            </p>
            <Link className="ghost" href="/auth">
              Перейти ко входу <ArrowUpRight size={16} />
            </Link>
          </section>
          <section className="panel">
            <ShieldCheck size={24} />
            <h2>Твои данные — твой контроль</h2>
            <p className="muted">
              Профиль, сохранённые предложения и заметки привязаны к аккаунту.
              Без подключения базы LEADLY не создаёт вымышленные результаты и не
              сохраняет личные данные.
            </p>
            <Link href="/settings" className="ghost">
              Проверить подключение <ArrowUpRight size={16} />
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
