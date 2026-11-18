/**
 * Rage Optimiser Enterprise — Centralized Configuration & Environment Variables
 */

const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.protocol === 'file:' ||
  !window.location.hostname
);

const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
const isNetlify = typeof window !== 'undefined' && window.location.hostname.includes('netlify.app');
const PROD_HOST = 'apirageoptimisercom.altvr.in';

// When running on Netlify or Vite dev, use same-origin relative proxy ('')
const defaultApiBase = (isNetlify || isLocal) ? '' : `https://${PROD_HOST}`;
const defaultWsBase = `wss://${PROD_HOST}`;

let envApiUrl = (import.meta.env.VITE_API_URL as string) || '';
let resolvedApiBase = envApiUrl ? (isNetlify && envApiUrl.includes('altvr.in') ? '' : envApiUrl) : defaultApiBase;
let resolvedWsBase = (import.meta.env.VITE_WS_URL as string) || defaultWsBase;

// Security & mixed-content guard: On HTTPS pages (like Netlify), never attempt ws:// or localhost
if (isHttps) {
  if (resolvedApiBase.startsWith('http://')) {
    resolvedApiBase = resolvedApiBase.replace('http://', 'https://');
  }
  if (resolvedWsBase.startsWith('ws://')) {
    resolvedWsBase = resolvedWsBase.replace('ws://', 'wss://');
  }
  if (resolvedWsBase.includes('localhost') || resolvedWsBase.includes('127.0.0.1')) {
    resolvedWsBase = `wss://${PROD_HOST}`;
  }
  if (!isNetlify && (resolvedApiBase.includes('localhost') || resolvedApiBase.includes('127.0.0.1'))) {
    resolvedApiBase = `https://${PROD_HOST}`;
  }
}

export const API_BASE = resolvedApiBase;
export const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL as string) || API_BASE;
export const WS_BASE = resolvedWsBase;
export const DISCORD_CLIENT_ID = (import.meta.env.VITE_DISCORD_CLIENT_ID as string) || '1519626369594818560';
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || 'Rage Optimiser Enterprise';
export const ENVIRONMENT = (import.meta.env.VITE_ENVIRONMENT as string) || 'production';
export const APP_VERSION = (import.meta.env.VITE_VERSION as string) || '2.5.0';

/** Build an API endpoint URL */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

/** Build a WebSocket endpoint URL with optional token and guild parameters */
export function wsUrl(params?: { token?: string | null; guildId?: string | null }): string {
  let base = WS_BASE;
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('ws://')) {
    base = base.replace('ws://', 'wss://');
  }
  const searchParams = new URLSearchParams();
  if (params?.token) searchParams.set('token', params.token);
  if (params?.guildId) searchParams.set('guildId', params.guildId);
  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

