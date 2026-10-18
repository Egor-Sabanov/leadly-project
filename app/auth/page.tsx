'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { LeadlyLogo } from '@/components/brand/LeadlyLogo';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage('Аккаунт создан. Проверь почту и подтверди адрес, затем войди в LEADLY.');
          setMode('signin');
          return;
        }
        router.replace('/onboarding'); router.refresh();
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        router.replace('/onboarding'); router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить вход. Попробуй ещё раз.');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" aria-hidden="true" /><div className="auth-glow auth-glow-two" aria-hidden="true" />
      <header className="auth-header"><LeadlyLogo href="/" /><span className="auth-header-note"><ShieldCheck size={15} /> Твой рабочий кабинет</span></header>
      <section className="auth-card">
        <div className="auth-kicker">OPPORTUNITY INTELLIGENCE</div>
        <h1 key={`title-${mode}`} className="auth-mode-content">{mode === 'signup' ? 'Начни зарабатывать системно' : 'С возвращением'}</h1>
        <p key={`subtitle-${mode}`} className="auth-subtitle auth-mode-content">{mode === 'signup' ? 'Создай аккаунт — настроим LEADLY под твои навыки и цели.' : 'Войди, чтобы продолжить работу с возможностями.'}</p>
        <div className="auth-tabs" role="tablist" aria-label="Тип авторизации">
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>Регистрация</button>
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>Вход</button>
        </div>
        <form key={`form-${mode}`} className="auth-form auth-mode-content" onSubmit={handleSubmit}>
          {mode === 'signup' && <label>Как к тебе обращаться<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={80} required /></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
          <label>Пароль<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" minLength={8} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {error && <p className="auth-message error" role="alert">{error}</p>}{message && <p className="auth-message success" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <>{mode === 'signup' ? 'Создать аккаунт' : 'Войти в LEADLY'} <ArrowRight size={17} /></>}{busy && 'Обрабатываем...'}</button>
        </form>
        <p className="auth-legal">Продолжая, ты создаёшь личный аккаунт LEADLY. Данные профиля доступны только тебе.</p>
      </section>
      <footer className="auth-footer">LEADLY <span>·</span> Возможности, которые превращаются в доход</footer>
    </main>
  );
}
