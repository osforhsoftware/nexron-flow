import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Home,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShoppingCart,
  Settings,
  Store,
  Headphones,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { CommandPalette } from "./CommandPalette";
import { Modal } from "./Modal";
import { useApp } from "../lib/AppContext";
import { canOpenRoute, prefersQuickOrder, ROLE_LABELS } from "../lib/roles";
import { useIsMobileShell } from "../lib/useMediaQuery";

const SIDEBAR_KEY = "ledgerly.sidebar.collapsed";

type NavChild = { label: string; to: string; create?: boolean; action?: "logout" };

const navGroups: Array<{
  label: string;
  icon: typeof Home;
  to: string;
  children?: NavChild[];
}> = [
  { label: "Home", icon: Home, to: "/" },
  { label: "Parties", icon: Users, to: "/parties" },
  {
    label: "Items",
    icon: Package,
    to: "/items",
    children: [
      { label: "Products", to: "/items/products" },
      { label: "Equipment", to: "/items/equipment" },
    ],
  },
  {
    label: "Sale",
    icon: ShoppingCart,
    to: "/sales",
    children: [
      { label: "Sale Invoices", to: "/sales", create: true },
      { label: "Estimate / Quotation", to: "/sales/quotations", create: true },
      { label: "Sale Order", to: "/sales/orders", create: true },
      { label: "Delivery Challan", to: "/sales/delivery", create: true },
      { label: "Payment-In", to: "/payments?create=1" },
    ],
  },
  {
    label: "Purchase",
    icon: Store,
    to: "/purchases",
    children: [
      { label: "Overview", to: "/purchases" },
      { label: "RFQ", to: "/purchases/rfq", create: true },
      { label: "PO", to: "/purchases/orders", create: true },
      { label: "GRN", to: "/purchases/grn", create: true },
      { label: "Purchase Returns", to: "/purchases/returns", create: true },
      { label: "Purchase Bills", to: "/purchases/bills", create: true },
    ],
  },
  {
    label: "Service",
    icon: Headphones,
    to: "/service/calls",
    children: [{ label: "Service Calls", to: "/service/calls", create: true }],
  },
  { label: "Cash & Bank", icon: Wallet, to: "/payments" },
  { label: "Reports", icon: BarChart3, to: "/reports" },
  { label: "Utilities", icon: Wrench, to: "/utilities" },
  {
    label: "Settings",
    icon: Settings,
    to: "/settings",
    children: [{ label: "Logout", to: "/settings", action: "logout" }],
  },
];

function pathMatches(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function tabIsActive(pathname: string, childTo: string, siblings: NavChild[]) {
  const path = childTo.split("?")[0];
  if (pathname === path) return true;
  if (!pathname.startsWith(`${path}/`)) return false;
  return !siblings.some((sibling) => {
    const siblingPath = sibling.to.split("?")[0];
    if (siblingPath === path || siblingPath.length <= path.length) return false;
    return pathname === siblingPath || pathname.startsWith(`${siblingPath}/`);
  });
}

export function AppLayout() {
  const { company, logout, session, canAccess } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileShell();
  const search = new URLSearchParams(location.search);
  const createMode = search.get("create") === "1" || Boolean(search.get("txn"));
  const [expanded, setExpanded] = useState<string[]>(["Sale", "Items", "Purchase", "Service", "Settings"]);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const visibleNav = navGroups.filter((item) => {
    if (canOpenRoute(session ?? undefined, item.to)) return true;
    return (
      item.children?.some(
        (child) => !child.action && canOpenRoute(session ?? undefined, child.to.split("?")[0]),
      ) ?? false
    );
  });
  const showSaleQuick = canAccess("sales") || canAccess("new_invoice");
  const showPurchaseQuick = canAccess("purchases") || canAccess("purchase_bills");
  const showQuickOrder = prefersQuickOrder(session) && showSaleQuick;

  const activeGroup = useMemo(() => {
    if (location.pathname.startsWith("/sales/quick")) {
      return visibleNav.find((item) => item.label === "Sale") ?? null;
    }
    const scored = visibleNav
      .map((item) => {
        const childHit = item.children?.find(
          (c) => !c.action && pathMatches(location.pathname, c.to.split("?")[0]),
        );
        const selfHit = pathMatches(location.pathname, item.to);
        if (!selfHit && !childHit) return null;
        const score = childHit
          ? childHit.to.split("?")[0].length
          : item.to === "/"
            ? 1
            : item.to.length;
        return { item, score };
      })
      .filter((row): row is { item: (typeof visibleNav)[number]; score: number } => Boolean(row));
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.item ?? null;
  }, [visibleNav, location.pathname]);

  const sectionTabs = useMemo(() => {
    if (!activeGroup?.children?.length) return [];
    return activeGroup.children.filter(
      (child) => !child.action && canOpenRoute(session ?? undefined, child.to.split("?")[0]),
    );
  }, [activeGroup, session]);

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith("/sales/quick")) return "Quick Order";
    const child = sectionTabs.find((c) => pathMatches(location.pathname, c.to.split("?")[0]));
    return child?.label ?? activeGroup?.label ?? company?.name ?? "Home";
  }, [sectionTabs, activeGroup, location.pathname, company?.name]);

  const isHome = location.pathname === "/";

  const bottomTabs = useMemo(() => {
    const tabs: Array<{ to: string; label: string; icon: typeof Home; end?: boolean }> = [];
    if (canOpenRoute(session ?? undefined, "/")) {
      tabs.push({ to: "/", label: "Home", icon: Home, end: true });
    }
    if (canOpenRoute(session ?? undefined, "/parties")) {
      tabs.push({ to: "/parties", label: "Parties", icon: Users });
    }
    if (showSaleQuick) {
      tabs.push({
        to: showQuickOrder ? "/sales/quick" : "/sales",
        label: showQuickOrder ? "Order" : "Sale",
        icon: showQuickOrder ? Zap : ShoppingCart,
      });
    } else if (canOpenRoute(session ?? undefined, "/purchases")) {
      tabs.push({ to: "/purchases", label: "Buy", icon: Store });
    }
    if (canOpenRoute(session ?? undefined, "/payments")) {
      tabs.push({ to: "/payments", label: "Cash", icon: Wallet });
    }
    if (canOpenRoute(session ?? undefined, "/reports")) {
      tabs.push({ to: "/reports", label: "Reports", icon: BarChart3 });
    }
    return tabs.slice(0, 4);
  }, [session, showSaleQuick, showQuickOrder]);

  useEffect(() => {
    setDrawerOpen(false);
    setFabOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
      setFabOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!drawerOpen && !fabOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setFabOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, fabOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      // App search uses Ctrl/Cmd+K. Do not hijack Ctrl+F (browser find).
      if (key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle(label: string) {
    setExpanded((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function askLogout() {
    setLogoutOpen(true);
  }

  async function signOut() {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutOpen(false);
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  function renderNav(opts: { mobileDrawer?: boolean }) {
    const hideChildren = opts.mobileDrawer ? false : collapsed;
    return (
      <div className="nav-scroll">
        {visibleNav.map(({ to, label, icon: Icon, children }) => {
          const childActive =
            children?.some(
              (child) => !child.action && pathMatches(location.pathname, child.to.split("?")[0]),
            ) ?? false;
          const isOpen = !hideChildren && expanded.includes(label);
          return (
            <div className="nav-group" key={label}>
              <div className="nav-main-row">
                <NavLink
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `nav-link${isActive || childActive ? " active" : ""}`
                  }
                  title={label}
                  onClick={() => opts.mobileDrawer && setDrawerOpen(false)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
                {children && !hideChildren ? (
                  <button className="nav-expand" type="button" onClick={() => toggle(label)}>
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                ) : null}
              </div>
              {children && isOpen ? (
                <div className="nav-children">
                  {children.map((child) => {
                    if (child.action === "logout") {
                      return (
                        <div className="nav-child-row" key="logout">
                          <button
                            type="button"
                            className="nav-child-logout"
                            onClick={() => {
                              if (opts.mobileDrawer) setDrawerOpen(false);
                              askLogout();
                            }}
                          >
                            {child.label}
                          </button>
                        </div>
                      );
                    }
                    const createTo = child.create
                      ? child.to.includes("?")
                        ? `${child.to}&create=1`
                        : `${child.to}?create=1`
                      : child.to;
                    return (
                      <div className="nav-child-row" key={child.to + child.label}>
                        <Link to={child.to} onClick={() => opts.mobileDrawer && setDrawerOpen(false)}>
                          {child.label}
                        </Link>
                        {child.create ? (
                          <button
                            type="button"
                            className="nav-child-add"
                            title={`Add ${child.label}`}
                            aria-label={`Add ${child.label}`}
                            onClick={() => {
                              navigate(createTo);
                              if (opts.mobileDrawer) setDrawerOpen(false);
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const shellClass = [
    "app-shell",
    isMobile ? "mobile-shell" : "",
    isMobile && drawerOpen ? "drawer-open" : "",
    createMode ? "is-create-mode" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <div className={`shell-body${collapsed && !isMobile ? " sidebar-collapsed" : ""}`}>
        {!isMobile ? (
          <aside className="sidebar">
            <div className="sidebar-brand">
              <BrandLogo size={collapsed ? 30 : 36} showWordmark={!collapsed} wordmarkSize="sm" />
              {!collapsed ? (
                <button
                  className="sidebar-toggle"
                  type="button"
                  onClick={toggleSidebar}
                  title="Minimize sidebar"
                  aria-label="Minimize sidebar"
                >
                  <PanelLeftClose size={16} />
                </button>
              ) : null}
            </div>
            <div className="sidebar-top">
              <button
                type="button"
                className="command-search"
                onClick={() => setCommandOpen(true)}
                title="Search parties, items, invoices, pages (Ctrl+K)"
                aria-label="Open search"
              >
                <Search size={15} />
                {!collapsed ? <span>Search… (Ctrl+K)</span> : null}
              </button>
              {collapsed ? (
                <button
                  className="sidebar-toggle"
                  type="button"
                  onClick={toggleSidebar}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen size={16} />
                </button>
              ) : null}
            </div>

            {renderNav({})}

            <div className="sidebar-footer">
              <button className="sidebar-signout" type="button" onClick={askLogout} title="Logout">
                <LogOut size={15} />
                {!collapsed ? <span>Logout</span> : null}
              </button>
            </div>
          </aside>
        ) : null}

        <div className={`main-area${createMode ? " create-mode" : ""}`}>
          {isMobile && !createMode ? (
            <header className={`mobile-topbar${isHome ? " mobile-topbar-home" : ""}`}>
              <button
                type="button"
                className="mobile-icon-btn touch-target"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={20} />
              </button>
              <div className="mobile-topbar-center">
                {isHome ? (
                  <span className="mobile-page-label">Home</span>
                ) : (
                  <>
                    <span className="mobile-business-name">{activeGroup?.label || pageTitle}</span>
                    <small className="mobile-page-label">
                      {pageTitle === activeGroup?.label ? "" : pageTitle}
                    </small>
                  </>
                )}
              </div>
              {isHome ? (
                <span className="mobile-topbar-spacer" aria-hidden />
              ) : showSaleQuick || showPurchaseQuick ? (
                <button
                  type="button"
                  className="mobile-icon-btn touch-target"
                  aria-label="Quick actions"
                  aria-expanded={fabOpen}
                  onClick={() => setFabOpen((v) => !v)}
                >
                  <Plus size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  className="mobile-icon-btn touch-target"
                  aria-label="Settings"
                  onClick={() => navigate("/settings")}
                >
                  <Settings size={18} />
                </button>
              )}
            </header>
          ) : null}

          {!isMobile && !createMode ? (
            <div className="business-bar">
              <div className="business-bar-left">
                {collapsed ? (
                  <button
                    className="sidebar-toggle in-main"
                    type="button"
                    onClick={toggleSidebar}
                    title="Expand sidebar"
                    aria-label="Expand sidebar"
                  >
                    <PanelLeftOpen size={16} />
                  </button>
                ) : null}
                {isHome ? (
                  <button type="button" className="business-name" onClick={() => navigate("/settings")}>
                    <span /> {company?.name || "Enter Business Name"}
                  </button>
                ) : (
                  <nav className="page-context-nav" aria-label="Page">
                    <div className="page-context-tabs" role="tablist">
                      {(sectionTabs.length > 0
                        ? sectionTabs
                        : activeGroup
                          ? [{ label: activeGroup.label, to: activeGroup.to }]
                          : [{ label: pageTitle, to: location.pathname }]
                      ).map((child) => {
                        const active =
                          sectionTabs.length > 0
                            ? tabIsActive(location.pathname, child.to, sectionTabs)
                            : true;
                        return (
                          <Link
                            key={child.to + child.label}
                            to={child.to}
                            role="tab"
                            aria-selected={active}
                            className={`page-context-tab${active ? " active" : ""}`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </nav>
                )}
              </div>
              <div className="business-actions">
                {isHome && showSaleQuick ? (
                  <button className="quick-sale" type="button" onClick={() => navigate("/sales?create=1")}>
                    <Plus size={14} /> Add Sale
                  </button>
                ) : null}
                {isHome && showPurchaseQuick ? (
                  <button
                    className="quick-purchase"
                    type="button"
                    onClick={() => navigate("/purchases/bills?create=1")}
                  >
                    <Plus size={14} /> Add Purchase
                  </button>
                ) : null}
                {isHome && canAccess("utilities") ? (
                  <button className="quick-more" type="button" onClick={() => navigate("/utilities")}>
                    <CircleDollarSign size={14} /> Add More
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="main-scroll">
            <Outlet />
          </div>
        </div>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {logoutOpen ? (
        <Modal
          title="Log out"
          className="modal-confirm"
          onClose={() => {
            if (!loggingOut) setLogoutOpen(false);
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={loggingOut}
                onClick={() => setLogoutOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="button" disabled={loggingOut} onClick={() => void signOut()}>
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </>
          }
        >
          <p>Are you sure you want to log out of this account?</p>
        </Modal>
      ) : null}

      {isMobile ? (
        <>
          <div
            className={`mobile-scrim${drawerOpen || fabOpen ? " open" : ""}`}
            onClick={() => {
              setDrawerOpen(false);
              setFabOpen(false);
            }}
            aria-hidden
          />

          <aside
            className={`mobile-drawer${drawerOpen ? " open" : ""}`}
            aria-hidden={!drawerOpen}
            inert={!drawerOpen ? true : undefined}
          >
            <div className="mobile-drawer-head">
              <BrandLogo size={34} showWordmark wordmarkSize="sm" />
              <button
                type="button"
                className="mobile-icon-btn touch-target"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mobile-drawer-user">
              <strong>{session?.name || session?.username || "User"}</strong>
              <span>
                {session?.role ? ROLE_LABELS[session.role] : "Member"}
                {company?.name ? ` · ${company.name}` : ""}
              </span>
            </div>
            <button
              type="button"
              className="command-search mobile-command-search"
              onClick={() => {
                setDrawerOpen(false);
                setCommandOpen(true);
              }}
              aria-label="Open search"
            >
              <Search size={15} />
              <span>Search parties, items…</span>
            </button>
            {renderNav({ mobileDrawer: true })}
            <div className="mobile-drawer-footer">
              {showQuickOrder ? (
                <Link
                  to="/sales/quick"
                  className="mobile-drawer-action"
                  onClick={() => setDrawerOpen(false)}
                >
                  <Zap size={16} /> Quick Order Entry
                </Link>
              ) : null}
              <button type="button" className="mobile-drawer-action danger" onClick={askLogout}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </aside>

          {!createMode ? (
            <nav className="mobile-bottom-nav" aria-label="Primary">
              {bottomTabs.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `mobile-tab${isActive ? " active" : ""}`}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              ))}
              <button
                type="button"
                className="mobile-tab"
                onClick={() => setDrawerOpen(true)}
                aria-label="More"
              >
                <Menu size={20} />
                <span>More</span>
              </button>
            </nav>
          ) : null}

          {!createMode && (showSaleQuick || showPurchaseQuick) ? (
            <>
              <button
                type="button"
                className={`mobile-fab touch-target${fabOpen ? " open" : ""}`}
                aria-label="Quick actions"
                aria-expanded={fabOpen}
                onClick={() => setFabOpen((v) => !v)}
              >
                {fabOpen ? <X size={22} /> : <Plus size={22} />}
              </button>
              <div className={`mobile-fab-sheet${fabOpen ? " open" : ""}`} role="menu">
                {showQuickOrder ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFabOpen(false);
                      navigate("/sales/quick");
                    }}
                  >
                    <Zap size={16} /> Quick Order
                  </button>
                ) : null}
                {showSaleQuick ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFabOpen(false);
                      navigate("/sales?create=1");
                    }}
                  >
                    <ShoppingCart size={16} /> Add Sale
                  </button>
                ) : null}
                {showPurchaseQuick ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFabOpen(false);
                      navigate("/purchases/bills?create=1");
                    }}
                  >
                    <Store size={16} /> Add Purchase
                  </button>
                ) : null}
                {canOpenRoute(session ?? undefined, "/parties") ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFabOpen(false);
                      navigate("/parties");
                    }}
                  >
                    <Users size={16} /> Parties
                  </button>
                ) : null}
                {canOpenRoute(session ?? undefined, "/reports") ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFabOpen(false);
                      navigate("/reports");
                    }}
                  >
                    <BarChart3 size={16} /> Reports
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
