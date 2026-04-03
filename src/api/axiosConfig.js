import axios from 'axios';

// Auth service URL (SSO login page and auth backend — same origin)
export const AUTH_SERVICE_URL =
    import.meta.env.VITE_AUTH_URL ||
    (import.meta.env.PROD ? '' : 'http://localhost:3000');

export const AUTH_BACKEND_URL = AUTH_SERVICE_URL;

// Lead app backend base URL. Empty string = relative paths, which lets
// the Nginx reverse proxy (production) or Vite dev proxy route /api/* correctly.
const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

// ─── Main API Instance (this app's backend) ───────────────────────────────────
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true, // CRITICAL: sends the JWT cookie on every request
});

// ─── Auth API Instance (auth service backend) ─────────────────────────────────
export const authApi = axios.create({
    baseURL: AUTH_BACKEND_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true, // CRITICAL: sends the JWT cookie on every request
});

// ─── 401 Interceptor for Main API ─────────────────────────────────────────────
// When any request returns 401, auto-redirect to SSO login
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // If backend provides an authUrl, use it directly
            const authUrl = error.response?.data?.authUrl;
            if (authUrl) {
                window.location.href = authUrl;
                return Promise.reject(error);
            }

            // Fallback: build the SSO login URL manually
            if (AUTH_SERVICE_URL) {
                const currentUrl = window.location.href;
                window.location.href = `${AUTH_SERVICE_URL}/login?redirect=${encodeURIComponent(currentUrl)}`;
            }
        }

        return Promise.reject(error);
    }
);

// ─── 401 Interceptor for Auth API ─────────────────────────────────────────────
authApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            if (AUTH_SERVICE_URL) {
                const currentUrl = window.location.href;
                window.location.href = `${AUTH_SERVICE_URL}/login?redirect=${encodeURIComponent(currentUrl)}`;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
export { BASE_URL };
