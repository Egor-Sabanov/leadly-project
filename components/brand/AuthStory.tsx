import { ArrowUpRight, Layers3, MessageSquareText, Search } from "lucide-react";

export function AuthStory() {
  return (
    <aside className="auth-story" aria-label="Возможности LEADLY">
      <span className="story-caption">
        <span /> Пространство для твоего роста
      </span>
      <h2>
        Твоя экспертиза.
        <br />
        <span>Новые возможности.</span>
      </h2>
      <p className="story-description">
        Проекты, в которых нужны твои навыки. И всё, чтобы превратить первый
        отклик в следующую работу.
      </p>
      <div className="story-workflow">
        {[
          {
            icon: Search,
            title: "Найди своё",
            text: "Подходящие проекты и понятная оценка",
          },
          {
            icon: MessageSquareText,
            title: "Начни разговор",
            text: "Отклик с твоим опытом и характером",
          },
          {
            icon: Layers3,
            title: "Держи всё под контролем",
            text: "Контакты, договорённости и результат",
          },
        ].map(({ icon: Icon, title, text }, i) => (
          <div className="story-step" key={title}>
            <span className="story-step-icon">
              <Icon size={20} strokeWidth={1.6} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <span className="story-step-number">0{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="story-footnote">
        <ArrowUpRight size={17} /> Для тех, кто создаёт, развивает и помогает.
      </div>
    </aside>
  );
}
