import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  FileText,
  Home,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShoppingCart,
  Settings,
  Store,
  Wrench,
  Users,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { useApp } from "../lib/AppContext";
import { canOpenRoute, ROLE_LABELS } from "../lib/roles";

const SIDEBAR_KEY = "ledgerly.sidebar.collapsed";

type NavChild = { label: string; to: string; create?: boolean };

const navGroups: Array<{
  label: string;
  icon: typeof Home;
  to: string;
  children?: NavChild[];
}> = [
  { label: "Home", icon: Home, to: "/" },
  { label: "Parties", icon: Users, to: "/parties" },
  { label: "Items", icon: Package, to: "/items" },
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
    label: "Purchase & Expense",
    icon: Store,
    to: "/purchases",
    children: [
      { label: "Purchase Bills", to: "/purchases", create: true },
      { label: "Purchase Order", to: "/purchases/orders", create: true },
      { label: "Payment-Out", to: "/payments?create=1" },
    ],
  },
  { label: "Cash & Bank", icon: Wallet, to: "/payments" },
  { label: "Reports", icon: BarChart3, to: "/reports" },
  { label: "Sync, Share & Backup", icon: CloudCog, to: "/backup" },
  { label: "Utilities", icon: Wrench, to: "/utilities" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

export function AppLayout() {
  const { company, logout, session, canAccess } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const createMode = new URLSearchParams(location.search).get("create") === "1";
  const [expanded, setExpanded] = useState<string[]>(["Sale"]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const visibleNav = navGroups.filter((item) => canOpenRoute(session?.modules, item.to));
  const showSaleQuick = canAccess("sales");
  const showPurchaseQuick = canAccess("purchases");

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

  return (
    <div className="app-shell">
      <div className={`shell-body${collapsed ? " sidebar-collapsed" : ""}`}>
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
            <div className="command-search">
              <Search size={15} />
              {!collapsed ? <span>Open Anything (Ctrl+F)</span> : null}
            </div>
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

          <div className="nav-scroll">
            {visibleNav.map(({ to, label, icon: Icon, children }) => {
              const isOpen = !collapsed && expanded.includes(label);
              return (
                <div className="nav-group" key={label}>
                  <div className="nav-main-row">
                    <NavLink
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                      title={label}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </NavLink>
                    {children && !collapsed ? (
                      <button className="nav-expand" type="button" onClick={() => toggle(label)}>
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    ) : null}
                  </div>
                  {children && isOpen ? (
                    <div className="nav-children">
                      {children.map((child) => {
                        const createTo = child.create
                          ? child.to.includes("?")
                            ? `${child.to}&create=1`
                            : `${child.to}?create=1`
                          : child.to;
                        return (
                          <div className="nav-child-row" key={child.to + child.label}>
                            <Link to={child.to}>{child.label}</Link>
                            <button
                              type="button"
                              className="nav-child-add"
                              title={`Add ${child.label}`}
                              aria-label={`Add ${child.label}`}
                              onClick={() => navigate(createTo)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="sidebar-footer">
            <button
              className="sidebar-signout"
              type="button"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={15} />
              Sign out
              {session?.name
                ? ` · ${session.name.split(" ")[0]}${session.role ? ` (${ROLE_LABELS[session.role]})` : ""}`
                : ""}
            </button>
          </div>
        </aside>

        <div className={`main-area${createMode ? " create-mode" : ""}`}>
          {!createMode ? (
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
                <button type="button" className="business-name" onClick={() => navigate("/settings")}>
                  <span /> {company?.name || "Enter Business Name"}
                </button>
              </div>
              <div className="business-actions">
                {showSaleQuick ? (
                  <button className="quick-sale" type="button" onClick={() => navigate("/sales?create=1")}>
                    <Plus size={14} /> Add Sale
                  </button>
                ) : null}
                {showPurchaseQuick ? (
                  <button className="quick-purchase" type="button" onClick={() => navigate("/purchases?create=1")}>
                    <Plus size={14} /> Add Purchase
                  </button>
                ) : null}
                {canAccess("utilities") ? (
                  <button className="quick-more" type="button" onClick={() => navigate("/utilities")}>
                    <CircleDollarSign size={14} /> Add More
                  </button>
                ) : null}
                <FileText size={16} />
              </div>
            </div>
          ) : null}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
