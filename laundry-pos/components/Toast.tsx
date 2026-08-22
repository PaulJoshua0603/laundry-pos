"use client";

import { useApp } from "@/context/AppContext";

export default function Toast() {
  const { toast } = useApp();
  return (
    <div id="toast" className={toast ? `show ${toast.type}`.trim() : ""} key={toast?.key}>
      {toast?.msg}
    </div>
  );
}
