import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { Session } from "./types";

export { isSupabaseConfigured };

export async function getCloudSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("name,business").eq("id", user.id).maybeSingle();
  return {
    userId: user.id,
    name: profile?.name || (user.user_metadata as any)?.name || user.email || "User",
    email: user.email || "",
    business: profile?.business || "My Laundry Shop",
  };
}

export async function cloudRegister(data: {
  name: string;
  business: string;
  email: string;
  pass: string;
}): Promise<{ ok: boolean; msg?: string; session?: Session }> {
  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.pass,
    options: { data: { name: data.name, business: data.business } },
  });
  if (error) return { ok: false, msg: error.message };
  const user = signUpData.user;
  if (!user) return { ok: false, msg: "Account created — check your email to confirm, then sign in." };
  await supabase.from("profiles").upsert({ id: user.id, name: data.name, business: data.business || "My Laundry Shop" });
  return {
    ok: true,
    session: { userId: user.id, name: data.name, email: data.email, business: data.business || "My Laundry Shop" },
  };
}

export async function cloudLogin(data: { email: string; pass: string }): Promise<{ ok: boolean; msg?: string; session?: Session }> {
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.pass });
  if (error) return { ok: false, msg: error.message };
  const user = signInData.user;
  if (!user) return { ok: false, msg: "Sign in failed." };
  const { data: profile } = await supabase.from("profiles").select("name,business").eq("id", user.id).maybeSingle();
  return {
    ok: true,
    session: {
      userId: user.id,
      name: profile?.name || user.email || "User",
      email: user.email || "",
      business: profile?.business || "My Laundry Shop",
    },
  };
}

export async function cloudLogout() {
  if (!isSupabaseConfigured()) return;
  await supabase.auth.signOut();
}

export async function cloudSendPasswordReset(email: string): Promise<{ ok: boolean; msg?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
  });
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}
