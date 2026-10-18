-- LEADLY starter catalog. Safe to run more than once; does not change user data.
insert into public.skills (name, slug, category) values
  ('HTML и CSS', 'html-css', 'Разработка'),
  ('JavaScript', 'javascript', 'Разработка'),
  ('React', 'react', 'Разработка'),
  ('Next.js', 'nextjs', 'Разработка'),
  ('TypeScript', 'typescript', 'Разработка'),
  ('Адаптивная вёрстка', 'responsive-layout', 'Разработка'),
  ('UI/UX-дизайн', 'ui-ux-design', 'Дизайн'),
  ('Figma', 'figma', 'Дизайн'),
  ('Копирайтинг', 'copywriting', 'Контент'),
  ('SEO', 'seo', 'Маркетинг'),
  ('Монтаж Reels и Shorts', 'short-video-editing', 'Видео'),
  ('Работа с AI-инструментами', 'ai-tools', 'AI')
on conflict (slug) do nothing;

insert into public.services (name, slug, category) values
  ('Создание лендинга', 'landing-page', 'Разработка'),
  ('Создание многостраничного сайта', 'business-website', 'Разработка'),
  ('Доработка сайта', 'website-improvements', 'Разработка'),
  ('Адаптивная вёрстка', 'responsive-layout-service', 'Разработка'),
  ('Прототип и дизайн в Figma', 'figma-prototype-design', 'Дизайн'),
  ('Настройка AI-автоматизации', 'ai-automation-setup', 'AI'),
  ('Монтаж Reels и Shorts', 'reels-shorts-editing', 'Видео'),
  ('SEO-аудит сайта', 'seo-audit', 'Маркетинг'),
  ('Написание текстов для сайта', 'website-copywriting', 'Контент'),
  ('Поддержка сайта', 'website-maintenance', 'Разработка')
on conflict (slug) do nothing;
