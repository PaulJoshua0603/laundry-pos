"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { buildReceiptEscPos, connectPrinter, disconnectPrinter, isPrinterConnected, isWebBluetoothSupported } from "@/lib/printer";

export default function PrinterSettingsCard() {
  const { session, printerMm, setPrinterWidth, showToast } = useApp();
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && isWebBluetoothSupported();

  async function handleConnect() {
    setBusy(true);
    try {
      const { name } = await connectPrinter();
      setConnectedName(name);
      showToast(`✅ Connected to ${name}`, "success");
    } catch (err: any) {
      if (err?.name !== "NotFoundError") {
        showToast("❌ " + (err?.message || "Couldn't connect to printer."), "error");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    disconnectPrinter();
    setConnectedName(null);
    showToast("Printer disconnected");
  }

  async function handleTestPrint() {
    setBusy(true);
    try {
      if (!isPrinterConnected()) await connectPrinter();
      const { printReceiptToPr21 } = await import("@/lib/printer");
      await printReceiptToPr21({
        shop: session?.business || "WashHub Laundry",
        orderId: "TEST-0001",
        customer: "Test Print",
        type: "Walk-in",
        status: "Washing",
        time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
        lines: [{ label: "Regular Wash (1) x1", price: "P160" }],
        total: "P160",
        paymentLabel: "Cash",
      });
      showToast("🖨️ Test receipt sent to printer", "success");
    } catch (err: any) {
      showToast("❌ " + (err?.message || "Print failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paysettings-card" style={{ maxWidth: "none" }}>
      <div className="paysettings-head">🖨️ Thermal Printer — PR21 (58mm)</div>
      <div className="paysettings-note" style={{ margin: "10px 0" }}>
        {supported ? (
          <>
            Pair your PR21 once here over Bluetooth, then every receipt can print directly from the Orders/checkout screen
            with no PDF step. Works on <b>Android Chrome</b> and <b>desktop Chrome/Edge</b>. Safari on iPhone/iPad doesn&apos;t
            support Web Bluetooth — use &quot;Save PDF&quot; or &quot;Share to PR21 app&quot; on the receipt instead.
          </>
        ) : (
          <>
            This browser doesn&apos;t support Web Bluetooth (common on iPhone/iPad Safari). Use the <b>Save PDF</b> or{" "}
            <b>Share to PR21 app</b> buttons on the receipt screen to print from your PR21&apos;s companion app instead.
          </>
        )}
      </div>

      {supported && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!connectedName ? (
            <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={busy}>
              {busy ? "Connecting…" : "🔗 Pair PR21 printer"}
            </button>
          ) : (
            <>
              <span className="pay-badge pay-badge-paid">✓ Connected · {connectedName}</span>
              <button className="btn btn-ghost btn-sm" onClick={handleTestPrint} disabled={busy}>
                {busy ? "Printing…" : "🖨️ Test print"}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={handleDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      )}

      <div className="field-group" style={{ marginTop: 14 }}>
        <label className="field-label">Default receipt paper width</label>
        <div className="pills">
          <div className={`pill${printerMm === 58 ? " active" : ""}`} onClick={() => setPrinterWidth(58, 210)}>
            58mm (PR21)
          </div>
          <div className={`pill${printerMm === 80 ? " active" : ""}`} onClick={() => setPrinterWidth(80)}>
            80mm
          </div>
          <div className={`pill${printerMm === 48 ? " active" : ""}`} onClick={() => setPrinterWidth(48, 210)}>
            48mm (ZPrinter)
          </div>
        </div>
      </div>
    </div>
  );
}
