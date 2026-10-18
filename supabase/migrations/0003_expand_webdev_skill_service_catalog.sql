-- LEADLY: expand catalog for web-app, MVP, SaaS and integration work.
-- Additive and rerunnable: existing catalog rows and user profile selections are not modified.

begin;

insert into public.skills (name, slug, category) values
  ('Supabase', 'supabase', 'Backend'),
  ('PostgreSQL', 'postgresql', 'Базы данных'),
  ('Node.js', 'nodejs', 'Backend'),
  ('REST API', 'rest-api', 'Интеграции'),
  ('Git и GitHub', 'git-github', 'Инструменты'),
  ('Vercel', 'vercel', 'Инструменты'),
  ('Telegram Bot API', 'telegram-bot-api', 'Интеграции')
on conflict (slug) do nothing;

insert into public.services (name, slug, category) values
  ('Разработка MVP', 'mvp-development', 'Разработка'),
  ('Разработка SaaS-приложения', 'saas-development', 'Разработка'),
  ('Создание веб-приложения', 'web-application-development', 'Разработка'),
  ('Интеграция внешнего API', 'external-api-integration', 'Интеграции'),
  ('Разработка Telegram-бота и Mini App', 'telegram-bot-mini-app-development', 'Интеграции'),
  ('Интеграция AI-функций', 'ai-feature-integration', 'AI'),
  ('Создание CRM / внутренней системы', 'crm-internal-system-development', 'Разработка')
on conflict (slug) do nothing;

commit;

-- Verification: both result sets should contain the entries above.
select name, slug, category
from public.skills
where slug in (
  'supabase', 'postgresql', 'nodejs', 'rest-api',
  'git-github', 'vercel', 'telegram-bot-api'
)
order by name;

select name, slug, category
from public.services
where slug in (
  'mvp-development', 'saas-development', 'web-application-development',
  'external-api-integration', 'telegram-bot-mini-app-development',
  'ai-feature-integration', 'crm-internal-system-development'
)
order by name;
