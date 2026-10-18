/** Shared professions for onboarding, discovery and bounded official-API searches. */
export const disciplines = [
  {
    id: "design",
    label: "Дизайн",
    headline: "Графический и UI/UX-дизайнер",
    skills: ["Figma", "UI/UX-дизайн", "Графический дизайн"],
    services: ["Дизайн интерфейсов и фирменного стиля"],
    query: "дизайнер OR иллюстратор",
    pattern: /дизайн|иллюстрац|figma|photoshop|брендинг|логотип|полиграф/iu,
  },
  {
    id: "development",
    label: "Разработка",
    headline: "Разработка веб-приложений",
    skills: ["React", "TypeScript", "Next.js"],
    services: ["Создание лендинга"],
    query: "разработчик OR программист",
    pattern:
      /разработ|программист|в[её]рстк|react|typescript|next\.js|python|backend|frontend/iu,
  },
  {
    id: "writing",
    label: "Тексты и редактура",
    headline: "Копирайтер и редактор",
    skills: ["Копирайтинг", "Редактура"],
    services: ["Написание текстов для сайта"],
    query: "копирайтер OR редактор",
    pattern:
      /копирайт|редактор|редактур|корректор|написа\p{L}* текст|тексты для|сценарист/iu,
  },
  {
    id: "marketing",
    label: "Маркетинг",
    headline: "Маркетолог",
    skills: ["SEO", "Яндекс Директ", "Аналитика"],
    services: ["SEO-аудит сайта", "Настройка рекламы"],
    query: "маркетолог OR директолог OR SEO",
    pattern:
      /маркет|seo|директолог|таргетолог|контекстн\p{L}* реклам|яндекс директ/iu,
  },
  {
    id: "video",
    label: "Видео и монтаж",
    headline: "Видеомонтажёр",
    skills: ["Видеомонтаж", "DaVinci Resolve", "Adobe Premiere Pro"],
    services: ["Монтаж Reels и Shorts", "Монтаж видеороликов"],
    query: "видеомонтаж OR видеомонтажер OR моушн",
    pattern: /монтаж|видео|reels|shorts|premiere|davinci|моушн|after effects/iu,
  },
  {
    id: "social",
    label: "SMM и соцсети",
    headline: "SMM-специалист",
    skills: ["SMM", "Контент-план", "Ведение Telegram"],
    services: ["Ведение социальных сетей"],
    query: "SMM OR контент-менеджер",
    pattern:
      /\bsmm\b|соцсет|социальн\p{L}* сет|контент.план|ведение (?:канал|telegram|вконтакте)|контент.менеджер/iu,
  },
  {
    id: "audio",
    label: "Звук и озвучка",
    headline: "Звукорежиссёр и диктор",
    skills: ["Обработка звука", "Озвучка", "Сведение"],
    services: ["Озвучка и обработка аудио"],
    query: "звукорежиссер OR диктор OR озвучка",
    pattern: /звук|озвуч|диктор|аудио|подкаст|саунд|сведение/iu,
  },
  {
    id: "translation",
    label: "Переводы",
    headline: "Переводчик",
    skills: ["Письменный перевод", "Локализация"],
    services: ["Перевод и локализация текстов"],
    query: "переводчик OR локализатор",
    pattern:
      /переводчик|перевод\p{L}* (?:текст|документ|стат)|локализац|локализатор/iu,
  },
  {
    id: "marketplaces",
    label: "Маркетплейсы",
    headline: "Специалист по маркетплейсам",
    skills: ["Карточки товаров", "Ozon", "Wildberries"],
    services: ["Оформление карточек товаров"],
    query: "маркетплейс OR Wildberries OR Ozon",
    pattern:
      /маркетплейс|wildberries|\bozon\b|карточк\p{L}* товар|инфографик/iu,
  },
  {
    id: "analytics",
    label: "Аналитика",
    headline: "Аналитик данных",
    skills: ["Excel", "SQL", "Power BI"],
    services: ["Анализ данных и дашборды"],
    query: "аналитик данных OR BI-аналитик",
    pattern: /аналитик|анализ данн|дашборд|power bi|excel|таблиц/iu,
  },
  {
    id: "assistance",
    label: "Ассистирование",
    headline: "Бизнес-ассистент",
    skills: ["Работа с документами", "Поиск информации", "Организация задач"],
    services: ["Удалённое административное сопровождение"],
    query: "бизнес-ассистент OR виртуальный ассистент",
    pattern:
      /ассистент|помощник|администратор|работа с документ|поиск информац/iu,
  },
  {
    id: "education",
    label: "Обучение",
    headline: "Методист онлайн-обучения",
    skills: ["Разработка курсов", "Учебные материалы"],
    services: ["Подготовка образовательных материалов"],
    query: "методист OR онлайн-преподаватель",
    pattern:
      /методист|преподавател|учебн|образовательн|разработк\p{L}* курс|обучени/iu,
  },
] as const;
export type DisciplineId = (typeof disciplines)[number]["id"];
export function opportunityDisciplines(item: {
  title?: unknown;
  description?: unknown;
}) {
  const text =
    `${typeof item.title === "string" ? item.title : ""} ${typeof item.description === "string" ? item.description : ""}`
      .slice(0, 20000)
      .replace(/<[^>]*>/g, " ");
  return disciplines.filter((d) => d.pattern.test(text)).map((d) => d.id);
}
/** Keep manually entered skills when applying a profession preset. */
export function mergeProfileSkills(current: string, added: readonly string[]) {
  const values = new Map<string, string>();
  for (const value of [...current.split(/[,;\n]/), ...added]) {
    const text = value.trim();
    if (text) values.set(text.toLocaleLowerCase("ru"), text);
  }
  const result: string[] = [];
  for (const value of values.values()) {
    if ([...result, value].join(", ").length <= 1000) result.push(value);
  }
  return result.join(", ");
}
