import Link from "next/link";
export function ProfileTabs({ plans = false }: { plans?: boolean }) {
  return (
    <nav className="profile-tabs" aria-label="Вкладки профиля">
      <Link href="/profile" aria-current={!plans ? "page" : undefined}>
        Профиль и поиск
      </Link>
      <Link
        href="/profile/plans"
        className="profile-plans-tab"
        aria-current={plans ? "page" : undefined}
      >
        <span className="plan-tab-dot" />
        Тарифы
      </Link>
    </nav>
  );
}
