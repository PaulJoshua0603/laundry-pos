"use client";

import { useState } from "react";
import PrinterSettingsCard from "@/components/PrinterSettingsCard";
import CloudBackupCard from "@/components/CloudBackupCard";
import DataToolsPanel from "@/components/views/RawDataView";

/* ══════════════════════════════════════════════════════════════════
   TOOLS

   The GCash/Maya QR cards and the SMS template editor were removed at
   the owner's request — the shop doesn't use either. That also drops
   the QR file-reader and the template editors from the bundle, which
   matters on the 2-core till.

   Cloud Backup moved into Data, where it belongs alongside the other
   backup and recovery tools.
   ══════════════════════════════════════════════════════════════════ */

type Tab = "printer" | "data";

const TABS: { id: Tab; icon: string; label: string; hint: string }[] = [
  { id: "printer", icon: "🖨️", label: "Printer", hint: "Thermal printer connection and paper size" },
  { id: "data", icon: "🗂️", label: "Data", hint: "Cloud backup, recovery and raw records" },
];

export default function ToolsView() {
  const [tab, setTab] = useState<Tab>("printer");
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

      {tab === "printer" && <PrinterSettingsCard />}

      {tab === "data" && (
        <>
          <CloudBackupCard />
          <DataToolsPanel />
        </>
      )}
    </div>
  );
}
