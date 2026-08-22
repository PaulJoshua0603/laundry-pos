"use client";

export default function SplashScreen({ fadeOut }: { fadeOut?: boolean }) {
  return (
    <div className={`splash-screen${fadeOut ? " splash-out" : ""}`}>
      <div className="splash-machine">
        <div className="splash-drum">
          <span className="splash-bubble b1">🫧</span>
          <span className="splash-bubble b2">🫧</span>
          <span className="splash-bubble b3">🫧</span>
        </div>
      </div>
      <div className="splash-brand">WashHub</div>
      <div className="splash-sub">POS</div>
    </div>
  );
}
