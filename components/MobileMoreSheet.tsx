"use client";

import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS } from "@/lib/types";
import { initialsOf } from "@/lib/format";

export default function MobileMoreSheet({
  open,
  onClose,
  onNav,
}: {
  open: boolean;
  onClose: () => void;
  onNav: (target: ViewId) => void;
}) {
  const { session, toggleTheme, logout } = useApp();
  if (!open) return null;

  return (
    <div className="mobile-more-overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mobile-more-sheet">
        <div className="mobile-more-account">
          <div className="topbar-avatar">{session ? initialsOf(session.name) : "U"}</div>
          <div>
            <div className="mobile-more-account-name">{session?.name || "—"}</div>
            <div className="mobile-more-account-biz">{session?.business || ""}</div>
          </div>
        </div>
        <div
          className="mobile-more-item"
          onClick={() => {
            toggleTheme();
            onClose();
          }}
        >
          <span className="nav-icon">🌓</span> Toggle theme
        </div>
        <div
          className="mobile-more-item"
          onClick={() => {
            onNav("sales");
            onClose();
          }}
        >
          <span className="nav-icon">📈</span> Sales Tracking
        </div>
        <div
          className="mobile-more-item"
          onClick={() => {
            onNav("payments");
            onClose();
          }}
        >
          <span className="nav-icon">💳</span> Payment Methods
        </div>
        <div className="mobile-more-item danger" onClick={logout}>
          <span className="nav-icon">🚪</span> Sign out
        </div>
        <div className="mobile-more-hours">🕐 {BUSINESS_HOURS.label}</div>
        <div className="mobile-more-cancel" onClick={onClose}>
          Cancel
        </div>
      </div>
    </div>
  );
}
