'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Clipboard, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type Opportunity = { id: string; title: string; company_name: string | null; description: string | null; source_url: string; budget_min: number | null; budget_max: number | null; currency_code: string };
type Profile = { display_name: string | null; headline: string | null; bio: string | null; target_monthly_income: number | null };
type HistoryItem = { id: string; content: string; created_at: string; opportunity_id: string | null; opportunities?: { title: string } | null };

function makeDraft(o: Opportunity, p: Profile, skills: string[], services: string[], tone: string, extra: string) {
  const name = p.display_name?.trim();
  const intro = tone === 'formal'
    ? `Хотел бы предложить свою кандидатуру для задачи «${o.title}».`
    : tone === 'friendly'
      ? `Увидел вашу задачу «${o.title}» — думаю, смогу помочь с её реализацией.`
      : `Пишу по поводу задачи «${o.title}». По описанию вижу, что мой опыт может быть полезен.`;
  const strengths = [...services.slice(0, 3), ...skills.slice(0, 4)];
  const details = o.description?.trim().replace(/\s+/g, ' ').slice(0, 360);
  const budget = o.budget_min != null || o.budget_max != null
    ? `Указанный бюджет: ${o.budget_min == null ? 'не указан' : `${Number(o.budget_min).toLocaleString('ru-RU')} ${o.currency_code}`} — ${o.budget_max == null ? 'не указан' : `${Number(o.budget_max).toLocaleString('ru-RU')} ${o.currency_code}`}.`
    : '';
  return [name ? `Здравствуйте! Меня зовут ${name}.` : 'Здравствуйте!', '', intro,
    details ? `Я ознакомился с описанием: ${details}${o.description && o.description.length > 360 ? '…' : ''}` : '',
    strengths.length ? `Мои релевантные навыки и услуги: ${strengths.join(', ')}.` : 'Готов уточнить требования и предложить план работы.',
    budget, extra.trim() ? `Дополнительно: ${extra.trim()}` : '', '',
    'Буду рад обсудить детали, сроки и ожидаемый результат. Если удобно, могу задать несколько уточняющих вопросов и предложить следующие шаги.', '', 'Хорошего дня!'
  ].filter(Boolean).join('\n');
}

export default function AiOutreachPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [profile, setProfile] = useState<Profile>({ display_name: '', headline: '', bio: '', target_monthly_income: null });
  const [skills, setSkills] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [tone, setTone] = useState('balanced');
  const [extra, setExtra] = useState('');
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) { router.replace('/auth'); return; }
    setUserId(user.id);
    const [opp, prof, skillRows, serviceRows, generated] = await Promise.all([
      supabase.from('opportunities').select('id,title,company_name,description,source_url,budget_min,budget_max,currency_code').eq('is_active', true).order('discovered_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('display_name,headline,bio,target_monthly_income').eq('id', user.id).maybeSingle(),
      supabase.from('profile_skills').select('skills(name)').eq('user_id', user.id),
      supabase.from('profile_services').select('services(name)').eq('user_id', user.id),
      supabase.from('generated_applications').select('id,content,created_at,opportunity_id,opportunities(title)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    ]);
    for (const result of [opp, prof, skillRows, serviceRows, generated]) if (result.error) throw result.error;
    const list = (opp.data || []) as Opportunity[];
    setOpportunities(list); setSelectedId(current => current || list[0]?.id || '');
    if (prof.data) setProfile(prof.data as Profile);
    setSkills(((skillRows.data || []) as unknown as Array<{ skills: { name: string } | null }>).map(x => x.skills?.name || '').filter(Boolean));
    setServices(((serviceRows.data || []) as unknown as Array<{ services: { name: string } | null }>).map(x => x.services?.name || '').filter(Boolean));
    setHistory((generated.data || []) as unknown as HistoryItem[]);
  }, [router]);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      await Promise.resolve();
      try { await load(); }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить данные.'); }
      finally { if (alive) setLoading(false); }
    };
    void initialize();
    return () => { alive = false; };
  }, [load]);
  const selected = opportunities.find(x => x.id === selectedId);
  function generate() { if (!selected) return; setError(''); setNotice(''); setDraft(makeDraft(selected, profile, skills, services, tone, extra)); }
  async function save() {
    if (!selected || !draft.trim() || !userId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: saveError } = await supabase.from('generated_applications').insert({ user_id: userId, opportunity_id: selected.id, model: 'leadly-template-v1', prompt_version: 'outreach-template-v1', content: draft, portfolio_match: { skills, services, tone } });
      if (saveError) throw saveError;
      setNotice('Черновик сохранён. Проверь текст перед отправкой клиенту.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить черновик.'); }
    finally { setSaving(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(draft); setNotice('Черновик скопирован. Проверь его перед отправкой.'); } catch { setError('Не удалось скопировать автоматически. Выдели текст и скопируй вручную.'); } }

  return <main className="app-shell"><Sidebar activeHref="/ai-outreach" /><section className="content profile-content">
    <header className="topbar"><div><div className="eyebrow">AI OUTREACH · V1</div><h1>Подготовка отклика</h1><p>Персональный черновик на основе выбранной возможности, твоего профиля, навыков и услуг.</p></div><Link className="ghost" href="/opportunities"><ArrowLeft size={15} /> К возможностям</Link></header>
    {loading ? <div className="panel profile-loading"><LoaderCircle size={22} className="spin" /> Загружаем данные…</div> : <div className="profile-form">
      <section className="panel profile-section"><div className="profile-section-heading"><span className="onboarding-icon"><Sparkles size={20} /></span><div><h2>1. Возможность</h2><p>Выбери реальное предложение из базы.</p></div></div>
        {opportunities.length ? <label className="profile-label">Предложение<select value={selectedId} onChange={e => { setSelectedId(e.target.value); setDraft(''); }}><option value="">Выбери предложение</option>{opportunities.map(o => <option key={o.id} value={o.id}>{o.title}{o.company_name ? ` — ${o.company_name}` : ''}</option>)}</select></label> : <p className="auth-message">В базе пока нет активных предложений. Сначала подключим источники и загрузку в таблицу opportunities.</p>}
        {selected && <div className="profile-entry"><div><strong>{selected.title}</strong><small>{selected.company_name || 'Компания не указана'} · <a href={selected.source_url} target="_blank" rel="noreferrer">Открыть источник</a></small></div></div>}
      </section>
      <section className="panel profile-section"><div className="profile-section-heading"><span className="onboarding-icon"><Send size={20} /></span><div><h2>2. Настройки сообщения</h2><p>Выбери тон и добавь только те детали, которые можно подтвердить.</p></div></div>
        <label className="profile-label">Тон<select value={tone} onChange={e => setTone(e.target.value)}><option value="balanced">Профессиональный и дружелюбный</option><option value="formal">Формальный</option><option value="friendly">Неформальный</option></select></label>
        <label className="profile-label">Дополнительные факты<textarea rows={3} value={extra} onChange={e => setExtra(e.target.value)} placeholder="Например: портфолио, похожий проект или сроки. Не добавляй неподтверждённые обещания." /></label>
        <div className="profile-save-row"><span>{profile.headline || 'Специализация не указана'} · навыков: {skills.length} · услуг: {services.length}</span><button className="auth-submit profile-save" type="button" disabled={!selected} onClick={generate}><Sparkles size={16} /> Сформировать черновик</button></div>
      </section>
      <section className="panel profile-section"><div className="profile-section-heading"><span className="onboarding-icon"><Clipboard size={20} /></span><div><h2>3. Проверка и редактирование</h2><p>Версия 1 использует шаблон, а не внешнюю LLM. Автоматической отправки нет.</p></div></div>
        <textarea className="outreach-draft" rows={12} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Черновик появится здесь после генерации." />
        <div className="profile-save-row"><span>Перед отправкой проверь факты, тон и соответствие задаче.</span><div className="outreach-actions"><button className="ghost" type="button" disabled={!draft.trim()} onClick={copy}><Clipboard size={15} /> Копировать</button><button className="auth-submit profile-save" type="button" disabled={!draft.trim() || saving || !selected} onClick={save}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Сохранить</button></div></div>
      </section>
      {error && <p className="auth-message error" role="alert">{error}</p>}{notice && <p className="auth-message success" role="status">{notice}</p>}
      <section className="panel profile-section"><div className="profile-section-heading"><span className="onboarding-icon"><Clipboard size={20} /></span><div><h2>Недавние черновики</h2><p>Сохранённая история твоего аккаунта.</p></div></div>
        {history.length ? <div className="profile-entry-list">{history.map(item => <div className="profile-entry" key={item.id}><div><strong>{item.opportunities?.title || 'Отклик'}</strong><small>{new Date(item.created_at).toLocaleString('ru-RU')} · {item.content.slice(0, 120)}{item.content.length > 120 ? '…' : ''}</small></div><button className="ghost" type="button" onClick={() => { setDraft(item.content); setNotice('Черновик загружен в редактор.'); }}><Clipboard size={14} /> Открыть</button></div>)}</div> : <p className="profile-muted">Сохранённых черновиков пока нет.</p>}
      </section>
    </div>}
    {error && loading && <p className="auth-message error" role="alert">{error}</p>}
  </section></main>;
}
