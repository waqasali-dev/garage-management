import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './css/Sidebar.css';

const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function Sidebar({ isOpen, onClose }) {
    const navigate = useNavigate();
    const { user, role, isAdmin, isStaff, isOwner, logout } = useAuth();

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

    const renderNavItem = (to, icon, label, shortcut = null, end = false, extraStyle = null) => (
        <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {({ isActive }) => (
                <>
                    <span className="material-symbols-outlined" style={extraStyle || {}}>{icon}</span>
                    <span className="nav-label" style={extraStyle || {}}>{label}</span>
                    {shortcut && <span className="nav-shortcut-tag">{shortcut}</span>}
                    {isActive && <span className="nav-active-pip" />}
                </>
            )}
        </NavLink>
    );

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
                            {renderNavItem('/dashboard', 'dashboard', 'Dashboard', 'D', true)}
                            {renderNavItem('/staff/dashboard', 'engineering', 'Staff Hub', null, true)}
                            {renderNavItem('/work-orders', 'build', 'Work Orders', 'W')}
                            {renderNavItem('/invoices', 'receipt_long', 'Invoices', null, true)}
                            {renderNavItem('/inventory', 'inventory_2', 'Inventory', 'I', true)}
                            {renderNavItem('/scheduling', 'calendar_month', 'Scheduling', 'S', true)}
                            {renderNavItem('/owners', 'group', 'Owners Directory', null, true)}
                            {renderNavItem('/owner/cars', 'directions_car', "Owner's Cars", null, true)}
                            {renderNavItem('/staff', 'badge', 'Staff Directory', null, true)}
                            {renderNavItem('/audit-log', 'assessment', 'Audit Log', null, true)}
                            {renderNavItem('/users', 'admin_panel_settings', 'Users & Roles', null, true)}
                            {renderNavItem('/ai-reports', 'auto_awesome', 'AI Reports & Chat', 'AI', true, { color: '#ffd85f', fontWeight: '700' })}
                        </>
                    )}

                    {/* ==================================================== */}
                    {/* 2. STAFF NAVIGATION (Dedicated to Staff & Mechanics) */}
                    {/* ==================================================== */}
                    {isStaff && (
                        <>
                            {renderNavItem('/staff/dashboard', 'engineering', 'Staff Dashboard', 'D', true)}
                            {renderNavItem('/staff/schedules', 'calendar_month', 'Workshop Schedules', null, true)}
                            {renderNavItem('/inventory', 'inventory_2', 'Inventory Parts', 'I', true)}
                        </>
                    )}

                    {/* ==================================================== */}
                    {/* 3. OWNER NAVIGATION (Customer Portal Only) */}
                    {/* ==================================================== */}
                    {isOwner && (
                        <>
                            {renderNavItem('/owner/cars', 'directions_car', 'My Garage / Cars', null, true)}
                            {renderNavItem('/invoices', 'receipt_long', 'Invoices & Billing', null, true)}
                            {renderNavItem('/ai-reports', 'auto_awesome', 'AI Car Advisor', 'AI', true, { color: '#ffd85f', fontWeight: '700' })}
                        </>
                    )}

                    {/* Fallback for unauthenticated guest preview */}
                    {!user && (
                        <>
                            {renderNavItem('/login', 'login', 'Sign In', null, true)}
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
                            <span className="intake-key-badge">N</span>
                        </NavLink>
                    )}

                    {user && (
                        <div className="sidebar-user-card">
                            <div className="sidebar-user-main">
                                <div className={`sidebar-avatar-ring ${roleBadgeClass}`}>
                                    <span>{getInitials(user.full_name || user.email)}</span>
                                </div>
                                <div className="sidebar-user-details">
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
                            </div>
                            <div className="sidebar-status-telemetry">
                                <span className="telemetry-ping-dot"></span>
                                <span className="telemetry-text">Workshop Cloud Sync Active</span>
                            </div>
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