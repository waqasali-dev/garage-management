import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AUTH_STORAGE_KEY = 'garage_auth_user';

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

    const login = (userData) => {
        setUser(userData);
        try {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
        } catch (e) {
            console.error('Error saving auth user:', e);
        }
    };

    const logout = () => {
        setUser(null);
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch (e) {
            console.error('Error removing auth user:', e);
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
                role,
                rawRole,
                isAdmin,
                isStaff,
                isOwner,
                isAuthenticated,
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
