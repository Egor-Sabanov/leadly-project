/** Conservative content gate. Uncertain and non-Russian posts never enter discovery. */
export function russianOpportunityLanguage(
  title: unknown,
  description?: unknown,
) {
  const text =
    `${typeof title === "string" ? title : ""} ${typeof description === "string" ? description : ""}`
      .slice(0, 20000)
      .normalize("NFKC")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+/gi, " ")
      .replace(/&(?:#\w+|\w+);/g, " ")
      .toLowerCase();
  const letters = text.match(/\p{L}/gu) || [];
  const russian = text.match(/[а-яё]/g) || [];
  const words = text.match(/[а-яё]{2,}/g) || [];
  const version = "ru-content-v1";
  if (
    /[іїєґўђћљњџј]/u.test(text) ||
    /(?:търсим|изисквания|заплащане|кандидатствай|българ|патрабуецца|патрэбны)/u.test(
      text,
    )
  )
    return {
      language: "other",
      reason: "other_language_markers",
      version,
    } as const;
  if (
    russian.length < 10 ||
    (words.length < 2 &&
      !/(?:видеомонтаж|звукорежисс[её]р|копирайтинг|иллюстратор)/u.test(text))
  )
    return {
      language: letters.length > 12 ? "other" : "und",
      reason: "insufficient_russian_text",
      version,
    } as const;
  const signals = words.filter((word) =>
    /^(?:нуж[её]н|нужна|нужно|нужны|ищу|ищем|требуется|требуются|необходим|сдела|созда|разработ|доработ|настро|поддержк|верст|вёрст|дизайн|интерфейс|монтаж|видеомонтаж|редактор|копирайт|специалист|опыт|срок|задач|заказ|проект|услуг|соискател|ваканси|озвуч|диктор|звук|аудио|перевод|локализ|карточк|маркетплейс|аналитик|таблиц|ассистент|помощник|методист|преподавател|обучени|сценари|иллюстрац|соцсет|реклам)/u.test(
      word,
    ),
  );
  const technical =
    /\b(?:react|next\.?js|node\.?js|typescript|javascript|figma|ui|ux|api|rest|html|css|seo|saas|mvp|crm|sql|postgresql|supabase|python|php|docker|wordpress|tilda|reels|shorts|telegram|google|web|frontend|backend|fullstack|davinci|resolve|adobe|premiere|pro|after|effects|power|bi|excel|ozon|wildberries|b2b|b2c)\b/giu;
  const prose = text.replace(technical, " ");
  const proseLetters = prose.match(/\p{L}/gu) || [];
  const share = russian.length / Math.max(1, proseLetters.length);
  if (share < 0.55 || signals.length === 0)
    return {
      language: "und",
      reason: "mixed_or_uncertain_language",
      version,
    } as const;
  return { language: "ru", reason: "russian_content", version } as const;
}
export function isRussianOpportunity(item: {
  title?: unknown;
  description?: unknown;
}) {
  return (
    russianOpportunityLanguage(item.title, item.description).language === "ru"
  );
}
