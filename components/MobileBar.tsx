"use client";

import { useApp, ViewId } from "@/context/AppContext";

export default function MobileBar({
  mobileCartOpen,
  onNav,
  onToggleMore,
}: {
  mobileCartOpen: boolean;
  onNav: (target: ViewId | "cart") => void;
  onToggleMore: () => void;
}) {
  const { activeView, cart } = useApp();
  const cartCount = cart.reduce((n, c) => n + c.qty, 0);

  const active = (t: string) => (mobileCartOpen ? t === "cart" : activeView === t);

  return (
    <div className="mobile-bar" id="mobileBar">
      <button className={`mobile-nav-btn${active("pos") ? " active" : ""}`} onClick={() => onNav("pos")}>
        <span className="mobile-nav-icon">🛒</span>
        Order
      </button>
      <button className={`mobile-nav-btn${active("cart") ? " active" : ""}`} onClick={() => onNav("cart")}>
        <span className="mobile-cart-bubble">
          <span className="mobile-nav-icon">🧺</span>
          {cartCount > 0 && <span className="mobile-cart-num">{cartCount}</span>}
        </span>
        Cart
      </button>
      <button className={`mobile-nav-btn${active("orders") ? " active" : ""}`} onClick={() => onNav("orders")}>
        <span className="mobile-nav-icon">📋</span>
        Orders
      </button>
      <button className={`mobile-nav-btn${active("summary") ? " active" : ""}`} onClick={() => onNav("summary")}>
        <span className="mobile-nav-icon">📊</span>
        Summary
      </button>
      <button className="mobile-nav-btn" onClick={onToggleMore}>
        <span className="mobile-nav-icon">☰</span>
        More
      </button>
    </div>
  );
}
