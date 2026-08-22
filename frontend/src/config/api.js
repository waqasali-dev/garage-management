// ==============================================================================
// BACKEND API CONFIGURATION & GLOBAL REQUEST DEDUPLICATION
// ==============================================================================

// 🚀 LIVE PRODUCTION BACKEND (Render Cloud Deployment)
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://garage-management-hy5h.onrender.com/api';

// 💻 LOCAL DEVELOPMENT BACKEND (Uncomment to switch back to local development)
// export const API_BASE_URL = 'http://localhost:5000/api';

// ==============================================================================
// 🛡️ GLOBAL IN-FLIGHT MUTEX & IDEMPOTENCY INTERCEPTOR
// ==============================================================================
// Intercepts window.fetch across the entire application to guarantee:
// 1. In-flight request deduplication (prevents rapid double-clicks from firing duplicate requests)
// 2. Automatic X-Idempotency-Key header injection on mutating requests (POST, PUT, PATCH, DELETE)
// 3. Response stream cloning so duplicate concurrent callers safely resolve identical responses

const inFlightRequests = new Map();

if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
        const method = (init.method || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

        // Only intercept state-mutating HTTP methods
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
            const headers = new Headers(init.headers || {});
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

        return originalFetch(input, init);
    };
}

export default API_BASE_URL;
