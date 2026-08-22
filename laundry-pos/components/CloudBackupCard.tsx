"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";

export default function CloudBackupCard() {
  const { cloudConfigured, cloudActive, legacyMatches, importLegacyAccount, orders, session } = useApp();
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleImport(localUserId: string) {
    setImportingId(localUserId);
    await importLegacyAccount(localUserId);
    setImportingId(null);
  }

  return (
    <div className="paysettings-card" style={{ maxWidth: "none" }}>
      <div className="paysettings-head">☁️ Cloud Backup</div>

      {!cloudConfigured && (
        <div className="paysettings-note" style={{ margin: "10px 0" }}>
          Not set up yet. Right now your orders and settings only live on this device&apos;s browser storage — if it
          gets cleared, or you switch computers, that data is gone for good. Connect a free Supabase project to back
          everything up automatically: create a project at{" "}
          <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
            supabase.com
          </a>
          , run <code>supabase/schema.sql</code> in its SQL Editor, then add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your <code>.env.local</code> (and to Netlify&apos;s
          environment variables) and redeploy.
        </div>
      )}

      {cloudConfigured && cloudActive && (
        <div className="cloud-status-row">
          <span className="pay-badge pay-badge-paid">✓ Synced to cloud</span>
          <span className="cloud-status-note">
            {orders.length} order{orders.length !== 1 ? "s" : ""} backed up · signed in as {session?.email}
          </span>
        </div>
      )}

      {cloudConfigured && !cloudActive && (
        <div className="paysettings-note" style={{ margin: "10px 0" }}>
          Cloud backup is set up, but you&apos;re currently signed in to a local-only account on this device. Sign
          out and create/sign in with a cloud account (same email works) to start backing up automatically.
        </div>
      )}

      {legacyMatches.length > 0 && (
        <div className="cloud-legacy-block">
          <div className="cloud-legacy-title">📦 Found local data on this device not yet in the cloud</div>
          {legacyMatches.map((m) => (
            <div className="cloud-legacy-row" key={m.localUserId}>
              <div>
                <div className="cloud-legacy-name">{m.name}</div>
                <div className="cloud-legacy-sub">
                  {m.orderCount} order{m.orderCount !== 1 ? "s" : ""} · {m.business}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleImport(m.localUserId)}
                disabled={importingId === m.localUserId}
              >
                {importingId === m.localUserId ? "Importing…" : "Import to cloud"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
