import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import EngineeringIcon from '@mui/icons-material/Engineering';
import './css/Staff.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

const STAFF_ROLE_OPTIONS = [
    'Lead Technician',
    'Master Mechanic',
    'Diagnostics Specialist',
    'Electrical & Hybrid Tech',
    'Service Advisor',
    'Brake & Suspension Tech',
    'Lube & Tire Specialist',
    'Apprentice Technician',
];

const INITIAL_STAFF_FORM = {
    staff_name: '',
    staff_role: 'Lead Technician',
    email: '',
    password: '',
    staff_phone: '',
    staff_address: '',
    staff_hourly_rate: '45.00',
    is_active: true,
};

export default function Staff() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [staffList, setStaffList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [notification, setNotification] = useState(null);

    // Add Staff Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_STAFF_FORM);
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const fetchStaff = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setStaffList(json.data);
                }
            } else {
                showNotification('Failed to fetch staff from server', 'error');
            }
        } catch (err) {
            console.error('Error fetching staff:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, []);

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleCreateStaffAccount = async (e) => {
        e.preventDefault();

        if (!formData.staff_name.trim() || !formData.email.trim() || !formData.password.trim()) {
            showNotification('Full Name, Email, and Password are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/admin/create-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'staff',
                    email: formData.email.trim(),
                    password: formData.password,
                    is_active: formData.is_active,
                    staff_name: formData.staff_name.trim(),
                    staff_role: formData.staff_role,
                    staff_phone: formData.staff_phone.trim(),
                    staff_address: formData.staff_address.trim(),
                    staff_hourly_rate: formData.staff_hourly_rate,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to create staff account', 'error');
                return;
            }

            showNotification(`🎉 Staff account for ${formData.staff_name} created successfully!`, 'success');
            setIsModalOpen(false);
            setFormData(INITIAL_STAFF_FORM);
            fetchStaff();
        } catch (err) {
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredStaff = staffList.filter((member) => {
        // Only show active staff who have active user accounts
        if (member.is_active === false || member.has_user_account === false || member.account_active === false) {
            return false;
        }

        const search = searchTerm.toLowerCase();
        return (
            (member.name || '').toLowerCase().includes(search) ||
            (member.role || '').toLowerCase().includes(search) ||
            (member.email || '').toLowerCase().includes(search) ||
            (member.phone || '').toLowerCase().includes(search)
        );
    });

    return (
        <div className="staff-layout">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="staff-wrapper">
                {/* Header */}
                <header className="staff-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>

                        <div className="search-box">
                            <SearchIcon className="search-icon" fontSize="small" />
                            <input
                                type="text"
                                placeholder="Search staff by name, role, email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchStaff} title="Refresh Live Data">
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="staff-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`staff-page-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Header Section */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Mechanics & Staff</h2>
                                <p className="page-subtitle">
                                    Manage workshop personnel, hourly rates, workloads, and terminal user accounts.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="primary-btn"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <PersonAddIcon fontSize="small" />
                                <span>ADD STAFF MEMBER</span>
                            </button>
                        </div>

                        {/* Bento Grid Staff Cards */}
                        <div className="staff-grid">
                            {isLoading ? (
                                <div className="loading-staff-box">
                                    <EngineeringIcon className="spinning-icon" />
                                    <p>Loading Workshop Staff Directory...</p>
                                </div>
                            ) : (
                                filteredStaff.map((member) => (
                                    <div key={member.id} className="staff-card">
                                        <div className="card-top">
                                            <div className="profile-group">
                                                <div className="avatar-box">
                                                    <span className="avatar-initials">{member.initials}</span>
                                                </div>
                                                <div>
                                                    <h3 className="staff-name">{member.name}</h3>
                                                    <p className={`staff-role ${member.isLead ? 'role-lead' : ''}`}>
                                                        {member.role.toUpperCase()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="staff-rate-tag font-mono">
                                                ${member.hourly_rate}/hr
                                            </div>
                                        </div>

                                        <div className="staff-contact-details font-mono">
                                            <span>📧 {member.email}</span>
                                            {member.phone && <span>📞 {member.phone}</span>}
                                        </div>

                                        <div className="metrics-row">
                                            <div className="metric-box">
                                                <span className="metric-label">
                                                    {member.role.toLowerCase().includes('advisor') ? 'Queue Jobs' : 'Active Jobs'}
                                                </span>
                                                <span className="metric-value">{member.activeJobs}</span>
                                            </div>

                                            <div className="metric-box">
                                                <span className="metric-label">Efficiency</span>
                                                <span className="metric-value text-success">{member.efficiency}</span>
                                            </div>
                                        </div>

                                        <div className="card-bottom">
                                            <div className="workload-info">
                                                <span className="text-muted">Workload Capacity</span>
                                                <span
                                                    className={
                                                        member.workloadType === 'warning' ? 'text-warning' : 'text-success'
                                                    }
                                                >
                                                    {member.workloadLabel}
                                                </span>
                                            </div>

                                            <div className="progress-bar-track">
                                                <div
                                                    className={`progress-bar-fill ${member.workloadType === 'warning' ? 'fill-warning' : 'fill-success'
                                                        }`}
                                                    style={{ width: member.workload }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Quick Add Placeholder Card */}
                            <button
                                type="button"
                                className="quick-add-card"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <div className="add-icon-circle">
                                    <AddIcon fontSize="medium" />
                                </div>
                                <span className="quick-add-text">Quick Add Staff Account</span>
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal Overlay: Add Staff Account */}
            {isModalOpen && (
                <div className="staff-modal-overlay">
                    <div className="staff-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <EngineeringIcon className="modal-header-icon" />
                                <div>
                                    <h3 className="modal-title">Create Staff & Mechanic Account</h3>
                                    <p className="modal-subtitle">Creates <code>staff_data</code> profile and linked <code>users</code> terminal account</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCreateStaffAccount} className="staff-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="staff_name">FULL NAME *</label>
                                    <input
                                        type="text"
                                        id="staff_name"
                                        name="staff_name"
                                        placeholder="e.g. Marcus Vance"
                                        value={formData.staff_name}
                                        onChange={handleFormChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="staff_role">WORKSHOP ROLE *</label>
                                    <select
                                        id="staff_role"
                                        name="staff_role"
                                        value={formData.staff_role}
                                        onChange={handleFormChange}
                                        required
                                    >
                                        {STAFF_ROLE_OPTIONS.map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">EMAIL ADDRESS (LOGIN) *</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="marcus.v@precisiongarage.com"
                                        value={formData.email}
                                        onChange={handleFormChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="password">ACCOUNT PASSWORD *</label>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            placeholder="Secure login password"
                                            value={formData.password}
                                            onChange={handleFormChange}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="toggle-pw-btn"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="staff_phone">PHONE NUMBER</label>
                                    <input
                                        type="text"
                                        id="staff_phone"
                                        name="staff_phone"
                                        placeholder="(555) 012-3456"
                                        value={formData.staff_phone}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="staff_hourly_rate">HOURLY RATE ($) *</label>
                                    <input
                                        type="number"
                                        step="0.50"
                                        min="0"
                                        id="staff_hourly_rate"
                                        name="staff_hourly_rate"
                                        value={formData.staff_hourly_rate}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="staff_address">RESIDENTIAL ADDRESS</label>
                                    <input
                                        type="text"
                                        id="staff_address"
                                        name="staff_address"
                                        placeholder="123 Mechanics Blvd, Suite 4"
                                        value={formData.staff_address}
                                        onChange={handleFormChange}
                                    />
                                </div>

                                <div className="form-group grid-full toggle-row">
                                    <label className="toggle-label">
                                        <input
                                            type="checkbox"
                                            name="is_active"
                                            checked={formData.is_active}
                                            onChange={handleFormChange}
                                        />
                                        <span>Account is Active & Allowed Terminal Login</span>
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Creating Staff Account...' : 'Create Staff Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}