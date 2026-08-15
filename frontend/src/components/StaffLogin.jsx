import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/StaffLogin.css';

export default function StaffLogin() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Handle authentication logic here
        console.log('Logging in with:', formData);
        navigate('/dashboard');
    };

    return (
        <div className="login-wrapper">
            <main className="login-card">
                {/* Brand Header */}
                <header className="login-header">
                    <div className="brand-icon">
                        <span className="material-symbols-outlined">precision_manufacturing</span>
                    </div>
                    <h1 className="brand-title">Precision Garage</h1>
                    <p className="brand-subtitle">Staff Terminal Authorization</p>
                </header>

                {/* Login Form */}
                <form className="login-form" onSubmit={handleSubmit}>
                    {/* Email / Staff ID */}
                    <div className="form-group">
                        <label htmlFor="email">
                            <span className="material-symbols-outlined icon-sm">badge</span>
                            Staff ID / Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="tech.name@precision.garage"
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
                            <a href="#forgot" className="forgot-link">
                                Forgot?
                            </a>
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
                    <button type="submit" className="submit-btn">
                        <span>Log In</span>
                    </button>
                </form>

                {/* Technical Footer */}
                <footer className="login-footer">
                    <p>SECURE CONNECTION • NODE: PR-G-01</p>
                </footer>
            </main>
        </div>
    );
}