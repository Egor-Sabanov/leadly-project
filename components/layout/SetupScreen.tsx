import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function SetupScreen() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="content">
        <div className="panel opportunity-empty" role="alert">
          <RefreshCw size={24} aria-hidden="true" />
          <h1>Не удалось открыть рабочее пространство</h1>
          <p>Сервис временно недоступен. Обнови страницу или попробуй чуть позже.</p>
          <Link href="/auth" className="ghost">Вернуться ко входу <ArrowUpRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
