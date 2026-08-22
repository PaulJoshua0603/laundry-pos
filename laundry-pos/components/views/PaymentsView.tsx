"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import PrinterSettingsCard from "@/components/PrinterSettingsCard";
import CloudBackupCard from "@/components/CloudBackupCard";

function QrCard({ method, label, icon }: { method: "gcash" | "maya"; label: string; icon: string }) {
  const { paySettings, saveGcashMaya, clearPayMethod, showToast } = useApp();
  const info = paySettings[method];
  const [number, setNumber] = useState(info.number);
  const [pendingQr, setPendingQr] = useState<string | null>(null);

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
    <div className="paysettings-card">
      <div className="paysettings-head">
        {icon} {label}
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

  return (
    <div className="sms-template-card">
      <div className="sms-template-label">
        <span className={`pay-badge ${badgeClass}`}>
          {icon} {label}
        </span>
      </div>
      <textarea
        className="field-input sms-template-textarea"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => saveSmsTemplate(which, value)}>
          Save
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetSmsTemplate(which);
            setValue(which === "paid" ? smsTemplates.paid : smsTemplates.unpaid);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function PaymentsView() {
  return (
    <div className="view active" id="view-payments">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Settings</div>
          <div className="section-title">Payment Methods</div>
        </div>
      </div>

      <div className="paysettings-note">
        Upload your GCash and Maya QR codes and account details here. They&apos;ll appear in the cart when a customer pays via GCash or Maya, so your staff can show the code to scan.
      </div>

      <CloudBackupCard />

      <div className="paysettings-grid">
        <QrCard method="gcash" label="GCash" icon="📱" />
        <QrCard method="maya" label="Maya" icon="💜" />
      </div>

      <PrinterSettingsCard />

      <div className="paysettings-note" style={{ marginTop: 24 }}>
        📲 <b>SMS pickup notifications.</b> When you tap &quot;Send SMS&quot; on a Ready order (in the Orders tab), the app automatically uses the <b>Paid</b> template if the order is fully paid, or the <b>Unpaid</b> template if there&apos;s still a balance due — no manual selection needed. It opens your phone&apos;s own Messages app with the text prefilled — no SMS gateway or API key needed. Placeholders: <code>{"{name}"}</code>, <code>{"{orderId}"}</code>, <code>{"{shop}"}</code>, <code>{"{total}"}</code>.
      </div>

      <SmsTemplateCard which="paid" label="Paid orders" badgeClass="pay-badge-paid" icon="✓" />
      <SmsTemplateCard which="unpaid" label="Unpaid orders" badgeClass="pay-badge-unpaid" icon="⏳" />
    </div>
  );
}
