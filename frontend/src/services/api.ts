/**
 * Rage Optimiser Enterprise — Central API Client
 */

import { API_BASE, apiUrl } from '../config';
import { logger } from './logger';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  skipAuth?: boolean;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

export class ApiClient {
  private defaultTimeout = 10000;
  private defaultRetries = 2;

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const token = localStorage.getItem('cn_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const activeGuild = localStorage.getItem('cn_active_guild');
    if (activeGuild) {
      headers['X-Guild-Id'] = activeGuild;
    }

    return headers;
  }

  private async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const url = apiUrl(endpoint);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeout;
    const maxRetries = options.retries ?? this.defaultRetries;
    const headers = { ...this.getAuthHeaders(), ...(options.headers as Record<string, string>) };

    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle 401 Unauthorized globally
        if (response.status === 401) {
          logger.warn('Session expired or unauthorized request (401)', { url }, 'auth');
          localStorage.removeItem('cn_token');
          window.dispatchEvent(new Event('auth:unauthorized'));
        }

        if (!response.ok && response.status >= 500 && attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }

        let data: any;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        return {
          data,
          status: response.status,
          ok: response.ok,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError') {
          logger.error(`API request timed out after ${timeoutMs}ms`, { url }, 'api');
        } else {
          logger.error(`API request failed: ${err.message}`, { url, attempt }, 'api');
        }

        if (attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise(r => setTimeout(r, backoff));
        } else {
          break;
        }
      }
    }

    throw lastError || new Error(`Failed request to ${url}`);
  }

  public async get<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
