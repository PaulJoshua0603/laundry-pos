"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { peso } from "@/lib/format";
import { findAllLegacyAccounts, LegacyAccountMatch } from "@/lib/migrateLocalData";

interface RawRow {
  storageKey: string;
  id: string;
  name: string;
  total: number;
  time: string;
  status: string;
  isDup: boolean;
}

export default function RawDataView() {
  const { session, cloudActive, importLegacyAccount, importPastedOrders, showToast } = useApp();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [scannedAt, setScannedAt] = useState<string>("");
  const [legacyAccounts, setLegacyAccounts] = useState<LegacyAccountMatch[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  function scan() {
    const collected: RawRow[] = [];
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("sudsup_orders_"));
      keys.forEach((key) => {
        const orders = JSON.parse(localStorage.getItem(key) || "[]");
        const idCount: Record<string, number> = {};
        orders.forEach((o: any) => {
          idCount[o.id] = (idCount[o.id] || 0) + 1;
        });
        orders.forEach((o: any) => {
          collected.push({
            storageKey: key,
            id: o.id,
            name: o.name || "—",
            total: o.total || 0,
            time: o.time || "",
            status: o.status || "",
            isDup: idCount[o.id] > 1,
          });
        });
      });
    } catch {
      /* ignore */
    }
    collected.sort((a, b) => (a.time < b.time ? 1 : -1));
    setRows(collected);
    setScannedAt(new Date().toLocaleString());
    try {
      setLegacyAccounts(findAllLegacyAccounts().filter((a) => a.orderCount > 0));
    } catch {
      setLegacyAccounts([]);
    }
  }

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync(localUserId: string) {
    if (!cloudActive || !session) {
      showToast("Log in with your cloud account first, then sync.", "error");
      return;
    }
    setSyncing(localUserId);
    try {
      await importLegacyAccount(localUserId);
      scan();
    } finally {
      setSyncing(null);
    }
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) return;
    setPasteBusy(true);
    try {
      const res = await importPastedOrders(pasteText.trim());
      showToast(res.msg, res.ok ? "success" : "error");
      if (res.ok) {
        setPasteText("");
        scan();
      }
    } finally {
      setPasteBusy(false);
    }
  }

  const dupCount = rows.filter((r) => r.isDup).length;

  return (
    <div className="view active" id="view-rawdata">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>All Local Data (Reference)</h2>
          <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
            Raw scan of every order saved in this browser's storage — includes duplicates. Last scanned: {scannedAt || "—"}
          </p>
        </div>
        <button className="btn" onClick={scan}>
          🔄 Rescan
        </button>
      </div>

      {legacyAccounts.length > 0 && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sync a local account into the cloud</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
            Every order on this device stays and gets a unique id — nothing is dropped or overwritten, even if IDs collided before.
          </div>
          {legacyAccounts.map((a) => (
            <div key={a.localUserId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 13 }}>
                <strong>{a.name}</strong> ({a.email}) — {a.orderCount} order{a.orderCount !== 1 ? "s" : ""} on this device
              </div>
              <button className="btn btn-primary btn-sm" disabled={syncing === a.localUserId} onClick={() => handleSync(a.localUserId)}>
                {syncing === a.localUserId ? "Syncing…" : "☁️ Sync to Cloud"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Import from another site/device (paste JSON)</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          If your orders live in a different domain's browser storage (e.g. an old Netlify deploy), open that site, press F12 → Console, run:
          <br />
          <code style={{ fontSize: 11, background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
            copy(localStorage.getItem(Object.keys(localStorage).find(k=&gt;k.startsWith(&quot;sudsup_orders_&quot;))))
          </code>
          <br />
          This copies the orders to your clipboard. Paste them below, then Import — every order is preserved, no duplicates get overwritten.
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder='Paste the copied JSON array here, e.g. [{"id":"ORD-0001", ...}, ...]'
          rows={4}
          style={{ width: "100%", borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "monospace", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)", color: "inherit", resize: "vertical" }}
        />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={pasteBusy || !pasteText.trim()} onClick={handlePasteImport}>
          {pasteBusy ? "Importing…" : "☁️ Import Pasted Orders"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(59,130,246,0.15)" }}>
          Total rows: <strong>{rows.length}</strong>
        </div>
        <div style={{ padding: "8px 14px", borderRadius: 8, background: dupCount > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)" }}>
          Duplicate ID rows: <strong>{dupCount}</strong>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Order ID</th>
              <th style={th}>Customer</th>
              <th style={th}>Total</th>
              <th style={th}>Status</th>
              <th style={th}>Time</th>
              <th style={th}>Storage Key</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: r.isDup ? "rgba(239,68,68,0.12)" : "transparent" }}>
                <td style={td}>{i + 1}</td>
                <td style={td}>{r.id}</td>
                <td style={td}>{r.name}</td>
                <td style={td}>{peso(r.total)}</td>
                <td style={td}>{r.status}</td>
                <td style={td}>{r.time ? new Date(r.time).toLocaleString() : "—"}</td>
                <td style={{ ...td, opacity: 0.6, fontSize: 11 }}>{r.storageKey}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={7}>
                  No local order data found in this browser.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.15)",
  position: "sticky",
  top: 0,
};
const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
