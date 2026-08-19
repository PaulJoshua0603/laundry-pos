"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  connectPrinter,
  connectUsbPrinter,
  disconnectPrinter,
  disconnectUsbPrinter,
  isPrinterConnected,
  isUsbConnected,
  isWebBluetoothSupported,
  isWebUsbSupported,
} from "@/lib/printer";

export default function PrinterSettingsCard() {
  const { session, printerMm, setPrinterWidth, showToast } = useApp();
  const [btName, setBtName] = useState<string | null>(null);
  const [usbName, setUsbName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const btSupported = typeof window !== "undefined" && isWebBluetoothSupported();
  const usbSupported = typeof window !== "undefined" && isWebUsbSupported();

  async function handleConnectUsb() {
    setBusy(true);
    try {
      const { name } = await connectUsbPrinter();
      setUsbName(name);
      showToast(`✅ Connected to ${name} via USB`, "success");
    } catch (err: any) {
      if (err?.name !== "NotFoundError") showToast("❌ " + (err?.message || "Couldn't connect via USB."), "error");
    } finally {
      setBusy(false);
    }
  }
  function handleDisconnectUsb() {
    disconnectUsbPrinter();
    setUsbName(null);
    showToast("USB printer disconnected");
  }

  async function handleConnectBt() {
    setBusy(true);
    try {
      const { name } = await connectPrinter();
      setBtName(name);
      showToast(`✅ Connected to ${name}`, "success");
    } catch (err: any) {
      if (err?.name !== "NotFoundError") showToast("❌ " + (err?.message || "Couldn't connect to printer."), "error");
    } finally {
      setBusy(false);
    }
  }
  function handleDisconnectBt() {
    disconnectPrinter();
    setBtName(null);
    showToast("Printer disconnected");
  }

  async function handleTestPrint() {
    setBusy(true);
    try {
      const { printReceiptToPr21 } = await import("@/lib/printer");
      await printReceiptToPr21(
        {
          shop: session?.business || "WashHub Laundry",
          orderId: "TEST-0001",
          customer: "Test Print",
          type: "Walk-in",
          status: "Washing",
          time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
          lines: [{ label: "Regular Wash (1) x1", price: "P160" }],
          total: "P160",
          paymentLabel: "Cash",
        },
        isUsbConnected() ? "usb" : "bluetooth"
      );
      showToast("🖨️ Test receipt sent to printer", "success");
    } catch (err: any) {
      showToast("❌ " + (err?.message || "Print failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  const anyConnected = usbName || btName;

  return (
    <div className="paysettings-card" style={{ maxWidth: "none" }}>
      <div className="paysettings-head">🖨️ Thermal Printer — PR21 (58mm)</div>

      <div className="paysettings-note" style={{ margin: "10px 0" }}>
        <b>USB (recommended)</b> — plug the PR21 into this laptop with its USB cable, then pair it once below. Works
        in Chrome/Edge on Windows, Mac, Linux, and Android. <b>Bluetooth</b> is also available as a cable-free
        backup. Safari on iPhone/iPad supports neither — use <b>Save PDF</b> or <b>Share to PR21 app</b> on the
        receipt instead.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", minWidth: 70 }}>🔌 USB</span>
          {!usbName ? (
            usbSupported ? (
              <button className="btn btn-primary btn-sm" onClick={handleConnectUsb} disabled={busy}>
                {busy ? "Connecting…" : "Connect via USB"}
              </button>
            ) : (
              <span className="pay-badge pay-badge-unpaid">Not supported in this browser</span>
            )
          ) : (
            <>
              <span className="pay-badge pay-badge-paid">✓ Connected · {usbName}</span>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={handleDisconnectUsb}>
                Disconnect
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", minWidth: 70 }}>📶 Bluetooth</span>
          {!btName ? (
            btSupported ? (
              <button className="btn btn-ghost btn-sm" onClick={handleConnectBt} disabled={busy}>
                {busy ? "Connecting…" : "Pair via Bluetooth"}
              </button>
            ) : (
              <span className="pay-badge pay-badge-unpaid">Not supported in this browser</span>
            )
          ) : (
            <>
              <span className="pay-badge pay-badge-paid">✓ Connected · {btName}</span>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={handleDisconnectBt}>
                Disconnect
              </button>
            </>
          )}
        </div>

        {anyConnected && (
          <button className="btn btn-secondary btn-sm" onClick={handleTestPrint} disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Printing…" : "🖨️ Test print"}
          </button>
        )}
      </div>

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
