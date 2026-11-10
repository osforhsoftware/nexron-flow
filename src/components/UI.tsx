import type { ReactNode } from "react";
import { CalendarDays, Search } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

export function FilterBar({
  children,
  search,
}: {
  children?: ReactNode;
  search?: boolean;
}) {
  return (
    <div className="filter-bar">
      <span className="filter-label">Filter by :</span>
      <button className="filter-pill" type="button">
        This Month⌄
      </button>
      <span className="date-pill">
        <CalendarDays size={13} /> 01/11/2026&nbsp;&nbsp; To &nbsp;&nbsp;30/11/2026
      </span>
      <button className="filter-pill" type="button">
        All Firms⌄
      </button>
      {children}
      {search ? (
        <label className="compact-search">
          <Search size={14} />
          <input aria-label="Search" />
        </label>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="toggle-row">
      <button
        type="button"
        className={`switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="illustrated-empty">
      <div className="empty-illustration">▤</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function SettingCheck({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="setting-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {hint ? <small title={hint}>ⓘ</small> : null}
    </label>
  );
}
