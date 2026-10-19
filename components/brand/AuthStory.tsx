import { BrandMotion } from "./BrandMotion";

export function AuthStory() {
  return (
    <aside className="auth-story" aria-label="О LEADLY">
      <div className="story-stage">
        <BrandMotion />
      </div>
      <div className="story-reveal">
        <h2>
          Твоя работа.
          <br />
          <span>Следующий уровень.</span>
        </h2>
        <p className="story-description">
          Заказы, отклики и клиенты.
          <br />
          Одно пространство для твоей работы.
        </p>
        <div className="story-disciplines" aria-label="Для разных специалистов">
          <span>Дизайн</span>
          <span>Монтаж</span>
          <span>Маркетинг</span>
          <span>Разработка</span>
        </div>
      </div>
    </aside>
  );
}
