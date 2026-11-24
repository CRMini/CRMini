"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/sidebar-preference";

const items = [
  ["/", "⌂", "Visão geral"],
  ["/clientes", "♙", "Clientes"],
  ["/leads", "◎", "Leads"],
  ["/contatos", "♧", "Contatos"],
  ["/oportunidades", "◈", "Oportunidades"],
  ["/tarefas", "✓", "Tarefas"],
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const [desktop, setDesktop] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const userToggled = useRef(false);

  useEffect(() => {
    setDesktop(Boolean(window.crmDesktop));
    let active = true;
    void readSidebarCollapsed().then((stored) => {
      if (active && !userToggled.current) setCollapsed(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleSidebar() {
    userToggled.current = true;
    const next = !collapsed;
    setCollapsed(next);
    void writeSidebarCollapsed(next);
  }

  return (
    <aside
      id="app-sidebar"
      className={`sidebar${collapsed ? " collapsed" : ""}`}
    >
      <Link className="brand" href="/" aria-label="CRMini">
        <Image
          className="brand-mark"
          src="/brand/crmini-symbol.svg"
          alt="CRMini"
          width={32}
          height={32}
          priority
        />
        <span className="brand-name" aria-hidden="true">
          <span className="brand-name-crm">CRM</span>
          <span className="brand-name-mini">ini</span>
        </span>
      </Link>
      <nav aria-label="Navegação principal">
        {items.map(([href, icon, label]) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              title={label}
              className={`nav-item${active ? " active" : ""}`}
              href={href}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      {desktop && (
        <Link
          className={`nav-item sidebar-settings${pathname === "/configuracoes" ? " active" : ""}`}
          href="/configuracoes"
          title="Configurações"
          aria-current={pathname === "/configuracoes" ? "page" : undefined}
        >
          <span aria-hidden="true">⚙</span>Configurações
        </Link>
      )}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-expanded={!collapsed}
        aria-controls="app-sidebar"
        aria-label={
          collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
        }
        title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
      >
        <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
        <span className="sidebar-toggle-label" aria-hidden="true">
          {collapsed ? "Expandir" : "Recolher"}
        </span>
      </button>
    </aside>
  );
}
