import React, { createContext, useContext, useState, useEffect } from 'react';
import API_BASE_URL from '../config/api';

const AuthContext = createContext(null);

export const AUTH_STORAGE_KEY = 'garage_auth_user';
export const AUTH_TOKEN_KEY = 'garage_auth_token';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem(AUTH_STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('Error parsing stored auth user:', e);
            return null;
        }
    });

    const [token, setToken] = useState(() => {
        try {
            return localStorage.getItem(AUTH_TOKEN_KEY) || null;
        } catch (e) {
            return null;
        }
    });

    const [loading, setLoading] = useState(true);

    // Verify session with backend on initial mount using HttpOnly cookie or bearer token
    useEffect(() => {
        let isMounted = true;

        const verifySession = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/auth/me`, {
                    credentials: 'include',
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.success && data?.user && isMounted) {
                        setUser(data.user);
                        try {
                            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
                        } catch (_) {}
                    }
                } else if (res.status === 401 || res.status === 403) {
                    // Session invalid or account deactivated
                    if (isMounted) {
                        setUser(null);
                        setToken(null);
                        try {
                            localStorage.removeItem(AUTH_STORAGE_KEY);
                            localStorage.removeItem(AUTH_TOKEN_KEY);
                        } catch (_) {}
                    }
                }
            } catch (err) {
                console.warn('[AUTH] Session verification deferred (offline or network error):', err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        verifySession();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = (userData, tokenData) => {
        setUser(userData);
        if (tokenData) {
            setToken(tokenData);
        }
        try {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
            if (tokenData) {
                localStorage.setItem(AUTH_TOKEN_KEY, tokenData);
            }
        } catch (e) {
            console.error('Error saving auth credentials:', e);
        }
    };

    const logout = async () => {
        setUser(null);
        setToken(null);
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
        } catch (e) {
            console.error('Error removing auth credentials:', e);
        }

        // Notify backend to clear HttpOnly cookie
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (e) {
            // Silently ignore network failures on logout
        }
    };

    // Normalize role string (car_owner -> owner)
    const rawRole = (user?.role || '').toLowerCase();
    const role = rawRole === 'car_owner' ? 'owner' : rawRole || 'guest';
    const isAdmin = role === 'admin';
    const isStaff = role === 'staff';
    const isOwner = role === 'owner';
    const isAuthenticated = Boolean(user);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                role,
                rawRole,
                isAdmin,
                isStaff,
                isOwner,
                isAuthenticated,
                loading,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
