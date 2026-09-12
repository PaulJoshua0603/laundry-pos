"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import PrinterSettingsCard from "@/components/PrinterSettingsCard";
import CloudBackupCard from "@/components/CloudBackupCard";
import DataToolsPanel from "@/components/views/RawDataView";

/* ══════════════════════════════════════════════════════════════════
   TOOLS

   "Payment Methods" and "All Data (Reference)" were two separate nav
   entries that between them held every setting and maintenance screen
   in the app — neither name told you what was inside, and the sidebar
   spent two slots on things used a few times a month. They are one
   entry now, split into tabs so each panel stays short.
   ══════════════════════════════════════════════════════════════════ */

type Tab = "payments" | "printer" | "sms" | "data";

const TABS: { id: Tab; icon: string; label: string; hint: string }[] = [
  { id: "payments", icon: "💳", label: "Payments", hint: "QR codes, account numbers and cloud backup" },
  { id: "printer", icon: "🖨️", label: "Printer", hint: "Thermal printer connection and paper size" },
  { id: "sms", icon: "📲", label: "Messages", hint: "Pickup SMS templates" },
  { id: "data", icon: "🗂️", label: "Data", hint: "Backups, recovery and raw records" },
];

function QrCard({ method, label, icon }: { method: "gcash" | "maya"; label: string; icon: string }) {
  const { paySettings, saveGcashMaya, clearPayMethod, showToast } = useApp();
  const info = paySettings[method];
  const [number, setNumber] = useState(info.number);
  const [pendingQr, setPendingQr] = useState<string | null>(null);

  // Settings arrive asynchronously (cloud load at boot, or an import), so the
  // field has to follow them rather than being seeded once on mount.
  useEffect(() => {
    setNumber(info.number);
  }, [info.number]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingQr(reader.result as string);
      showToast(`${label} QR ready — tap Save to keep it`);
    };
    reader.readAsDataURL(file);
  }

  function save() {
    saveGcashMaya(method, number.trim(), pendingQr !== null ? pendingQr : undefined);
    setPendingQr(null);
  }

  function remove() {
    if (!window.confirm(`Remove the saved ${label} QR and number?`)) return;
    clearPayMethod(method);
    setNumber("");
    setPendingQr(null);
  }

  const qrToShow = pendingQr !== null ? pendingQr : info.qr;

  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <span className="tool-card-icon">{icon}</span>
        <div>
          <div className="tool-card-title">{label}</div>
          <div className="tool-card-sub">Shown at checkout when {label} is selected</div>
        </div>
        {(info.qr || info.number) && <span className="tool-badge ok">Set up</span>}
      </div>

      <div className="paysettings-qr-wrap">
        {qrToShow ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="paysettings-qr-img" src={qrToShow} alt={`${label} QR code`} />
        ) : (
          <div className="paysettings-qr-empty">No QR uploaded yet</div>
        )}
      </div>
      <label className="btn btn-ghost btn-sm paysettings-upload-btn">
        📤 Upload QR image
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
      </label>
      <div className="field-group">
        <label className="field-label">Account name / number</label>
        <input
          className="field-input"
          type="text"
          placeholder={`Your Name · Your ${label} Number`}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={save}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={remove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function SmsTemplateCard({ which, label, badgeClass, icon }: { which: "paid" | "unpaid"; label: string; badgeClass: string; icon: string }) {
  const { smsTemplates, saveSmsTemplate, resetSmsTemplate } = useApp();
  const [value, setValue] = useState(smsTemplates[which]);

  // Mirrors context on the cloud load and after Reset — reading it back in the
  // same render used to show the pre-reset text.
  useEffect(() => {
    setValue(smsTemplates[which]);
  }, [smsTemplates, which]);

  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <span className={`pay-badge ${badgeClass}`}>
          {icon} {label}
        </span>
      </div>
      <textarea
        className="field-input sms-template-textarea"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => saveSmsTemplate(which, value)}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => resetSmsTemplate(which)}>
          Reset
        </button>
      </div>
    </div>
  );
}

export default function ToolsView() {
  const [tab, setTab] = useState<Tab>("payments");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="view active" id="view-tools">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Settings &amp; maintenance</div>
          <div className="section-title">Tools</div>
        </div>
      </div>

      <div className="tool-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tool-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="tool-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tool-tab-hint">{active.hint}</div>

      {tab === "payments" && (
        <>
          <CloudBackupCard />
          <div className="tool-grid">
            <QrCard method="gcash" label="GCash" icon="📱" />
            <QrCard method="maya" label="Maya" icon="💜" />
          </div>
        </>
      )}

      {tab === "printer" && <PrinterSettingsCard />}

      {tab === "sms" && (
        <>
          <div className="tool-note">
            When you tap <b>Send SMS</b> on a Ready order, the app picks the <b>Paid</b> template if the order is
            settled and the <b>Unpaid</b> one if a balance remains — no manual choice needed. It opens your phone&apos;s
            Messages app with the text prefilled, so there is no SMS gateway or API key to set up. Placeholders:{" "}
            <code>{"{name}"}</code>, <code>{"{orderId}"}</code>, <code>{"{shop}"}</code>, <code>{"{total}"}</code>.
          </div>
          <div className="tool-grid">
            <SmsTemplateCard which="paid" label="Paid orders" badgeClass="pay-badge-paid" icon="✓" />
            <SmsTemplateCard which="unpaid" label="Unpaid orders" badgeClass="pay-badge-unpaid" icon="⏳" />
          </div>
        </>
      )}

      {tab === "data" && <DataToolsPanel />}
    </div>
  );
}
