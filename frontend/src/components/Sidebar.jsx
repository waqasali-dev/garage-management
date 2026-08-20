import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './css/Sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
    const navigate = useNavigate();
    const { user, role, isAdmin, isStaff, isOwner, logout } = useAuth();

    const getNavClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Determine subtitle & role branding
    const roleTitle = isAdmin
        ? 'Admin Super Control'
        : isStaff
        ? 'Staff Workshop Hub'
        : isOwner
        ? 'Customer Vehicle Portal'
        : 'Precision Portal';

    const roleBadgeClass = isAdmin
        ? 'role-admin'
        : isStaff
        ? 'role-staff'
        : 'role-owner';

    return (
        <>
            {/* Mobile Backdrop Overlay */}
            {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

            <nav className={`sidebar-nav ${isOpen ? 'is-open' : ''}`}>
                {/* Brand Header */}
                <div className="sidebar-brand">
                    <div className="brand-logo-icon">
                        <span className="material-symbols-outlined">car_repair</span>
                    </div>
                    <h1 className="brand-name">Precision Garage</h1>
                    <p className="brand-role">{roleTitle}</p>
                </div>

                {/* Navigation Menu by User Role */}
                <div className="sidebar-menu">
                    {/* ==================================================== */}
                    {/* 1. ADMIN NAVIGATION (Super Control over Everything) */}
                    {/* ==================================================== */}
                    {isAdmin && (
                        <>
                            <NavLink to="/dashboard" end className={getNavClass}>
                                <span className="material-symbols-outlined">dashboard</span>
                                <span>Dashboard</span>
                            </NavLink>

                            <NavLink to="/staff/dashboard" end className={getNavClass}>
                                <span className="material-symbols-outlined">engineering</span>
                                <span>Staff Hub</span>
                            </NavLink>

                            <NavLink to="/work-orders" className={getNavClass}>
                                <span className="material-symbols-outlined">build</span>
                                <span>Work Orders</span>
                            </NavLink>

                            <NavLink to="/invoices" end className={getNavClass}>
                                <span className="material-symbols-outlined">receipt_long</span>
                                <span>Invoices</span>
                            </NavLink>

                            <NavLink to="/inventory" end className={getNavClass}>
                                <span className="material-symbols-outlined">inventory_2</span>
                                <span>Inventory</span>
                            </NavLink>

                            <NavLink to="/scheduling" end className={getNavClass}>
                                <span className="material-symbols-outlined">calendar_month</span>
                                <span>Scheduling</span>
                            </NavLink>

                            <NavLink to="/owners" end className={getNavClass}>
                                <span className="material-symbols-outlined">group</span>
                                <span>Owners Directory</span>
                            </NavLink>

                            <NavLink to="/owner/cars" end className={getNavClass}>
                                <span className="material-symbols-outlined">directions_car</span>
                                <span>Owner's Cars</span>
                            </NavLink>

                            <NavLink to="/staff" end className={getNavClass}>
                                <span className="material-symbols-outlined">badge</span>
                                <span>Staff Directory</span>
                            </NavLink>

                            <NavLink to="/audit-log" end className={getNavClass}>
                                <span className="material-symbols-outlined">assessment</span>
                                <span>Audit Log</span>
                            </NavLink>

                            <NavLink to="/users" end className={getNavClass}>
                                <span className="material-symbols-outlined">admin_panel_settings</span>
                                <span>Users & Roles</span>
                            </NavLink>
                        </>
                    )}

                    {/* ==================================================== */}
                    {/* 2. STAFF NAVIGATION (Dedicated to Staff & Mechanics) */}
                    {/* ==================================================== */}
                    {isStaff && (
                        <>
                            <NavLink to="/staff/dashboard" end className={getNavClass}>
                                <span className="material-symbols-outlined">engineering</span>
                                <span>Staff Dashboard</span>
                            </NavLink>

                            <NavLink to="/staff/schedules" end className={getNavClass}>
                                <span className="material-symbols-outlined">calendar_month</span>
                                <span>Workshop Schedules</span>
                            </NavLink>

                            <NavLink to="/inventory" end className={getNavClass}>
                                <span className="material-symbols-outlined">inventory_2</span>
                                <span>Inventory Parts</span>
                            </NavLink>
                        </>
                    )}

                    {/* ==================================================== */}
                    {/* 3. OWNER NAVIGATION (Customer Portal Only) */}
                    {/* ==================================================== */}
                    {isOwner && (
                        <>
                            <NavLink to="/owner/cars" end className={getNavClass}>
                                <span className="material-symbols-outlined">directions_car</span>
                                <span>My Garage / Cars</span>
                            </NavLink>

                            <NavLink to="/invoices" end className={getNavClass}>
                                <span className="material-symbols-outlined">receipt_long</span>
                                <span>Invoices & Billing</span>
                            </NavLink>
                        </>
                    )}

                    {/* Fallback for unauthenticated guest preview */}
                    {!user && (
                        <>
                            <NavLink to="/login" end className={getNavClass}>
                                <span className="material-symbols-outlined">login</span>
                                <span>Sign In</span>
                            </NavLink>
                        </>
                    )}
                </div>

                {/* Bottom Section: Vehicle Intake Quick Action, User Identity & Logout */}
                <div className="sidebar-footer">
                    {/* Prominent Vehicle Intake Quick Button */}
                    {(isAdmin || isStaff) && (
                        <NavLink to="/intake" end className="sidebar-intake-btn" title="Intake new vehicle into workshop">
                            <span className="material-symbols-outlined">add_circle</span>
                            <span>Vehicle Intake</span>
                        </NavLink>
                    )}

                    {user && (
                        <div className="sidebar-user-card">
                            <div className="sidebar-user-top">
                                <span className="sidebar-user-name" title={user.full_name || user.email}>
                                    {user.full_name || 'Active User'}
                                </span>
                                <span className={`sidebar-role-pill ${roleBadgeClass}`}>
                                    {role.toUpperCase()}
                                </span>
                            </div>
                            <span className="sidebar-user-email" title={user.email}>
                                {user.email}
                            </span>
                        </div>
                    )}

                    <button type="button" className="logout-btn-action" onClick={handleLogout}>
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
                        <span>{user ? 'Sign Out' : 'Return to Login'}</span>
                    </button>
                </div>
            </nav>
        </>
    );
}