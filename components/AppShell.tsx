"use client";

import { useState } from "react";
import { useApp, ViewId } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import CartPanel from "@/components/CartPanel";
import MobileBar from "@/components/MobileBar";
import MobileMoreSheet from "@/components/MobileMoreSheet";
import PosView from "@/components/views/PosView";
import OrdersView from "@/components/views/OrdersView";
import DailyOrdersView from "@/components/views/DailyOrdersView";
import SummaryView from "@/components/views/SummaryView";
import SalesView from "@/components/views/SalesView";
import PaymentsView from "@/components/views/PaymentsView";

export default function AppShell() {
  const { activeView, switchView } = useApp();
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  function handleMobileNav(target: ViewId | "cart") {
    if (target === "cart") {
      setMobileCartOpen((v) => !v);
      switchView("pos");
    } else {
      setMobileCartOpen(false);
      switchView(target);
    }
  }

  return (
    <>
      <div className="shell active" id="shell">
        <Topbar />
        <Sidebar />

        <main className="main" id="mainArea">
          {activeView === "pos" && <PosView />}
          {activeView === "orders" && <OrdersView />}
          {activeView === "daily" && <DailyOrdersView />}
          {activeView === "summary" && <SummaryView />}
          {activeView === "sales" && <SalesView />}
          {activeView === "payments" && <PaymentsView />}
        </main>

        <CartPanel mobileOpen={mobileCartOpen} onCartClose={() => setMobileCartOpen(false)} />
      </div>

      <MobileBar mobileCartOpen={mobileCartOpen} onNav={handleMobileNav} onToggleMore={() => setMoreOpen((v) => !v)} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNav={(v) => switchView(v)} />
    </>
  );
}
