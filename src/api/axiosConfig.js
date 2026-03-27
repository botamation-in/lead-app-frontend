import axios from 'axios';

// Build base URL from environment variables (Vite uses import.meta.env)
// In production, leave empty so requests use relative paths (same-origin),
// handled by the reverse proxy (e.g. Nginx). In dev, the Vite proxy handles /api/* routing.
const API_HOST = import.meta.env.VITE_API_HOST !== undefined && import.meta.env.VITE_API_HOST !== ''
    ? import.meta.env.VITE_API_HOST
    : (import.meta.env.PROD ? '' : '');
const API_PORT = import.meta.env.VITE_API_PORT || '';
const BASE_URL = API_HOST && API_PORT ? `${API_HOST}:${API_PORT}` : API_HOST;

// Auth service URL (the SSO login page — auth frontend)
export const AUTH_SERVICE_URL =
    import.meta.env.VITE_AUTH_SERVICE_URL ||
    (import.meta.env.PROD ? '' : 'http://localhost:3000');

// Auth backend URL (for user profile API calls)
export const AUTH_BACKEND_URL =
    import.meta.env.VITE_AUTH_BACKEND_URL ||
    (import.meta.env.PROD ? '' : 'http://localhost:8080');

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
// When any request to this app's backend returns 401, redirect to SSO login.
// NOTE: We always build the redirect URL on the client side using
// window.location.href (the page the user is on). The backend's 401 response
// includes an `authUrl` whose `redirect` parameter is the API path
// (req.originalUrl), NOT the frontend page URL — using it would redirect the
// user back to a JSON endpoint after login.
api.interceptors.response.use(
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

// ─── 401 Interceptor for Auth API ─────────────────────────────────────────────
// NOTE: Do NOT auto-redirect on 401 from auth backend.
// The profile fetch is optional — if it fails, AuthContext catches the error
// and continues with the SSO-validated user data. Redirecting here would
// cause a login loop when the auth backend rejects the cross-origin cookie.
authApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        return Promise.reject(error);
    }
);

export default api;
export { BASE_URL };
