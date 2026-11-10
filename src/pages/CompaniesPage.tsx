import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import {
  COMPANY_CURRENCIES,
  COMPANY_ORIGINS,
  defaultCurrencyForCountry,
  originOf,
  type CompanyCountry,
  type CompanyCurrency,
} from "../lib/companyLocale";

export function CompaniesPage() {
  const { companies, company, switchCompany, refreshCompanies, canAccess } = useApp();
  const navigate = useNavigate();
  const { data: counts } = useAsync(async () => {
    const map: Record<string, { parties: number; items: number; txns: number }> = {};
    await Promise.all(
      companies.map(async (c) => {
        const [parties, items, txns] = await Promise.all([
          api.parties.list(c.id),
          api.items.list(c.id),
          api.transactions.list(c.id),
        ]);
        map[c.id] = {
          parties: parties.parties.length,
          items: items.items.length,
          txns: txns.transactions.length,
        };
      }),
    );
    return map;
  }, [companies]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CompanyCountry>("AE");
  const [currency, setCurrency] = useState<CompanyCurrency>("AED");
  const [error, setError] = useState("");

  function resetForm() {
    setName("");
    setPhone("");
    setCountry("AE");
    setCurrency("AED");
    setError("");
  }

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { company: created } = await api.companies.create({
        name: name.trim(),
        phone: phone.trim(),
        country,
        currency,
      });
      await api.payments.createAccount({
        companyId: created.id,
        name: "Cash",
        kind: "cash",
        openingBalance: 0,
      });
      await api.payments.createAccount({
        companyId: created.id,
        name: "Bank",
        kind: "bank",
        openingBalance: 0,
      });
      await refreshCompanies();
      await switchCompany(created.id);
      setOpen(false);
      resetForm();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Switch Company</h1>
          <p className="muted">Select a company to open its books</p>
        </div>
        <div className="topbar-actions">
          {canAccess("companies") ? (
            <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
              <Plus size={14} /> Add Company
            </button>
          ) : null}
        </div>
      </header>

      <div className="content">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {companies.map((c, i) => {
            const origin = originOf(c.country);
            return (
              <motion.button
                key={c.id}
                type="button"
                className="panel panel-pad"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={async () => {
                  await switchCompany(c.id);
                  navigate("/");
                }}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: company?.id === c.id ? "var(--vy-teal)" : undefined,
                  outline: company?.id === c.id ? "2px solid rgba(0,184,169,0.28)" : undefined,
                }}
              >
                <div style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "var(--vy-teal-soft)",
                      color: "var(--vy-teal-dark)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Building2 size={18} />
                  </div>
                  <div>
                    <strong style={{ display: "block" }}>{c.name}</strong>
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {c.phone}
                    </span>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: "0.85rem", fontSize: "0.85rem" }}>
                  {origin.label} · {c.currency || origin.currency}
                </p>
                <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                  {counts?.[c.id]?.parties ?? 0} parties · {counts?.[c.id]?.items ?? 0} items ·{" "}
                  {counts?.[c.id]?.txns ?? 0} vouchers
                </p>
                {company?.id === c.id ? (
                  <span className="badge badge-ok" style={{ marginTop: "0.7rem" }}>
                    Current
                  </span>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      </div>

      {open ? (
        <Modal
          title="Create company"
          onClose={() => {
            setOpen(false);
            resetForm();
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="new-company">
                Create & open
              </button>
            </>
          }
        >
          <form id="new-company" className="form-grid" onSubmit={createCompany}>
            <label className="field full">
              Company name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field full">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label className="field">
              Company origin
              <select
                value={country}
                onChange={(e) => {
                  const next = e.target.value as CompanyCountry;
                  setCountry(next);
                  setCurrency(defaultCurrencyForCountry(next));
                }}
              >
                {COMPANY_ORIGINS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CompanyCurrency)}
              >
                {COMPANY_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
