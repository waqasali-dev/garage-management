import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { isAuthenticated, role, isAdmin } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        // Redirect unauthenticated users to login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Admin has super control over all routes
    if (isAdmin) {
        return children;
    }

    // Check if user's role is allowed
    if (allowedRoles && Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
        // Redirect unauthorized user to their default portal
        if (role === 'staff') {
            return <Navigate to="/staff/dashboard" replace />;
        } else if (role === 'owner') {
            return <Navigate to="/owner/cars" replace />;
        }
        return <Navigate to="/login" replace />;
    }

    return children;
}
