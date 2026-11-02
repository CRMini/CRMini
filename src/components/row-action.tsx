import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type RowActionTone = "default" | "danger";

function rowActionClassName(tone: RowActionTone = "default", labeled = false) {
  return [
    "row-action",
    tone === "danger" ? "row-action--danger" : "",
    labeled ? "row-action--labeled" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Ação de linha: só o pictograma ou pictograma + texto curto quando o ícone
 * sozinho não deixa claro o objeto da ação (ex.: "＋ Empresa"). */
function RowActionContent({ icon, text }: { icon: string; text?: ReactNode }) {
  return (
    <>
      <span aria-hidden="true">{icon}</span>
      {text ? <span className="row-action-text">{text}</span> : null}
    </>
  );
}

export function RowActionLink({
  href,
  icon,
  label,
  text,
  tone,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  text?: ReactNode;
  tone?: RowActionTone;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      className={rowActionClassName(tone, Boolean(text))}
      href={href}
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
    >
      <RowActionContent icon={icon} text={text} />
    </Link>
  );
}

export function RowActionButton({
  icon,
  label,
  text,
  onClick,
  tone,
  disabled = false,
  ariaExpanded,
  ariaControls,
}: {
  icon: string;
  label: string;
  text?: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  tone?: RowActionTone;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
}) {
  return (
    <button
      type="button"
      className={rowActionClassName(tone, Boolean(text))}
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      data-tooltip={label}
      onClick={onClick}
      disabled={disabled}
    >
      <RowActionContent icon={icon} text={text} />
    </button>
  );
}
