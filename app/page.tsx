"use client";

import { useApp } from "@/context/AppContext";
import AuthScreen from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";
import ReceiptModal from "@/components/ReceiptModal";
import Toast from "@/components/Toast";

export default function Home() {
  const { booted, loggedIn } = useApp();

  if (!booted) return null;

  return (
    <>
      {!loggedIn && <AuthScreen />}
      {loggedIn && <AppShell />}
      <ReceiptModal />
      <Toast />
    </>
  );
}
