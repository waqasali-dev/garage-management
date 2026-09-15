// ==============================================================================
// BACKEND API CONFIGURATION & GLOBAL REQUEST DEDUPLICATION
// ==============================================================================

// 🔒 SECURE BACKEND API BASE URL (Loaded from environment variables with local fallback)
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ==============================================================================
// 🛡️ GLOBAL IN-FLIGHT MUTEX & AUTH / IDEMPOTENCY INTERCEPTOR
// ==============================================================================
// Intercepts window.fetch across the entire application to guarantee:
// 1. Automatic Authorization Bearer token & session headers injection from localStorage
// 2. In-flight request deduplication (prevents rapid double-clicks from firing duplicate requests)
// 3. Automatic X-Idempotency-Key header injection on mutating requests (POST, PUT, PATCH, DELETE)
// 4. Response stream cloning so duplicate concurrent callers safely resolve identical responses

const inFlightRequests = new Map();

if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
        const method = (init.method || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

        // Prepare enhanced headers
        const headers = new Headers(init.headers || {});

        // Automatically inject Authorization Bearer token if present and not manually provided
        if (!headers.has('Authorization') && !headers.has('authorization')) {
            try {
                const token = localStorage.getItem('garage_auth_token');
                if (token) {
                    headers.set('Authorization', `Bearer ${token}`);
                }
            } catch (e) {
                // Ignore localStorage errors
            }
        }

        // Resilient session context headers fallback
        try {
            const storedUserStr = localStorage.getItem('garage_auth_user');
            if (storedUserStr) {
                const storedUser = JSON.parse(storedUserStr);
                if (storedUser?.role && !headers.has('X-User-Role') && !headers.has('x-user-role')) {
                    headers.set('X-User-Role', storedUser.role);
                }
                if (storedUser?.user_id && !headers.has('X-User-Id') && !headers.has('x-user-id')) {
                    headers.set('X-User-Id', String(storedUser.user_id));
                }
                if (storedUser?.email && !headers.has('X-User-Email') && !headers.has('x-user-email')) {
                    headers.set('X-User-Email', storedUser.email);
                }
                if (storedUser?.owner_id && !headers.has('X-Owner-Id') && !headers.has('x-owner-id')) {
                    headers.set('X-Owner-Id', String(storedUser.owner_id));
                }
            }
        } catch (e) {
            // Ignore parse errors
        }

        // Only intercept state-mutating HTTP methods for mutex & idempotency
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && url) {
            const bodyStr = typeof init.body === 'string' ? init.body : (init.body ? JSON.stringify(init.body) : '');
            const requestSignature = `${method}:${url}:${bodyStr}`;

            // Check if an identical mutating request is already actively in-flight
            if (inFlightRequests.has(requestSignature)) {
                console.warn(`[API CLIENT] Suppressed duplicate click: In-flight mutex locked for ${method} ${url}`);
                const inFlightPromise = inFlightRequests.get(requestSignature);
                // Return a cloned response stream so multiple callers can read their response independently
                return inFlightPromise.then((res) => (res && typeof res.clone === 'function' ? res.clone() : res));
            }

            // Ensure Idempotency Key header is present
            if (!headers.has('X-Idempotency-Key')) {
                const uniqueKey = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                headers.set('X-Idempotency-Key', uniqueKey);
            }

            const enhancedInit = {
                ...init,
                headers,
            };

            const fetchPromise = (async () => {
                try {
                    const response = await originalFetch(input, enhancedInit);
                    return response;
                } finally {
                    // Release mutex after request completes with a 350ms debounce window
                    setTimeout(() => {
                        inFlightRequests.delete(requestSignature);
                    }, 350);
                }
            })();

            inFlightRequests.set(requestSignature, fetchPromise);
            return fetchPromise;
        }

        const enhancedInit = {
            ...init,
            headers,
        };

        return originalFetch(input, enhancedInit);
    };
}

export default API_BASE_URL;
