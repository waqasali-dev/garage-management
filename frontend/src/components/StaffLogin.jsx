import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './css/StaffLogin.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

export default function StaffLogin() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
        if (errorMsg) setErrorMsg('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg('');

        try {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email.trim(),
                    password: formData.password,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                setErrorMsg(json.error || 'Authentication failed. Please check your credentials.');
                setIsLoading(false);
                return;
            }

            // Save user in AuthContext & LocalStorage
            login(json.user);

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

    return (
        <div className="login-wrapper">
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
                    <div style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                        marginBottom: '16px',
                        textAlign: 'center',
                    }}>
                        ⚠ {errorMsg}
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
                        <span>{isLoading ? 'Verifying Credentials...' : 'Sign In to Portal'}</span>
                    </button>
                </form>

                {/* Technical Footer */}
                <footer className="login-footer">
                    <p>ROLE RECOGNITION: ADMIN • STAFF • CAR OWNER</p>
                </footer>
            </main>
        </div>
    );
}