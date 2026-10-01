import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import StyledLoading from './StyledLoading';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import EngineeringIcon from '@mui/icons-material/Engineering';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
            const [staffRes, usersRes] = await Promise.all([
                fetch(`${API_BASE_URL}/staff`).catch(() => null),
                fetch(`${API_BASE_URL}/users`).catch(() => null),
            ]);

            let staffData = [];
            if (staffRes && staffRes.ok) {
                const json = await staffRes.json();
                if (json.success && Array.isArray(json.data)) {
                    staffData = json.data;
                }
            }

            // Resilient merge: ensure disabled/suspended staff are never omitted even if backend filtered them
            if (usersRes && usersRes.ok) {
                const usersJson = await usersRes.json();
                if (usersJson.success && Array.isArray(usersJson.data)) {
                    const staffUsers = usersJson.data.filter((u) => u.role === 'staff' && u.staff_id);
                    const staffMap = new Map();
                    staffData.forEach((s) => staffMap.set(Number(s.staff_id || s.id), s));

                    staffUsers.forEach((u) => {
                        const sId = Number(u.staff_id);
                        const isSuspended = u.is_active === false;
                        const existing = staffMap.get(sId);

                        if (existing) {
                            existing.user_id = u.user_id;
                            existing.is_active = !isSuspended;
                            existing.is_suspended = isSuspended;
                            existing.account_active = !isSuspended;
                        } else {
                            // Recover omitted suspended staff profile from users directory
                            const parts = (u.staff_name || u.linkedName || '').trim().split(' ');
                            const initials = parts.length === 1
                                ? parts[0].substring(0, 2).toUpperCase()
                                : ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || 'ST';

                            staffMap.set(sId, {
                                id: sId,
                                staff_id: sId,
                                user_id: u.user_id,
                                name: u.staff_name || parts[0] || 'Staff Member',
                                role: u.staff_role || 'Technician',
                                email: u.email,
                                phone: u.staff_phone || '',
                                hourly_rate: parseFloat(u.staff_hourly_rate || 0).toFixed(2),
                                is_active: !isSuspended,
                                is_suspended: isSuspended,
                                account_active: Boolean(u.is_active),
                                has_user_account: true,
                                isLead: (u.staff_role || '').toLowerCase().includes('lead'),
                                activeJobs: 0,
                                completedJobs: 0,
                                efficiency: 'Available',
                                workload: '0%',
                                workloadLabel: '0% - Light',
                                workloadType: 'success',
                                initials,
                                created_at: u.created_at,
                            });
                        }
                    });

                    staffData = Array.from(staffMap.values());
                }
            }

            setStaffList(staffData);
        } catch (err) {
            console.error('Error fetching staff:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleStaffStatus = async (member) => {
        const currentlySuspended = isMemberSuspended(member);
        const nextActive = currentlySuspended; // If suspended, next is active (true). If active, next is false (suspend).
        const staffId = Number(member.staff_id || member.id);
        const userId = member.user_id;

        // 1. Instant optimistic UI update: immediately reflects state in React
        setStaffList((prevList) =>
            prevList.map((m) => {
                const mId = Number(m.staff_id || m.id);
                if (mId === staffId) {
                    return {
                        ...m,
                        is_active: nextActive,
                        is_suspended: !nextActive,
                        account_active: nextActive,
                        staff_active: nextActive,
                    };
                }
                return m;
            })
        );

        showNotification(
            `Staff account for ${member.name} is now ${nextActive ? 'ACTIVE' : 'SUSPENDED'}.`,
            nextActive ? 'success' : 'warning'
        );

        try {
            const token = localStorage.getItem('garage_auth_token');
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'X-User-Role': 'admin',
                'X-User-Email': 'admin@precision.garage',
            };

            const calls = [];
            // Update staff status (updates staff_data and users in DB)
            if (staffId) {
                calls.push(
                    fetch(`${API_BASE_URL}/staff/${staffId}/status`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify({ is_active: nextActive }),
                    }).catch(() => null)
                );
            }

            // Also update users endpoint if user_id linked
            if (userId) {
                calls.push(
                    fetch(`${API_BASE_URL}/users/${userId}/status`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify({ is_active: nextActive }),
                    }).catch(() => null)
                );
            }

            await Promise.all(calls);
            // Refresh live data in background
            await fetchStaff();
        } catch (err) {
            console.error('Failed to sync status with server:', err);
            await fetchStaff();
            showNotification(`Could not sync status with server: ${err.message}`, 'error');
        }
    };

    useEffect(() => {
        fetchStaff();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (isSubmitting) return;

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

    const [categoryFilter, setCategoryFilter] = useState('active'); // 'active' is primarily active by default

    const isMemberSuspended = (member) => {
        return member.is_suspended === true || member.is_active === false || member.account_active === false;
    };

    const activeCount = staffList.filter((m) => !isMemberSuspended(m)).length;
    const suspendedCount = staffList.filter((m) => isMemberSuspended(m)).length;
    const allCount = staffList.length;

    const filteredStaff = staffList.filter((member) => {
        const suspended = isMemberSuspended(member);
        if (categoryFilter === 'active' && suspended) return false;
        if (categoryFilter === 'suspended' && !suspended) return false;
        // 'all' includes both active and suspended

        if (!searchTerm.trim()) return true;
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

                        {/* Status Category Tabs: Active (primarily active), Suspended, All */}
                        <div className="staff-category-container">
                            <div className="staff-category-tabs" role="tablist" aria-label="Staff categories">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={categoryFilter === 'active'}
                                    className={`category-tab-btn ${categoryFilter === 'active' ? 'active' : ''}`}
                                    onClick={() => setCategoryFilter('active')}
                                >
                                    <span className="tab-dot dot-active"></span>
                                    <span>Active</span>
                                    <span className="tab-badge">{activeCount}</span>
                                </button>

                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={categoryFilter === 'suspended'}
                                    className={`category-tab-btn ${categoryFilter === 'suspended' ? 'active active-suspended' : ''}`}
                                    onClick={() => setCategoryFilter('suspended')}
                                >
                                    <span className="tab-dot dot-suspended"></span>
                                    <span>Suspended</span>
                                    <span className="tab-badge badge-suspended">{suspendedCount}</span>
                                </button>

                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={categoryFilter === 'all'}
                                    className={`category-tab-btn ${categoryFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setCategoryFilter('all')}
                                >
                                    <span>All</span>
                                    <span className="tab-badge">{allCount}</span>
                                </button>
                            </div>
                        </div>

                        {/* Bento Grid Staff Cards */}
                        <div className="staff-grid">
                            {isLoading ? (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <StyledLoading
                                        variant="card"
                                        size="md"
                                        message="Loading Workshop Staff Directory..."
                                        subtitle="Syncing mechanics, certified technicians & shift roles"
                                        icon="engineering"
                                        badge="Technician Registry"
                                    />
                                </div>
                            ) : (
                                <>
                                    {filteredStaff.length === 0 && (
                                        <div className="staff-empty-category">
                                            <EngineeringIcon className="empty-cat-icon" />
                                            <h4 className="empty-cat-title">
                                                {categoryFilter === 'suspended'
                                                    ? 'No Suspended Accounts'
                                                    : categoryFilter === 'active'
                                                    ? 'No Active Personnel'
                                                    : 'No Staff Found'}
                                            </h4>
                                            <p className="empty-cat-subtitle">
                                                {categoryFilter === 'suspended'
                                                    ? 'All registered mechanics and workshop technicians are in active status.'
                                                    : searchTerm
                                                    ? `No personnel matched your search query "${searchTerm}".`
                                                    : 'No staff members currently in this category.'}
                                            </p>
                                        </div>
                                    )}

                                    {filteredStaff.map((member) => {
                                        const suspended = isMemberSuspended(member);
                                        return (
                                            <div
                                                key={member.id}
                                                className={`staff-card ${suspended ? 'staff-card-suspended' : ''}`}
                                            >
                                                <div className="card-top">
                                                    <div className="profile-group">
                                                        <div className={`avatar-box ${suspended ? 'avatar-suspended' : ''}`}>
                                                            <span className="avatar-initials">{member.initials}</span>
                                                        </div>
                                                        <div>
                                                            <h3 className="staff-name">{member.name}</h3>
                                                            <p className={`staff-role ${member.isLead && !suspended ? 'role-lead' : ''}`}>
                                                                {member.role.toUpperCase()}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {suspended ? (
                                                        <div className="staff-rate-tag staff-suspended-tag font-mono">
                                                            SUSPENDED
                                                        </div>
                                                    ) : (
                                                        <div className="staff-rate-tag font-mono">
                                                            ${member.hourly_rate}/hr
                                                        </div>
                                                    )}
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
                                                        <span className={`metric-value ${suspended ? 'text-muted' : 'text-success'}`}>{member.efficiency}</span>
                                                    </div>
                                                </div>

                                                <div className="card-bottom">
                                                    <div className="workload-info">
                                                        <span className="text-muted">Workload Capacity</span>
                                                        <span
                                                            className={
                                                                suspended
                                                                    ? 'text-muted'
                                                                    : member.workloadType === 'warning'
                                                                    ? 'text-warning'
                                                                    : 'text-success'
                                                            }
                                                        >
                                                            {suspended ? 'Account Suspended' : member.workloadLabel}
                                                        </span>
                                                    </div>

                                                    <div className="progress-bar-track">
                                                        <div
                                                            className={`progress-bar-fill ${
                                                                suspended
                                                                    ? 'fill-suspended'
                                                                    : member.workloadType === 'warning'
                                                                    ? 'fill-warning'
                                                                    : 'fill-success'
                                                            }`}
                                                            style={{ width: suspended ? '0%' : member.workload }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="card-actions-row">
                                                    {suspended ? (
                                                        <button
                                                            type="button"
                                                            className="staff-action-btn staff-reactivate-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleStaffStatus(member);
                                                            }}
                                                            title="Reactivate mechanic account"
                                                        >
                                                            <CheckCircleIcon style={{ fontSize: 14 }} />
                                                            <span>Reactivate</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="staff-action-btn staff-suspend-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleStaffStatus(member);
                                                            }}
                                                            title="Suspend mechanic account"
                                                        >
                                                            <BlockIcon style={{ fontSize: 14 }} />
                                                            <span>Suspend</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
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