import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'cx-app-supabase-config';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let client: SupabaseClient | null = null;

export function getSupabaseConfig(): SupabaseConfig | null {
  // Env vars take priority
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };

  // Fall back to localStorage config
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as SupabaseConfig;
    return cfg.url && cfg.anonKey ? cfg : null;
  } catch {
    return null;
  }
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
  client = null; // reset so next call creates a new client
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CONFIG_KEY);
  client = null;
}

export function getClient(): SupabaseClient | null {
  if (client) return client;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey);
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export async function loadFromDB<T>(key: string): Promise<T | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('app_data')
      .select('value')
      .eq('key', key)
      .single();
    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function saveToDB<T>(key: string, value: T): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    await sb
      .from('app_data')
      .upsert({ key, value }, { onConflict: 'key' });
  } catch {
    // silent fail — localStorage is the fallback
  }
}
