"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  connectUsbPrinter,
  disconnectUsbPrinter,
  isPrinterConnected,
  isUsbConnected,
  isWebUsbSupported,
} from "@/lib/printer";

export default function PrinterSettingsCard() {
  const { session, printerMm, setPrinterWidth, showToast } = useApp();
  const [usbName, setUsbName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
          placedAt: new Date().toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          itemCount: 1,
          lines: [{ label: "Regular Wash (1) x1", price: "P160" }],
          total: "P160",
          paymentLabel: "Cash",
        },
        isUsbConnected() ? "usb" : "bluetooth",
        printerMm
      );
      showToast("🖨️ Test receipt sent to printer", "success");
    } catch (err: any) {
      showToast("❌ " + (err?.message || "Print failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  const anyConnected = usbName;

  return (
    <div className="paysettings-card" style={{ maxWidth: "none" }}>
      <div className="paysettings-head">🖨️ Thermal Printer — PR21 (58mm)</div>

      <div className="paysettings-note" style={{ margin: "10px 0" }}>
        With the <b>POS58 driver installed</b>, Print Receipt goes through Windows over USB — that is the
        correct setup and nothing needs connecting here.
        <br />
        <br />
        For printing with <b>no dialog</b>, add <code>--kiosk-printing</code> to the end of the Target in your
        WashHub shortcut&apos;s Properties, and set POS58 as the Windows default printer. Copies chosen on the
        receipt screen are then printed silently, one after another.
        <br />
        <br />
        The direct USB connection below is only for a machine with <b>no</b> driver installed — Windows gives an
        installed driver exclusive access to the port, so the browser cannot reach the printer at the same time.
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

        {anyConnected && (
          <button className="btn btn-secondary btn-sm" onClick={handleTestPrint} disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Printing…" : "🖨️ Test print"}
          </button>
        )}
      </div>

      <div className="field-group" style={{ marginTop: 14 }}>
        <label className="field-label">Default receipt paper</label>
        <div className="pills">
          <div className={`pill${printerMm === 58 ? " active" : ""}`} onClick={() => setPrinterWidth(58, 210)}>
            57/58mm roll ✓
          </div>
          <div className={`pill${printerMm === 80 ? " active" : ""}`} onClick={() => setPrinterWidth(80)}>
            80mm roll
          </div>
        </div>
        {/* The "48mm (ZPrinter)" option was removed: it produced the same 48mm
            printable width as the 58mm setting, so it only ever caused doubt
            about which one was correct. */}
        <div className="paysettings-note" style={{ marginTop: 8 }}>
          Rolls are sold as <b>width × roll diameter</b>, so a <b>57×50mm</b> roll is 57mm wide with a 50mm
          diameter — continuous paper, not 50mm sheets. That is the <b>57/58mm roll</b> setting. The PR21 prints
          48mm wide whichever of 57mm or 58mm paper you load.
        </div>
      </div>
    </div>
  );
}
