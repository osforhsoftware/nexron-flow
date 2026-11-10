import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BrandLogo } from "../components/BrandLogo";
import { useApp } from "../lib/AppContext";
import { ROLE_LABELS, type AppRole } from "../lib/roles";

const DEMO_USERS: Array<{ username: string; role: AppRole }> = [
  { username: "admin", role: "admin" },
  { username: "office1", role: "office" },
  { username: "field1", role: "field" },
  { username: "store1", role: "store" },
  { username: "accounts1", role: "accounts" },
];

export function LoginPage() {
  const { login, session, ready, apiOnline } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("demo@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!ready) {
    return (
      <div className="auth-screen" style={{ gridTemplateColumns: "1fr" }}>
        <div className="auth-panel">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <BrandLogo size={56} showWordmark wordmarkSize="md" />
            <p className="tagline" style={{ marginTop: 12 }}>
              Connecting to PHP API…
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate("/companies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-hero">
        <div className="auth-hero-brand">
          <BrandLogo size={56} showWordmark wordmarkSize="md" />
          <h1>
            NEXRON
            <span> Flow</span>
          </h1>
          <p>Sign in to manage parties, items, sales &amp; purchases.</p>
        </div>
        <div className="auth-hero-logo-glow" aria-hidden>
          <img src="/nexron-logo.png" alt="" />
        </div>
      </section>

      <section className="auth-panel">
        <motion.form
          className="auth-card"
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h2>Login to NEXRON Flow</h2>
          <p className="tagline">
            {apiOnline
              ? "Use a demo account (password demo@123)"
              : "PHP API offline — start Apache + MySQL in XAMPP"}
          </p>

          {!apiOnline ? (
            <p className="muted" style={{ color: "#b45309" }}>
              Backend path: <code>C:\xampp\htdocs\mems-backend</code>
              <br />
              1) XAMPP → Start <strong>Apache</strong> + <strong>MySQL</strong>
              <br />
              2) Test: <code>http://127.0.0.1/mems-backend/api/health</code>
              <br />
              3) Restart Vite (<code>npm run dev</code>) then refresh this page
            </p>
          ) : null}

          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label className="field">
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
          </div>

          {error ? <p style={{ color: "#b91c1c", marginTop: 8 }}>{error}</p> : null}

          <div className="auth-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !apiOnline}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ marginBottom: 8 }}>
              Quick fill demo users
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setUsername(u.username);
                    setPassword("demo@123");
                  }}
                >
                  {u.username} · {ROLE_LABELS[u.role]}
                </button>
              ))}
            </div>
          </div>
        </motion.form>
      </section>
    </div>
  );
}
