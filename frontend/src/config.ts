/**
 * Rage Optimiser Enterprise — Centralized Configuration & Environment Variables
 */

export const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
export const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:5000';
export const WS_BASE = (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:5001';
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
  const searchParams = new URLSearchParams();
  if (params?.token) searchParams.set('token', params.token);
  if (params?.guildId) searchParams.set('guildId', params.guildId);
  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

