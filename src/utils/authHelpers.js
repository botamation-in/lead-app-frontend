/**
 * SSO Authentication Helpers
 * Utility functions for SSO authentication operations
 */

/**
 * Returns the auth service (SSO login page) URL — auth frontend, port 3000.
 */
export const getAuthServiceUrl = () => {
    return import.meta.env.VITE_AUTH_URL || 'http://localhost:3000';
};

export const getCurrentServiceUrl = () => {
    return window.location.origin;
};

export const getApiBaseUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || '';
};

export const isProduction = () => {
    return import.meta.env.VITE_ENV === 'production';
};

/**
 * Redirect to SSO login page.
 * The auth service will redirect back to redirectUrl after successful login.
 * @param {string} redirectUrl - Where to return after login (defaults to current app URL)
 */
export const redirectToSSOLogin = (redirectUrl) => {
    const targetUrl = redirectUrl || getCurrentServiceUrl();
    const authServiceUrl = getAuthServiceUrl();

    if (!authServiceUrl) {
        console.error('VITE_AUTH_URL is not set');
        return;
    }

    const loginUrl = `${authServiceUrl}/login?redirect=${encodeURIComponent(targetUrl)}`;
    console.log('[SSO] Redirecting to login:', loginUrl);
    window.location.href = loginUrl;
};

/**
 * Redirect to SSO logout, then return to this app.
 */
export const redirectToSSOLogout = () => {
    const authServiceUrl = getAuthServiceUrl();
    const currentServiceUrl = getCurrentServiceUrl();

    if (!authServiceUrl) {
        console.error('VITE_AUTH_URL is not set');
        return;
    }

    const logoutUrl = `${authServiceUrl}/api/auth/logout?redirect=${encodeURIComponent(currentServiceUrl)}`;
    console.log('[SSO] Redirecting to logout:', logoutUrl);
    window.location.href = logoutUrl;
};

/**
 * Normalize user data fields (different backends may use 'id', '_id', or 'userId').
 * Also stores non-sensitive identifiers in localStorage for convenience.
 * @param {object} userData - Raw user object from the backend
 */
export const normalizeUserData = (userData = {}) => {
    const normalized = {
        userId: userData.userId || userData.id || userData._id || null,
        email: userData.email || null,
        name: userData.name || '',
        profileImageUrl: userData.profileImageUrl || '',
        acctId: userData.acctId || null,
        acctNo: userData.acctNo || null,
        role: userData.role || null,
    };

    // Store only non-sensitive identifiers in localStorage
    if (normalized.userId) localStorage.setItem('userId', normalized.userId);
    if (normalized.acctId) localStorage.setItem('acctId', normalized.acctId);
    if (normalized.acctNo) localStorage.setItem('acctNo', normalized.acctNo);

    return normalized;
};

/**
 * Log auth events (only in non-production)
 */
export const logAuthEvent = (event, data = {}) => {
    if (!isProduction()) {
        console.log(`[SSO Auth] ${event}:`, data);
    }
};
