"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  Loader2,
  PackageOpen,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import type { DateRange, PageResult } from "../lib/types";
import { useQueryFilters } from "./hooks";

export function Button({
  variant = "primary",
  size,
  className = "",
  pending,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  pending?: boolean;
}) {
  return (
    <button
      className={`button button--${variant}${size ? ` button--${size}` : ""} ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand${small ? " brand--small" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 5h5v5H6zM13 5h5v5h-5zM6 12h5v5H6z" fill="currentColor" />
          <path d="m13 12 5 0-5 5v-5Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        verdant <span className="brand-suffix">POS</span>
      </span>
    </span>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
  dot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: "green" | "amber";
}) {
  return (
    <div className={`metric${tone ? ` metric--${tone}` : ""}`}>
      <div className="metric-label">
        {label}
        {Icon && <Icon size={17} aria-hidden="true" />}
      </div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = PackageOpen,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " empty-state--compact" : ""}`}>
      <span className="empty-icon">
        <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Notice({
  children,
  tone = "error",
  onDismiss,
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info" | "warning";
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
      {onDismiss && (
        <IconButton label="Dismiss message" onClick={onDismiss}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  return children ? (
    <span id={id} className="field-error" role="alert">
      {children}
    </span>
  ) : null;
}

export function LoadingView({
  compact = false,
  label = "Loading your workspace…",
}: {
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`loading-view${compact ? " loading-view--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={24} className="spin" aria-hidden="true" />
      <span>{label}</span>
      {!compact && (
        <div className="loading-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

export function PageError({
  message = "We couldn’t load this page. Your saved records are safe. Please try again.",
  reset,
}: {
  message?: string;
  reset?: () => void;
}) {
  return (
    <div className="page-error">
      <EmptyState
        icon={AlertCircle}
        title="Something didn’t load"
        description={message}
        action={
          reset ? (
            <Button onClick={reset} variant="secondary">
              <RefreshCw size={16} />
              Try again
            </Button>
          ) : (
            <Link href="/" className="button button--secondary">
              Back to overview
            </Link>
          )
        }
      />
    </div>
  );
}

let modalStack: string[] = [];
let bodyOverflow = "";
const focusableSelector =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
  busy = false,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const id = useId();
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const [mounted, setMounted] = useState(false);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!modalStack.length) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    modalStack.push(id);
    const elements = () =>
      Array.from(dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.matches(":disabled") && element.getClientRects().length > 0,
      );
    const frame = requestAnimationFrame(() => {
      const autofocus = dialog.current?.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
      (
        autofocus ??
        elements().find((element) => !element.hasAttribute("data-modal-close")) ??
        dialog.current
      )?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = elements();
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !dialog.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (modalStack.at(-1) === id && !dialog.current?.contains(event.target as Node))
        (elements()[0] ?? dialog.current)?.focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", containFocus);
      modalStack = modalStack.filter((entry) => entry !== id);
      if (!modalStack.length) document.body.style.overflow = bodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.getElementById("main-content")?.focus();
    };
  }, [id, mounted]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        aria-busy={busy}
        tabIndex={-1}
        className={`modal${wide ? " modal--wide" : ""} ${className}`}
      >
        <div className="modal-header">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {description && <p id={`${id}-description`}>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            data-modal-close
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}

export function Pagination<T>({
  result,
  noun = "records",
}: {
  result: PageResult<T>;
  noun?: string;
}) {
  const update = useQueryFilters();
  const pages = Math.max(1, Math.ceil(result.count / result.pageSize));
  const start = result.count ? (result.page - 1) * result.pageSize + 1 : 0;
  const end = Math.min(result.page * result.pageSize, result.count);
  return (
    <div className="pagination">
      <span>
        {start.toLocaleString()}–{end.toLocaleString()} of {result.count.toLocaleString()} {noun}
      </span>
      <div className="pagination-controls">
        <span className="muted">
          Page {result.page} of {pages}
        </span>
        <IconButton
          label="Previous page"
          disabled={result.page <= 1}
          onClick={() => update({ page: String(result.page - 1) }, false)}
        >
          <ArrowLeft size={17} />
        </IconButton>
        <IconButton
          label="Next page"
          disabled={result.page >= pages}
          onClick={() => update({ page: String(result.page + 1) }, false)}
        >
          <ArrowRight size={17} />
        </IconButton>
      </div>
    </div>
  );
}

export function DateRangeControl({ range }: { range: DateRange }) {
  const update = useQueryFilters();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
  }, [range.from, range.to]);
  return (
    <form
      className="date-range"
      aria-label="Reporting date range"
      onSubmit={(event) => {
        event.preventDefault();
        update({ period: null, preset: "custom", from, to });
      }}
    >
      <label className="sr-only" htmlFor="range-preset">
        Date preset
      </label>
      <select
        id="range-preset"
        value={range.preset === "today" ? "day" : range.preset || "custom"}
        onChange={(event) => {
          const value = event.target.value;
          if (value !== "custom") update({ period: null, preset: value, from: null, to: null });
          else update({ period: null, preset: "custom", from, to });
        }}
      >
        <option value="day">Today</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="custom">Custom dates</option>
      </select>
      <div className="date-inputs">
        <label>
          <span className="sr-only">From date</span>
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            max={to}
            required
          />
        </label>
        <span className="date-separator" aria-hidden="true">
          —
        </span>
        <label>
          <span className="sr-only">To date, inclusive</span>
          <input
            type="date"
            aria-label="To date, inclusive"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            min={from}
            required
          />
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </div>
    </form>
  );
}

type MenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
};
export function ActionMenu({
  label = "More actions",
  items,
  children,
}: {
  label?: string;
  items: MenuItem[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (box)
        setPosition({
          top: Math.min(box.bottom + 6, window.innerHeight - Math.min(items.length * 42 + 16, 320)),
          right: Math.max(12, window.innerWidth - box.right),
        });
    };
    place();
    const frame = requestAnimationFrame(() =>
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus(),
    );
    const dismiss = (event: MouseEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", dismiss);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", dismiss);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, items.length]);
  const finish = (item: MenuItem) => {
    setOpen(false);
    trigger.current?.focus();
    item.onSelect?.();
  };
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={children ? "account-trigger" : "icon-button"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {children ?? <Ellipsis size={19} />}
        {children && <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="action-menu"
            role="menu"
            aria-label={label}
            style={{ top: position.top, right: position.right }}
            onKeyDown={(event) => {
              const nodes = Array.from(
                menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ??
                  [],
              );
              const index = nodes.indexOf(document.activeElement as HTMLElement);
              if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              }
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? nodes.length - 1
                      : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) %
                        nodes.length;
                nodes[next]?.focus();
              }
            }}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  <span>{item.label}</span>
                </>
              );
              return item.href ? (
                <Link
                  key={item.label}
                  role="menuitem"
                  href={item.href}
                  onClick={() => finish(item)}
                  className={item.danger ? "danger-text" : undefined}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => finish(item)}
                  className={item.danger ? "danger-text" : undefined}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

export function FormActions({
  pending,
  label,
  onCancel,
  danger = false,
  form,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  danger?: boolean;
  form?: string;
}) {
  return (
    <>
      <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" form={form} pending={pending} variant={danger ? "danger" : "primary"}>
        {!pending && <Check size={16} />}
        {pending ? "Saving…" : label}
      </Button>
    </>
  );
}
