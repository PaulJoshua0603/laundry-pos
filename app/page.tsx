"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import AuthScreen from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";
import ReceiptModal from "@/components/ReceiptModal";
import Toast from "@/components/Toast";
import SplashScreen from "@/components/SplashScreen";

const MIN_SPLASH_MS = 1100;
const FADE_MS = 450;

export default function Home() {
  const { booted, loggedIn } = useApp();
  const [showSplash, setShowSplash] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!booted) return;
    const fadeTimer = setTimeout(() => setFadeOut(true), MIN_SPLASH_MS);
    const removeTimer = setTimeout(() => setShowSplash(false), MIN_SPLASH_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [booted]);

  if (!booted) return <SplashScreen />;

  return (
    <>
      {showSplash && <SplashScreen fadeOut={fadeOut} />}
      {!loggedIn && <AuthScreen />}
      {loggedIn && <AppShell />}
      <ReceiptModal />
      <Toast />
    </>
  );
}
