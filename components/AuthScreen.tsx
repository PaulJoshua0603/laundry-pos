"use client";

import { useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-password-wrap">
        <input
          className="field-input"
          type={show ? "text" : "password"}
          id={id}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="reveal-btn"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
        >
          {show ? (
            <svg className="eye-off-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg className="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}

export default function AuthScreen() {
  const { authTab, setAuthTab, authError, setAuthError, login, register } = useApp();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [regName, setRegName] = useState("");
  const [regBusiness, setRegBusiness] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regErrors, setRegErrors] = useState<{ name?: string; email?: string; pass?: string; pass2?: string }>({});

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPass, setForgotPass] = useState("");
  const [forgotPass2, setForgotPass2] = useState("");
  const [forgotErr, setForgotErr] = useState("");
  const [forgotDone, setForgotDone] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  const { forgotPassword, showToast } = useApp();

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    await login({ email: loginEmail, pass: loginPass });
    setLoginBusy(false);
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const errs: typeof regErrors = {};
    if (regName.trim().length < 2) errs.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) errs.email = "Enter a valid email address.";
    if (regPass.length < 8) errs.pass = "At least 8 characters.";
    if (regPass !== regPass2) errs.pass2 = "Passwords don't match.";
    setRegErrors(errs);
    if (Object.keys(errs).length) return;

    setRegBusy(true);
    await register({ name: regName, business: regBusiness, email: regEmail, pass: regPass, pass2: regPass2 });
    setRegBusy(false);
  }

  function openForgot() {
    setForgotEmail(loginEmail || "");
    setForgotErr("");
    setForgotDone(false);
    setForgotOpen(true);
  }

  async function submitForgot() {
    setForgotErr("");
    setForgotBusy(true);
    const res = await forgotPassword({ email: forgotEmail, pass: forgotPass, pass2: forgotPass2 });
    setForgotBusy(false);
    if (!res.ok) {
      setForgotErr(res.msg || "Something went wrong.");
      return;
    }
    setForgotDone(true);
    showToast("Password updated — you can now sign in.", "success");
    setTimeout(() => setForgotOpen(false), 2200);
  }

  return (
    <div className="auth-screen" id="authScreen">
      <div className="auth-bg-glow" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo-dot">
            <Image src="/logo.png" alt="Logo" width={38} height={38} />
          </div>
          <div className="auth-brand-name">
            Wash<em>Hub</em>
          </div>
        </div>
        <div className="auth-tagline">Point of Sale for Laundry Shop</div>

        <button
          type="button"
          className="btn-google-fallback"
          style={{ display: "flex" }}
          onClick={() => setAuthError("Google Sign-In isn't configured for this deployment yet — add a Google OAuth Client ID in lib/googleAuth.ts.")}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
          </svg>
          Continue with Google
        </button>

        <div className="auth-or-divider">
          <span>or</span>
        </div>

        <div className="auth-tabs">
          <div className={`auth-tab${authTab === "login" ? " active" : ""}`} onClick={() => { setAuthTab("login"); setAuthError(""); }}>
            Sign in
          </div>
          <div className={`auth-tab${authTab === "register" ? " active" : ""}`} onClick={() => { setAuthTab("register"); setAuthError(""); }}>
            Create account
          </div>
        </div>

        <div className={`auth-error-banner${authError ? " show" : ""}`}>{authError}</div>

        {authTab === "login" && (
          <form className="auth-form active" onSubmit={submitLogin} noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="loginEmail">
                Email
              </label>
              <input
                className="field-input"
                type="email"
                id="loginEmail"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="field-group">
              <div className="field-label-row">
                <label className="field-label" htmlFor="loginPassword">
                  Password
                </label>
                <button type="button" className="forgot-link" onClick={openForgot}>
                  Forgot password?
                </button>
              </div>
              <PasswordField
                id="loginPassword"
                label=""
                value={loginPass}
                onChange={setLoginPass}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn-auth-submit" disabled={loginBusy}>
              {loginBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {authTab === "register" && (
          <form className="auth-form active" onSubmit={submitRegister} noValidate>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="regName">
                  Full name
                </label>
                <input
                  className="field-input"
                  type="text"
                  id="regName"
                  placeholder="Juan Dela Cruz"
                  autoComplete="name"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
                <div className="field-error">{regErrors.name}</div>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="regBusiness">
                  Shop name <span style={{ color: "var(--text3)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="field-input"
                  type="text"
                  id="regBusiness"
                  placeholder="WashHub Laundry"
                  autoComplete="organization"
                  value={regBusiness}
                  onChange={(e) => setRegBusiness(e.target.value)}
                />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="regEmail">
                Email
              </label>
              <input
                className="field-input"
                type="email"
                id="regEmail"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
              <div className="field-error">{regErrors.email}</div>
            </div>
            <PasswordField
              id="regPassword"
              label="Password"
              value={regPass}
              onChange={setRegPass}
              placeholder="8+ characters"
              autoComplete="new-password"
              error={regErrors.pass}
            />
            <PasswordField
              id="regPassword2"
              label="Confirm password"
              value={regPass2}
              onChange={setRegPass2}
              placeholder="Repeat password"
              autoComplete="new-password"
              error={regErrors.pass2}
            />
            <button type="submit" className="btn-auth-submit" disabled={regBusy}>
              {regBusy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
      </div>

      {forgotOpen && (
        <div className="modal-overlay auth-modal-overlay show" onClick={(e) => e.target === e.currentTarget && setForgotOpen(false)}>
          <div className="modal auth-modal">
            <div className="forgot-header">
              <div className="forgot-icon">🔑</div>
              <div className="forgot-title">Reset Password</div>
              <div className="forgot-sub">Enter your email and a new password.</div>
            </div>
            <div className={`auth-error-banner${forgotErr ? " show" : ""}`}>{forgotErr}</div>
            {forgotDone ? (
              <div className="forgot-success">✅ Password updated! You can now sign in with your new password.</div>
            ) : (
              <div>
                <div className="field-group">
                  <label className="field-label" htmlFor="forgotEmail">
                    Email address
                  </label>
                  <input
                    className="field-input"
                    type="email"
                    id="forgotEmail"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>
                <PasswordField id="forgotNewPass" label="New password" value={forgotPass} onChange={setForgotPass} placeholder="8+ characters" autoComplete="new-password" />
                <PasswordField id="forgotNewPass2" label="Confirm new password" value={forgotPass2} onChange={setForgotPass2} placeholder="Repeat password" autoComplete="new-password" />
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setForgotOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitForgot} disabled={forgotBusy}>
                    {forgotBusy ? "Saving…" : "Reset password"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
