import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

// Admin Core Components (Lazy Loaded)
const Dashboard = lazy(() => import('./components/Dashboard'));
const VehicleIntake = lazy(() => import('./components/VehicleIntake'));
const WorkOrders = lazy(() => import('./components/WorkOrders'));
const WorkOrderDetails = lazy(() => import('./components/WorkOrderDetails'));
const OwnersList = lazy(() => import('./components/OwnersList'));
const OwnerDetail = lazy(() => import('./components/OwnerDetail'));
const Scheduling = lazy(() => import('./components/Scheduling'));
const Inventory = lazy(() => import('./components/Inventory'));
const Invoices = lazy(() => import('./components/Invoices'));
const Staff = lazy(() => import('./components/Staff'));
const StaffLogin = lazy(() => import('./components/StaffLogin'));
const AuditLog = lazy(() => import('./components/AuditLog'));
const UserManagement = lazy(() => import('./components/UserManagement'));

// Staff Portal Components (Lazy Loaded)
const StaffDashboard = lazy(() => import('./staff/StaffDashboard'));
const WorkOrderExecution = lazy(() => import('./staff/WorkOrderExecution'));
const StaffSchedules = lazy(() => import('./staff/StaffSchedules'));

// Owner Portal Components (Lazy Loaded)
const OwnerCars = lazy(() => import('./owner/OwnerCars'));
const CarServiceHistory = lazy(() => import('./owner/CarServiceHistory'));

// Branded loading spinner fallback
function RouteLoadingFallback() {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0d14',
            color: '#94a3b8',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}>
            <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(59, 130, 246, 0.2)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginBottom: '16px',
            }} />
            <span style={{ fontSize: '13px', letterSpacing: '0.05em', color: '#64748b' }}>
                LOADING PRECISION GARAGE...
            </span>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// Smart Root Redirect based on user role
function RootRedirect() {
    const { isAuthenticated, role } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    if (role === 'admin') {
        return <Navigate to="/dashboard" replace />;
    }
    if (role === 'staff') {
        return <Navigate to="/staff/dashboard" replace />;
    }
    if (role === 'owner') {
        return <Navigate to="/owner/cars" replace />;
    }
    return <Navigate to="/dashboard" replace />;
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <NotificationProvider>
                    <div className="App">
                        <Suspense fallback={<RouteLoadingFallback />}>
                            <Routes>
                    {/* Public Login Route */}
                    <Route path="/login" element={<StaffLogin />} />

                    {/* Smart Root Index */}
                    <Route path="/" element={<RootRedirect />} />

                    {/* ==================================================== */}
                    {/* 1. ADMIN ONLY ROUTES (Super Control over Garage)     */}
                    {/* ==================================================== */}
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/work-orders"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <WorkOrders />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/work-orders/details"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <WorkOrderDetails />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/work-orders/:id"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <WorkOrderDetails />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/scheduling"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <Scheduling />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owners"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <OwnersList />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owners/details"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <OwnerDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owners/:id"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <OwnerDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/staff"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <Staff />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/audit-log"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AuditLog />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/users"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <UserManagement />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/users"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <UserManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* ==================================================== */}
                    {/* 2. STAFF & ADMIN WORKSPACE ROUTES                    */}
                    {/* ==================================================== */}
                    <Route
                        path="/staff/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={['staff', 'admin']}>
                                <StaffDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/staff/work-orders/:id"
                        element={
                            <ProtectedRoute allowedRoles={['staff', 'admin']}>
                                <WorkOrderExecution />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/staff/schedules"
                        element={
                            <ProtectedRoute allowedRoles={['staff', 'admin']}>
                                <StaffSchedules />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/intake"
                        element={
                            <ProtectedRoute allowedRoles={['staff', 'admin']}>
                                <VehicleIntake />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/inventory"
                        element={
                            <ProtectedRoute allowedRoles={['staff', 'admin']}>
                                <Inventory />
                            </ProtectedRoute>
                        }
                    />

                    {/* ==================================================== */}
                    {/* 3. OWNER & ADMIN CUSTOMER PORTAL ROUTES              */}
                    {/* ==================================================== */}
                    <Route
                        path="/owner/cars"
                        element={
                            <ProtectedRoute allowedRoles={['owner', 'admin']}>
                                <OwnerCars />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owner/vehicles"
                        element={
                            <ProtectedRoute allowedRoles={['owner', 'admin']}>
                                <OwnerCars />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owner/history"
                        element={
                            <ProtectedRoute allowedRoles={['owner', 'admin']}>
                                <CarServiceHistory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/owner/history/:vin"
                        element={
                            <ProtectedRoute allowedRoles={['owner', 'admin']}>
                                <CarServiceHistory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/invoices"
                        element={
                            <ProtectedRoute allowedRoles={['owner', 'admin']}>
                                <Invoices />
                            </ProtectedRoute>
                        }
                    />

                    {/* Catch-all Fallback */}
                    <Route path="*" element={<RootRedirect />} />
                </Routes>
            </Suspense>
        </div>
    </NotificationProvider>
</AuthProvider>
</ErrorBoundary>
    );
}

export default App;
