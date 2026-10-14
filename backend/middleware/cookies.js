/**
 * Precision Garage API - Secure Cookie & Session Utilities
 * Implements HttpOnly, Secure, SameSite Cookie Policies (CWE-1004 / SEC-2.1)
 */

export const AUTH_COOKIE_NAME = "garage_jwt";

/**
 * Resolve secure cookie configuration based on environment
 */
export const getAuthCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,                                      // Defends against XSS token theft
        secure: isProduction,                               // Enforce HTTPS transmission in production
        sameSite: isProduction ? "none" : "lax",             // Cross-site compatible in prod, lax in local
        maxAge: 7 * 24 * 60 * 60 * 1000,                    // 7 days in milliseconds
        path: "/",
    };
};

/**
 * Set signed session cookie on outgoing HTTP response
 */
export const setAuthCookie = (res, token) => {
    if (!res || !token) return;
    const options = getAuthCookieOptions();
    res.cookie(AUTH_COOKIE_NAME, token, options);
};

/**
 * Clear session cookie on logout / account termination
 */
export const clearAuthCookie = (res) => {
    if (!res) return;
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    });
};

/**
 * Extract JWT from either HttpOnly Cookie (primary) or Authorization Bearer header (fallback)
 */
export const extractToken = (req) => {
    if (!req) return null;

    // 1. Primary: Extract from secure HttpOnly cookie
    if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
        return req.cookies[AUTH_COOKIE_NAME];
    }

    // 2. Secondary fallback: Extract from Authorization Bearer header
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        return authHeader.split(" ")[1].trim();
    }

    return null;
};

export default {
    AUTH_COOKIE_NAME,
    getAuthCookieOptions,
    setAuthCookie,
    clearAuthCookie,
    extractToken,
};
