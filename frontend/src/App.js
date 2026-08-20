import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

// Admin Core Components
import Dashboard from './components/Dashboard';
import VehicleIntake from './components/VehicleIntake';
import WorkOrders from './components/WorkOrders';
import WorkOrderDetails from './components/WorkOrderDetails';
import OwnersList from './components/OwnersList';
import OwnerDetail from './components/OwnerDetail';
import Scheduling from './components/Scheduling';
import Inventory from './components/Inventory';
import Invoices from './components/Invoices';
import Staff from './components/Staff';
import StaffLogin from './components/StaffLogin';
import AuditLog from './components/AuditLog';
import UserManagement from './components/UserManagement';

// Staff Portal Components
import StaffDashboard from './staff/StaffDashboard';
import WorkOrderExecution from './staff/WorkOrderExecution';
import StaffSchedules from './staff/StaffSchedules';

// Owner Portal Components
import OwnerCars from './owner/OwnerCars';
import CarServiceHistory from './owner/CarServiceHistory';

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
        <AuthProvider>
            <div className="App">
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
            </div>
        </AuthProvider>
    );
}

export default App;
