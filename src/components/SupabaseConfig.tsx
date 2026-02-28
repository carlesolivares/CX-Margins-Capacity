import { useState } from 'react';
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig, getClient } from '../lib/supabase';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

export function SupabaseConfig() {
  const current = getSupabaseConfig();
  const hasEnvVars = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  const [url, setUrl] = useState(hasEnvVars ? '' : current?.url || '');
  const [key, setKey] = useState(hasEnvVars ? '' : current?.anonKey || '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const test = async () => {
    if (!url.trim() || !key.trim()) return;
    setStatus('testing');
    setMessage('');
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
      setUrl(cleanUrl);
    }
    saveSupabaseConfig(cleanUrl, key.trim());
    try {
      const sb = getClient();
      if (!sb) throw new Error('Client not created');
      const { error } = await sb.from('app_data').select('key').limit(1);
      if (error) throw error;
      setStatus('ok');
      setMessage('Connected! Data will sync to Supabase.');
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Connection failed');
      clearSupabaseConfig();
    }
  };

  const disconnect = () => {
    clearSupabaseConfig();
    setUrl('');
    setKey('');
    setStatus('idle');
    setMessage('Disconnected. Using local storage only.');
  };

  if (hasEnvVars) {
    return (
      <div className="settings-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} color="#10b981" />
          <span>Supabase configured via environment variables.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
        <label className="settings-label">Supabase Project URL</label>
        <input
          type="text"
          className="input"
          placeholder="https://xxxxx.supabase.co"
          value={url}
          onChange={e => { setUrl(e.target.value); setStatus('idle'); }}
          style={{ width: '100%' }}
        />
      </div>
      <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
        <label className="settings-label">Anon Key</label>
        <input
          type="password"
          className="input"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          value={key}
          onChange={e => { setKey(e.target.value); setStatus('idle'); }}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={test} disabled={!url.trim() || !key.trim() || status === 'testing'}>
          {status === 'testing' ? <><Loader size={14} className="spin" /> Testing...</> : 'Connect & Test'}
        </button>
        {current && (
          <button className="btn btn-secondary" onClick={disconnect}>Disconnect</button>
        )}
        {status === 'ok' && <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> {message}</span>}
        {status === 'error' && <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={14} /> {message}</span>}
        {status === 'idle' && message && <span style={{ color: '#6b7280' }}>{message}</span>}
      </div>
    </div>
  );
}
