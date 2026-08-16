import React from 'react';
import { NavLink } from 'react-router-dom';
import './css/Sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
    const getNavClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

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
                    <p className="brand-role">Admin Terminal</p>
                </div>

                {/* Navigation Links */}
                <div className="sidebar-menu">
                    <NavLink to="/dashboard" className={getNavClass}>
                        <span className="material-symbols-outlined">dashboard</span>
                        <span>Dashboard</span>
                    </NavLink>

                    <NavLink to="/staff/dashboard" className={getNavClass}>
                        <span className="material-symbols-outlined">handyman</span>
                        <span>Staff Hub</span>
                    </NavLink>

                    <NavLink to="/work-orders" className={getNavClass}>
                        <span className="material-symbols-outlined">build</span>
                        <span>Work Orders</span>
                    </NavLink>

                    <NavLink to="/invoices" className={getNavClass}>
                        <span className="material-symbols-outlined">receipt_long</span>
                        <span>Invoices</span>
                    </NavLink>

                    <NavLink to="/inventory" className={getNavClass}>
                        <span className="material-symbols-outlined">inventory_2</span>
                        <span>Inventory</span>
                    </NavLink>

                    <NavLink to="/scheduling" className={getNavClass}>
                        <span className="material-symbols-outlined">calendar_month</span>
                        <span>Scheduling</span>
                    </NavLink>

                    <NavLink to="/owners" className={getNavClass}>
                        <span className="material-symbols-outlined">group</span>
                        <span>Owners</span>
                    </NavLink>

                    <NavLink to="/staff" className={getNavClass}>
                        <span className="material-symbols-outlined">engineering</span>
                        <span>Staff</span>
                    </NavLink>

                    <NavLink to="/intake" className={getNavClass}>
                        <span className="material-symbols-outlined">add_circle</span>
                        <span>Intake</span>
                    </NavLink>

                    <NavLink to="/audit-log" className={getNavClass}>
                        <span className="material-symbols-outlined">assessment</span>
                        <span>Audit Log</span>
                    </NavLink>

                    <NavLink to="/users" className={getNavClass}>
                        <span className="material-symbols-outlined">admin_panel_settings</span>
                        <span>Users & Roles</span>
                    </NavLink>
                </div>

                {/* Bottom Utility Links */}
                <div className="sidebar-footer">
                    <NavLink to="/login" className="nav-item logout">
                        <span className="material-symbols-outlined">logout</span>
                        <span>Logout</span>
                    </NavLink>
                </div>
            </nav>
        </>
    );
}