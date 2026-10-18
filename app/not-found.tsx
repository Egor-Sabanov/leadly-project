import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">LEADLY · МАРШРУТ НЕ НАЙДЕН</span>
      <strong>404</strong>
      <h1>Здесь пока нет возможности.</h1>
      <p className="muted">
        Ссылка могла измениться. Вернись в своё рабочее пространство.
      </p>
      <Link href="/" className="primary">
        <ArrowLeft size={15} />
        На главную
      </Link>
    </main>
  );
}
