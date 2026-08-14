import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SecurityIcon from '@mui/icons-material/Security';
import BadgeIcon from '@mui/icons-material/Badge';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import EngineeringIcon from '@mui/icons-material/Engineering';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import './css/UserManagement.css';

const API_BASE_URL = 'http://localhost:5000/api';

const DEFAULT_STAFF = [
    { staff_id: 1, name: 'Marcus Vance', role: 'Lead Technician', email: 'marcus.v@precision.garage' },
    { staff_id: 2, name: 'Sarah Jenkins', role: 'Diagnostics Tech', email: 'sarah.j@precision.garage' },
    { staff_id: 3, name: 'David Tran', role: 'Service Advisor', email: 'david.t@precision.garage' },
];

const DEFAULT_OWNERS = [
    { owner_id: 1, name: 'Sarah Jenkins', phone: '(555) 012-3456', email: 'sarah.j@example.com' },
    { owner_id: 2, name: 'Marcus Chen', phone: '(555) 987-6543', email: 'm.chen.corp@example.com' },
    { owner_id: 3, name: 'Elena Rodriguez', phone: '(555) 444-2211', email: 'elena.r@example.com' },
];

export default function UserManagement() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [staffProfiles, setStaffProfiles] = useState(DEFAULT_STAFF);
    const [ownerProfiles, setOwnerProfiles] = useState(DEFAULT_OWNERS);
    const [isLoading, setIsLoading] = useState(true);
    const [dbConnected, setDbConnected] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Form state matching PostgreSQL 'users' table
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'admin',
        staff_id: '',
        owner_id: '',
        is_active: true,
    });

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Load data from PostgreSQL database via Express API
    const loadDatabaseData = async () => {
        setIsLoading(true);
        try {
            // 1. Health & Connection check
            const healthRes = await fetch(`${API_BASE_URL}/health`);
            if (healthRes.ok) {
                setDbConnected(true);
            }

            // 2. Fetch Users
            const usersRes = await fetch(`${API_BASE_URL}/users`);
            if (usersRes.ok) {
                const usersJson = await usersRes.json();
                if (usersJson.success && Array.isArray(usersJson.data)) {
                    setUsers(usersJson.data);
                }
            }

            // 3. Fetch Staff Profiles
            const staffRes = await fetch(`${API_BASE_URL}/staff-profiles`);
            if (staffRes.ok) {
                const staffJson = await staffRes.json();
                if (staffJson.success && staffJson.data.length > 0) {
                    setStaffProfiles(staffJson.data);
                }
            }

            // 4. Fetch Owner Profiles
            const ownerRes = await fetch(`${API_BASE_URL}/owner-profiles`);
            if (ownerRes.ok) {
                const ownerJson = await ownerRes.json();
                if (ownerJson.success && ownerJson.data.length > 0) {
                    setOwnerProfiles(ownerJson.data);
                }
            }
        } catch (err) {
            console.warn('Backend server connecting / not yet reachable:', err.message);
            setDbConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDatabaseData();
    }, []);

    const handleOpenModal = (presetRole = 'admin') => {
        setFormData({
            email: presetRole === 'admin' ? 'superadmin@precision.garage' : '',
            password: '',
            role: presetRole,
            staff_id: '',
            owner_id: '',
            is_active: true,
        });
        setShowPassword(false);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => {
            const updated = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };

            // Auto-fill email if staff/owner is selected
            if (name === 'staff_id' && value) {
                const staff = staffProfiles.find((s) => s.staff_id === parseInt(value, 10));
                if (staff && staff.email) updated.email = staff.email;
            } else if (name === 'owner_id' && value) {
                const owner = ownerProfiles.find((o) => o.owner_id === parseInt(value, 10));
                if (owner && owner.email) updated.email = owner.email;
            }

            // Reset profile link when switching role
            if (name === 'role') {
                updated.staff_id = '';
                updated.owner_id = '';
            }

            return updated;
        });
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();

        // Client-side validation for constraint chk_user_profile_alignment
        if (formData.role === 'staff' && !formData.staff_id) {
            showNotification('Staff accounts must be linked to a Staff Profile (staff_id).', 'error');
            return;
        }
        if (formData.role === 'car_owner' && !formData.owner_id) {
            showNotification('Car Owner accounts must be linked to an Owner Profile (owner_id).', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/create-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                showNotification(data.error || 'Failed to create user in database.', 'error');
                return;
            }

            showNotification(
                `🎉 Success: [${formData.email}] saved to PostgreSQL with role [${formData.role.toUpperCase()}].`,
                'success'
            );
            setIsModalOpen(false);
            loadDatabaseData(); // Refresh list from PostgreSQL
        } catch (err) {
            showNotification(`Server error: ${err.message}`, 'error');
        }
    };

    const handleToggleStatus = async (userId, currentStatus, userEmail) => {
        const nextStatus = !currentStatus;
        try {
            const response = await fetch(`${API_BASE_URL}/users/${userId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: nextStatus }),
            });

            if (response.ok) {
                showNotification(
                    `Account [${userEmail}] is now ${nextStatus ? 'ACTIVE' : 'SUSPENDED'}.`,
                    nextStatus ? 'success' : 'warning'
                );
                loadDatabaseData();
            } else {
                const errData = await response.json();
                showNotification(errData.error || 'Could not update status.', 'error');
            }
        } catch (err) {
            showNotification(`Request failed: ${err.message}`, 'error');
        }
    };

    const handleDeleteUser = async (userId, userEmail) => {
        if (!window.confirm(`Are you sure you want to permanently delete account "${userEmail}" from database?`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                showNotification(`Account [${userEmail}] revoked and deleted from PostgreSQL.`, 'warning');
                loadDatabaseData();
            } else {
                const errData = await response.json();
                showNotification(errData.error || 'Could not delete user.', 'error');
            }
        } catch (err) {
            showNotification(`Delete failed: ${err.message}`, 'error');
        }
    };

    // Filter Logic
    const filteredUsers = users.filter((u) => {
        const email = u.email || '';
        const name = u.linkedName || '';
        const matchesSearch =
            email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const stats = {
        total: users.length,
        admins: users.filter((u) => u.role === 'admin').length,
        staff: users.filter((u) => u.role === 'staff').length,
        carOwners: users.filter((u) => u.role === 'car_owner').length,
        active: users.filter((u) => u.is_active).length,
    };

    return (
        <div className="users-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="users-wrapper">
                {/* Top Header */}
                <header className="users-header">
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
                                placeholder="Search email or linked profile..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-actions">
                        <button
                            className="icon-btn"
                            onClick={loadDatabaseData}
                            title="Refresh from PostgreSQL Database"
                        >
                            <RefreshIcon fontSize="small" />
                        </button>

                        <div className={`admin-status-badge ${dbConnected ? '' : 'badge-disconnected'}`}>
                            <StorageIcon fontSize="small" />
                            <span>{dbConnected ? 'POSTGRESQL LIVE' : 'CONNECTING DB...'}</span>
                        </div>

                        <button className="icon-btn" aria-label="Notifications">
                            <NotificationsIcon fontSize="small" />
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="users-main">
                    <div className="content-container">
                        {/* Toast Notification */}
                        {notification && (
                            <div className={`toast-alert toast-${notification.type}`}>
                                <SecurityIcon fontSize="small" />
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Page Header */}
                        <div className="page-header">
                            <div>
                                <div className="badge-row">
                                    <span className="security-tag">
                                        <AdminPanelSettingsIcon fontSize="inherit" />
                                        SUPERADMIN RESTRICTED
                                    </span>
                                </div>
                                <h2 className="page-title">User Account & Role Control</h2>
                                <p className="page-subtitle">
                                    Provision credentials directly into PostgreSQL <code>public.users</code> with bcrypt hashing.
                                </p>
                            </div>

                            <div className="action-button-group">
                                <button
                                    type="button"
                                    className="primary-btn admin-create-btn"
                                    onClick={() => handleOpenModal('admin')}
                                >
                                    <AdminPanelSettingsIcon fontSize="small" />
                                    <span>CREATE ADMIN ACCOUNT</span>
                                </button>

                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => handleOpenModal('staff')}
                                >
                                    <PersonAddIcon fontSize="small" />
                                    <span>PROVISION USER</span>
                                </button>
                            </div>
                        </div>

                        {/* KPI Metric Cards */}
                        <div className="metrics-grid">
                            <div className="metric-card">
                                <div className="metric-icon-wrap icon-admin">
                                    <AdminPanelSettingsIcon />
                                </div>
                                <div>
                                    <div className="metric-title">Admin Accounts</div>
                                    <div className="metric-num text-yellow">{stats.admins}</div>
                                    <div className="metric-sub">Full System Authority</div>
                                </div>
                            </div>

                            <div className="metric-card">
                                <div className="metric-icon-wrap icon-staff">
                                    <EngineeringIcon />
                                </div>
                                <div>
                                    <div className="metric-title">Staff / Technicians</div>
                                    <div className="metric-num text-emerald">{stats.staff}</div>
                                    <div className="metric-sub">Work Order & Shop Terminal</div>
                                </div>
                            </div>

                            <div className="metric-card">
                                <div className="metric-icon-wrap icon-owner">
                                    <DirectionsCarIcon />
                                </div>
                                <div>
                                    <div className="metric-title">Car Owners</div>
                                    <div className="metric-num text-blue">{stats.carOwners}</div>
                                    <div className="metric-sub">Client Portal & Invoices</div>
                                </div>
                            </div>

                            <div className="metric-card">
                                <div className="metric-icon-wrap icon-active">
                                    <CheckCircleIcon />
                                </div>
                                <div>
                                    <div className="metric-title">Active Accounts</div>
                                    <div className="metric-num text-success">{stats.active} / {stats.total}</div>
                                    <div className="metric-sub">Database Authorized</div>
                                </div>
                            </div>
                        </div>

                        {/* Filters and Search Toolbar */}
                        <div className="toolbar-row">
                            <div className="filter-chips">
                                <span className="filter-label">
                                    <FilterListIcon fontSize="small" /> Filter Role:
                                </span>
                                <button
                                    className={`filter-chip ${roleFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setRoleFilter('all')}
                                >
                                    All Users ({users.length})
                                </button>
                                <button
                                    className={`filter-chip chip-admin ${roleFilter === 'admin' ? 'active' : ''}`}
                                    onClick={() => setRoleFilter('admin')}
                                >
                                    Admins ({stats.admins})
                                </button>
                                <button
                                    className={`filter-chip chip-staff ${roleFilter === 'staff' ? 'active' : ''}`}
                                    onClick={() => setRoleFilter('staff')}
                                >
                                    Staff ({stats.staff})
                                </button>
                                <button
                                    className={`filter-chip chip-owner ${roleFilter === 'car_owner' ? 'active' : ''}`}
                                    onClick={() => setRoleFilter('car_owner')}
                                >
                                    Car Owners ({stats.carOwners})
                                </button>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="table-container">
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th>USER & EMAIL</th>
                                        <th>ROLE (ENUM)</th>
                                        <th>LINKED PROFILE / SCOPE</th>
                                        <th>STATUS</th>
                                        <th>LAST LOGIN</th>
                                        <th>CREATED</th>
                                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan="7" className="no-data-cell">
                                                Loading user accounts from PostgreSQL database...
                                            </td>
                                        </tr>
                                    ) : filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="no-data-cell">
                                                No user accounts in database. Click "CREATE ADMIN ACCOUNT" above to provision your first admin.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <tr key={user.user_id} className={!user.is_active ? 'row-suspended' : ''}>
                                                <td>
                                                    <div className="user-info-cell">
                                                        <div className={`user-avatar-circle avatar-${user.role}`}>
                                                            {user.role === 'admin' ? (
                                                                <AdminPanelSettingsIcon fontSize="small" />
                                                            ) : user.role === 'staff' ? (
                                                                <EngineeringIcon fontSize="small" />
                                                            ) : (
                                                                <DirectionsCarIcon fontSize="small" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="user-email-text">{user.email}</div>
                                                            <div className="user-id-text">USER_ID #{user.user_id}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`role-pill role-${user.role}`}>
                                                        {user.role === 'admin' && 'ADMIN'}
                                                        {user.role === 'staff' && 'STAFF'}
                                                        {user.role === 'car_owner' && 'CAR OWNER'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="linked-profile-info">
                                                        <span className="profile-name">{user.linkedName}</span>
                                                        {user.staff_id && (
                                                            <span className="foreign-key-tag">FK: staff_id #{user.staff_id}</span>
                                                        )}
                                                        {user.owner_id && (
                                                            <span className="foreign-key-tag">FK: owner_id #{user.owner_id}</span>
                                                        )}
                                                        {!user.staff_id && !user.owner_id && (
                                                            <span className="foreign-key-tag admin-key-tag">Root Authority</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`status-indicator ${user.is_active ? 'status-active' : 'status-inactive'}`}
                                                    >
                                                        <span className="status-dot"></span>
                                                        {user.is_active ? 'Active' : 'Suspended'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="timestamp-text">
                                                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="timestamp-text">
                                                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '--'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="actions-cell">
                                                        <button
                                                            className={`action-icon-btn ${user.is_active ? 'btn-warn' : 'btn-activate'}`}
                                                            title={user.is_active ? 'Suspend Account' : 'Activate Account'}
                                                            onClick={() => handleToggleStatus(user.user_id, user.is_active, user.email)}
                                                        >
                                                            {user.is_active ? (
                                                                <BlockIcon fontSize="small" />
                                                            ) : (
                                                                <CheckCircleIcon fontSize="small" />
                                                            )}
                                                        </button>

                                                        <button
                                                            className="action-icon-btn btn-danger"
                                                            title="Revoke & Delete Account"
                                                            onClick={() => handleDeleteUser(user.user_id, user.email)}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Database Constraint Banner */}
                        <div className="schema-info-card">
                            <div className="schema-info-header">
                                <KeyIcon fontSize="small" />
                                <span>Database Integrity Constraint Enforced: chk_user_profile_alignment</span>
                            </div>
                            <p className="schema-info-text">
                                Credentials in <code>public.users</code> strictly adhere to PostgreSQL specifications: <code>role = 'staff'</code> requires <code>staff_id</code>, <code>role = 'car_owner'</code> requires <code>owner_id</code>, and <code>role = 'admin'</code> holds master root authority.
                            </p>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal: Create / Provision User Account */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <div className="modal-icon">
                                    {formData.role === 'admin' ? (
                                        <AdminPanelSettingsIcon />
                                    ) : (
                                        <PersonAddIcon />
                                    )}
                                </div>
                                <div>
                                    <h3 className="modal-title">
                                        {formData.role === 'admin' ? 'Create Admin Superuser Account' : 'Provision User Account'}
                                    </h3>
                                    <p className="modal-subtitle">
                                        Write directly to PostgreSQL <code>users</code> table
                                    </p>
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={handleCloseModal}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="modal-form">
                            {/* Role Selector Tabs */}
                            <div className="form-group">
                                <label className="form-label">
                                    <SecurityIcon className="label-icon" fontSize="inherit" />
                                    Select User Role (user_role_enum)
                                </label>
                                <div className="role-selector-tabs">
                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'admin' ? 'active-admin' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'admin',
                                                staff_id: '',
                                                owner_id: '',
                                                email: prev.email || 'admin@precision.garage',
                                            }))
                                        }
                                    >
                                        <AdminPanelSettingsIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">ADMIN</div>
                                            <div className="tab-desc">Superuser Authority</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'staff' ? 'active-staff' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'staff',
                                                staff_id: '',
                                                owner_id: '',
                                            }))
                                        }
                                    >
                                        <EngineeringIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">STAFF</div>
                                            <div className="tab-desc">Shop & Work Orders</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'car_owner' ? 'active-owner' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'car_owner',
                                                staff_id: '',
                                                owner_id: '',
                                            }))
                                        }
                                    >
                                        <DirectionsCarIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">CAR OWNER</div>
                                            <div className="tab-desc">Customer Portal</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Conditional Profile Link Selection based on Role */}
                            {formData.role === 'staff' && (
                                <div className="form-group highlighted-field">
                                    <label className="form-label" htmlFor="staff_id">
                                        <BadgeIcon className="label-icon" fontSize="inherit" />
                                        Link to Existing Staff Profile (staff_data table) *
                                    </label>
                                    <select
                                        id="staff_id"
                                        name="staff_id"
                                        value={formData.staff_id}
                                        onChange={handleFormChange}
                                        required
                                        className="form-input"
                                    >
                                        <option value="">-- Choose Staff Personnel --</option>
                                        {staffProfiles.map((s) => (
                                            <option key={s.staff_id} value={s.staff_id}>
                                                ID #{s.staff_id} - {s.name} ({s.role}) - {s.email}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="field-hint">Enforces FOREIGN KEY references <code>staff_data(staff_id)</code></span>
                                </div>
                            )}

                            {formData.role === 'car_owner' && (
                                <div className="form-group highlighted-field">
                                    <label className="form-label" htmlFor="owner_id">
                                        <DirectionsCarIcon className="label-icon" fontSize="inherit" />
                                        Link to Existing Car Owner Profile (car_owners table) *
                                    </label>
                                    <select
                                        id="owner_id"
                                        name="owner_id"
                                        value={formData.owner_id}
                                        onChange={handleFormChange}
                                        required
                                        className="form-input"
                                    >
                                        <option value="">-- Choose Car Owner --</option>
                                        {ownerProfiles.map((o) => (
                                            <option key={o.owner_id} value={o.owner_id}>
                                                ID #{o.owner_id} - {o.name} ({o.phone}) - {o.email}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="field-hint">Enforces FOREIGN KEY references <code>car_owners(owner_id)</code></span>
                                </div>
                            )}

                            {/* Email Address */}
                            <div className="form-group">
                                <label className="form-label" htmlFor="email">
                                    <span className="material-symbols-outlined label-icon">mail</span>
                                    Account Email Address (Unique) *
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    placeholder="user@precision.garage"
                                    value={formData.email}
                                    onChange={handleFormChange}
                                    required
                                    className="form-input"
                                />
                            </div>

                            {/* Password with Visibility Toggle */}
                            <div className="form-group">
                                <label className="form-label" htmlFor="password">
                                    <KeyIcon className="label-icon" fontSize="inherit" />
                                    Initial Passcode / Password *
                                </label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        placeholder={showPassword ? 'Enter account password' : '••••••••••••'}
                                        value={formData.password}
                                        onChange={handleFormChange}
                                        required
                                        className="form-input password-input-field"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? (
                                            <VisibilityOffIcon fontSize="small" />
                                        ) : (
                                            <VisibilityIcon fontSize="small" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Active Status Checkbox */}
                            <div className="form-checkbox-row">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={formData.is_active}
                                        onChange={handleFormChange}
                                    />
                                    <span>Enable account immediately (<code>is_active = TRUE</code>)</span>
                                </label>
                            </div>

                            {/* Action Buttons */}
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn-submit ${formData.role === 'admin' ? 'btn-submit-admin' : ''}`}
                                >
                                    {formData.role === 'admin' ? 'CREATE ADMIN ACCOUNT' : 'PROVISION USER'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
