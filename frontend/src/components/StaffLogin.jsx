import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './css/StaffLogin.css';
import { API_BASE_URL } from '../config/api';

const DEMO_ACCOUNTS = [
    {
        roleKey: 'admin',
        roleBadge: 'ADMINISTRATOR',
        badgeColor: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.15)',
        icon: 'admin_panel_settings',
        name: 'System Admin',
        email: 'admin@precision.garage',
        password: 'admin123',
        description: 'Full garage control, inventory, invoices, telemetry & user management.',
    },
    {
        roleKey: 'staff',
        roleBadge: 'MASTER TECHNICIAN',
        badgeColor: '#fbbf24',
        badgeBg: 'rgba(251, 191, 36, 0.15)',
        icon: 'construction',
        name: 'Marcus Vance',
        email: 'marcus@gmail.com',
        password: 'password123',
        description: 'Live job cards, vehicle diagnostics, repair timers & bay tasks.',
    },
    {
        roleKey: 'owner',
        roleBadge: 'CAR OWNER',
        badgeColor: '#34d399',
        badgeBg: 'rgba(52, 211, 153, 0.15)',
        icon: 'directions_car',
        name: 'Kashif Ali (VIP)',
        email: 'kashinat@gmail.com',
        password: 'password123',
        description: 'Real-time vehicle repair timeline, service history & digital receipts.',
    },
];

export default function StaffLogin() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
        if (errorMsg) setErrorMsg('');
    };

    const performLogin = async (emailToUse, passwordToUse) => {
        setIsLoading(true);
        setErrorMsg('');

        try {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailToUse.trim(),
                    password: passwordToUse,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                setErrorMsg(json.error || 'Authentication failed. Please check your credentials.');
                setIsLoading(false);
                return;
            }

            // Save user and token in AuthContext & LocalStorage
            login(json.user, json.token);

            // Role-based Redirection
            const rawRole = (json.user.role || '').toLowerCase();
            if (rawRole === 'admin') {
                navigate('/dashboard', { replace: true });
            } else if (rawRole === 'staff') {
                navigate('/staff/dashboard', { replace: true });
            } else if (rawRole === 'car_owner' || rawRole === 'owner') {
                navigate('/owner/cars', { replace: true });
            } else {
                navigate('/dashboard', { replace: true });
            }
        } catch (err) {
            console.error('Login network error:', err);
            setErrorMsg('Unable to connect to garage authentication server.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        performLogin(formData.email, formData.password);
    };

    const handleSelectDemoAccount = (acc, autoSubmit = true) => {
        setFormData({
            email: acc.email,
            password: acc.password,
        });
        setIsDemoModalOpen(false);

        if (autoSubmit) {
            performLogin(acc.email, acc.password);
        }
    };

    return (
        <div className="login-wrapper">
            {/* Main Login Card */}
            <main className="login-card">
                {/* Brand Header */}
                <header className="login-header">
                    <div className="brand-icon">
                        <span className="material-symbols-outlined">car_repair</span>
                    </div>
                    <h1 className="brand-title">Precision Garage</h1>
                    <p className="brand-subtitle">Unified Portal Authorization (Admin, Staff & Owners)</p>
                </header>

                {/* Error Notice */}
                {errorMsg && (
                    <div className="login-error-notice">
                        <span className="material-symbols-outlined icon-sm">warning</span>
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Login Form */}
                <form className="login-form" onSubmit={handleSubmit}>
                    {/* Email / Username */}
                    <div className="form-group">
                        <label htmlFor="email">
                            <span className="material-symbols-outlined icon-sm">badge</span>
                            Account Email Address
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="admin@precision.garage, staff or owner email..."
                            value={formData.email}
                            onChange={handleChange}
                            required
                            autoComplete="username"
                        />
                    </div>

                    {/* Password */}
                    <div className="form-group">
                        <div className="label-wrapper">
                            <label htmlFor="password">
                                <span className="material-symbols-outlined icon-sm">lock</span>
                                Passcode
                            </label>
                        </div>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {/* Submit Action */}
                    <button type="submit" className="submit-btn" disabled={isLoading}>
                        <span className="material-symbols-outlined icon-sm">
                            {isLoading ? 'hourglass_top' : 'login'}
                        </span>
                        <span>{isLoading ? 'Verifying Credentials...' : 'Sign In to Portal'}</span>
                    </button>
                </form>

                {/* Technical Footer */}
                <footer className="login-footer">
                    <p>ROLE RECOGNITION: ADMIN • STAFF • CAR OWNER</p>
                </footer>
            </main>

            {/* ==================================================== */}
            {/* FLOATING QUICK DEMO LOGINS BUTTON & POPUP WIDGET     */}
            {/* ==================================================== */}
            <aside className="demo-floating-container" aria-label="Demo Quick Access">
                <button
                    type="button"
                    className={`demo-fab-btn ${isDemoModalOpen ? 'active' : ''}`}
                    onClick={() => setIsDemoModalOpen(!isDemoModalOpen)}
                    title="Quick Demo Accounts"
                >
                    <span className="demo-fab-pulse"></span>
                    <span className="material-symbols-outlined demo-fab-icon">bolt</span>
                    <span className="demo-fab-text">Quick Demo Logins</span>
                </button>

                {isDemoModalOpen && (
                    <div className="demo-popover animate-fade-in">
                        <div className="demo-popover-header">
                            <div className="demo-popover-title">
                                <span className="material-symbols-outlined text-yellow">key</span>
                                <div>
                                    <h3>Demo Credentials</h3>
                                    <p>Select any role to autofill & log in immediately</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="demo-close-btn"
                                onClick={() => setIsDemoModalOpen(false)}
                                aria-label="Close"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="demo-cards-list">
                            {DEMO_ACCOUNTS.map((acc) => (
                                <div
                                    key={acc.roleKey}
                                    className="demo-account-card"
                                    onClick={() => handleSelectDemoAccount(acc, true)}
                                >
                                    <div className="demo-card-top">
                                        <div
                                            className="demo-role-badge"
                                            style={{
                                                color: acc.badgeColor,
                                                backgroundColor: acc.badgeBg,
                                                borderColor: acc.badgeColor,
                                            }}
                                        >
                                            <span className="material-symbols-outlined icon-xs">{acc.icon}</span>
                                            <span>{acc.roleBadge}</span>
                                        </div>
                                        <span className="demo-1click-label">
                                            1-Click Login →
                                        </span>
                                    </div>

                                    <div className="demo-card-body">
                                        <div className="demo-account-name">{acc.name}</div>
                                        <div className="demo-account-email font-mono">{acc.email}</div>
                                        <div className="demo-account-desc">{acc.description}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="demo-popover-footer">
                            <span>Password for all demo accounts: <code>admin123</code> / <code>password123</code></span>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}