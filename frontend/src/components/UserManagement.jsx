import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SecurityIcon from '@mui/icons-material/Security';
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
import PhoneIcon from '@mui/icons-material/Phone';
import HomeIcon from '@mui/icons-material/Home';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StarIcon from '@mui/icons-material/Star';
import './css/UserManagement.css';

const API_BASE_URL = 'http://localhost:5000/api';

const INITIAL_FORM_STATE = {
    role: 'admin',
    email: '',
    password: '',
    is_active: true,
    // staff_data fields
    staff_name: '',
    staff_role: 'Lead Technician',
    staff_phone: '',
    staff_address: '',
    staff_hourly_rate: '35.00',
    // car_owners fields
    owner_name: '',
    owner_phone: '',
    owner_address: '',
    owner_is_vip: false,
};

export default function UserManagement() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dbConnected, setDbConnected] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Load live user data from PostgreSQL database via Express API
    const loadDatabaseData = async () => {
        setIsLoading(true);
        try {
            const healthRes = await fetch(`${API_BASE_URL}/health`);
            if (healthRes.ok) {
                setDbConnected(true);
            } else {
                setDbConnected(false);
            }

            const usersRes = await fetch(`${API_BASE_URL}/users`);
            if (usersRes.ok) {
                const usersJson = await usersRes.json();
                if (usersJson.success && Array.isArray(usersJson.data)) {
                    setUsers(usersJson.data);
                }
            }
        } catch (err) {
            console.warn('Backend server connecting / not reachable:', err.message);
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
            ...INITIAL_FORM_STATE,
            role: presetRole,
            email: presetRole === 'admin' ? 'superadmin@precision.garage' : '',
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

            if (name === 'role') {
                updated.email = value === 'admin' ? 'admin@precision.garage' : '';
            }

            return updated;
        });
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();

        // Validation for Staff
        if (formData.role === 'staff') {
            if (!formData.staff_name.trim() || !formData.staff_role.trim() || !formData.email.trim()) {
                showNotification('Please provide Staff Full Name, Role, and Email Address.', 'error');
                return;
            }
        }

        // Validation for Car Owner
        if (formData.role === 'car_owner') {
            if (!formData.owner_name.trim() || !formData.owner_phone.trim() || !formData.email.trim()) {
                showNotification('Please provide Owner Full Name, Phone Number, and Email Address.', 'error');
                return;
            }
        }

        if (!formData.password) {
            showNotification('Password is required to create a user account.', 'error');
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
                `🎉 Success: Created ${formData.role.toUpperCase()} account for [${data.user?.email || formData.email}] in PostgreSQL!`,
                'success'
            );
            setIsModalOpen(false);
            loadDatabaseData(); // Reload list directly from database
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
                                placeholder="Search email or name..."
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
                                        SUPERADMIN ACCESS CONTROL
                                    </span>
                                </div>
                                <h2 className="page-title">User Accounts & Role Management</h2>
                                <p className="page-subtitle">
                                    Create and manage accounts stored in PostgreSQL <code>users</code>, <code>staff_data</code>, and <code>car_owners</code> tables.
                                </p>
                            </div>

                            <div className="action-button-group">
                                <button
                                    type="button"
                                    className="primary-btn admin-create-btn"
                                    onClick={() => handleOpenModal('admin')}
                                >
                                    <AdminPanelSettingsIcon fontSize="small" />
                                    <span>CREATE ADMIN</span>
                                </button>

                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => handleOpenModal('staff')}
                                >
                                    <EngineeringIcon fontSize="small" />
                                    <span>CREATE STAFF USER</span>
                                </button>

                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => handleOpenModal('car_owner')}
                                >
                                    <DirectionsCarIcon fontSize="small" />
                                    <span>CREATE CAR OWNER USER</span>
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
                                    <div className="metric-title">Staff Members</div>
                                    <div className="metric-num text-emerald">{stats.staff}</div>
                                    <div className="metric-sub">Stored in staff_data</div>
                                </div>
                            </div>

                            <div className="metric-card">
                                <div className="metric-icon-wrap icon-owner">
                                    <DirectionsCarIcon />
                                </div>
                                <div>
                                    <div className="metric-title">Car Owners</div>
                                    <div className="metric-num text-blue">{stats.carOwners}</div>
                                    <div className="metric-sub">Stored in car_owners</div>
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
                                        <th>ROLE</th>
                                        <th>PROFILE & RECORD DETAILS</th>
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
                                                No user accounts in PostgreSQL. Click "CREATE ADMIN", "CREATE STAFF USER", or "CREATE CAR OWNER USER" above to add accounts.
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
                                                            <span className="foreign-key-tag">
                                                                <code>staff_data.staff_id #{user.staff_id}</code> {user.details && `• ${user.details}`}
                                                            </span>
                                                        )}
                                                        {user.owner_id && (
                                                            <span className="foreign-key-tag">
                                                                <code>car_owners.owner_id #{user.owner_id}</code> {user.details && `• ${user.details}`}
                                                            </span>
                                                        )}
                                                        {!user.staff_id && !user.owner_id && (
                                                            <span className="foreign-key-tag admin-key-tag">Root Superadmin Clearance</span>
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
                                <span>Relational Integrity (staff_data & car_owners tables)</span>
                            </div>
                            <p className="schema-info-text">
                                PostgreSQL <code>users</code> table enforces <code>chk_user_profile_alignment</code>: Staff records are inserted into <code>staff_data</code> and linked via <code>staff_id</code>, Car Owner records are inserted into <code>car_owners</code> and linked via <code>owner_id</code>, and Admin accounts hold root authority.
                            </p>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal: Create User Account & Entity Profile */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content modal-large">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <div className="modal-icon">
                                    {formData.role === 'admin' ? (
                                        <AdminPanelSettingsIcon />
                                    ) : formData.role === 'staff' ? (
                                        <EngineeringIcon />
                                    ) : (
                                        <DirectionsCarIcon />
                                    )}
                                </div>
                                <div>
                                    <h3 className="modal-title">
                                        {formData.role === 'admin' && 'Create Admin Account'}
                                        {formData.role === 'staff' && 'Create Staff Member (staff_data & users)'}
                                        {formData.role === 'car_owner' && 'Create Car Owner (car_owners & users)'}
                                    </h3>
                                    <p className="modal-subtitle">
                                        Insert record directly into PostgreSQL <code>{formData.role === 'staff' ? 'staff_data & users' : formData.role === 'car_owner' ? 'car_owners & users' : 'users'}</code>
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
                                    Select Target Role (user_role_enum)
                                </label>
                                <div className="role-selector-tabs">
                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'admin' ? 'active-admin' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'admin',
                                                email: 'admin@precision.garage',
                                            }))
                                        }
                                    >
                                        <AdminPanelSettingsIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">ADMIN</div>
                                            <div className="tab-desc">Root Authority</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'staff' ? 'active-staff' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'staff',
                                                email: '',
                                            }))
                                        }
                                    >
                                        <EngineeringIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">STAFF</div>
                                            <div className="tab-desc">staff_data Table</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`role-tab ${formData.role === 'car_owner' ? 'active-owner' : ''}`}
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                role: 'car_owner',
                                                email: '',
                                            }))
                                        }
                                    >
                                        <DirectionsCarIcon fontSize="small" />
                                        <div>
                                            <div className="tab-title">CAR OWNER</div>
                                            <div className="tab-desc">car_owners Table</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* ========================================================= */}
                            {/* 1. STAFF SPECIFIC SECTION (staff_data)                     */}
                            {/* ========================================================= */}
                            {formData.role === 'staff' && (
                                <div className="profile-section-box">
                                    <div className="subform-grid">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="staff_name">
                                                Staff Full Name (staff_data.full_name) *
                                            </label>
                                            <input
                                                type="text"
                                                id="staff_name"
                                                name="staff_name"
                                                placeholder="e.g. Marcus Vance"
                                                value={formData.staff_name}
                                                onChange={handleFormChange}
                                                required
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" htmlFor="staff_role">
                                                Staff Role / Designation *
                                            </label>
                                            <select
                                                id="staff_role"
                                                name="staff_role"
                                                value={formData.staff_role}
                                                onChange={handleFormChange}
                                                required
                                                className="form-input"
                                            >
                                                <option value="Lead Technician">Lead Technician</option>
                                                <option value="Diagnostics Tech">Diagnostics Tech</option>
                                                <option value="Service Advisor">Service Advisor</option>
                                                <option value="Master Mechanic">Master Mechanic</option>
                                                <option value="Junior Mechanic">Junior Mechanic</option>
                                                <option value="Shop Manager">Shop Manager</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" htmlFor="staff_phone">
                                                <PhoneIcon fontSize="inherit" /> Phone Number (staff_data.phone_number)
                                            </label>
                                            <input
                                                type="text"
                                                id="staff_phone"
                                                name="staff_phone"
                                                placeholder="(555) 234-5678"
                                                value={formData.staff_phone}
                                                onChange={handleFormChange}
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" htmlFor="staff_hourly_rate">
                                                <AttachMoneyIcon fontSize="inherit" /> Hourly Rate ($/hr)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.50"
                                                id="staff_hourly_rate"
                                                name="staff_hourly_rate"
                                                placeholder="35.00"
                                                value={formData.staff_hourly_rate}
                                                onChange={handleFormChange}
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-group grid-full">
                                            <label className="form-label" htmlFor="staff_address">
                                                <HomeIcon fontSize="inherit" /> Residential Address (staff_data.residential_address)
                                            </label>
                                            <input
                                                type="text"
                                                id="staff_address"
                                                name="staff_address"
                                                placeholder="123 Industrial Way, Suite 4B"
                                                value={formData.staff_address}
                                                onChange={handleFormChange}
                                                className="form-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ========================================================= */}
                            {/* 2. CAR OWNER SPECIFIC SECTION (car_owners)                */}
                            {/* ========================================================= */}
                            {formData.role === 'car_owner' && (
                                <div className="profile-section-box">
                                    <div className="subform-grid">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="owner_name">
                                                Owner Full Name (car_owners.full_name) *
                                            </label>
                                            <input
                                                type="text"
                                                id="owner_name"
                                                name="owner_name"
                                                placeholder="e.g. Sarah Jenkins"
                                                value={formData.owner_name}
                                                onChange={handleFormChange}
                                                required
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" htmlFor="owner_phone">
                                                <PhoneIcon fontSize="inherit" /> Phone Number (car_owners.phone_number) *
                                            </label>
                                            <input
                                                type="text"
                                                id="owner_phone"
                                                name="owner_phone"
                                                placeholder="(555) 012-3456"
                                                value={formData.owner_phone}
                                                onChange={handleFormChange}
                                                required
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-group grid-full">
                                            <label className="form-label" htmlFor="owner_address">
                                                <HomeIcon fontSize="inherit" /> Billing Address (car_owners.billing_address)
                                            </label>
                                            <input
                                                type="text"
                                                id="owner_address"
                                                name="owner_address"
                                                placeholder="742 Evergreen Terrace, Springfield"
                                                value={formData.owner_address}
                                                onChange={handleFormChange}
                                                className="form-input"
                                            />
                                        </div>

                                        <div className="form-checkbox-row grid-full">
                                            <label className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    name="owner_is_vip"
                                                    checked={formData.owner_is_vip}
                                                    onChange={handleFormChange}
                                                />
                                                <span className="vip-text">
                                                    <StarIcon fontSize="inherit" /> Mark as VIP Customer (<code>car_owners.is_vip = TRUE</code>)
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ========================================================= */}
                            {/* 3. USER ACCOUNT CREDENTIALS (users table)                 */}
                            {/* ========================================================= */}
                            <div className="credentials-section-box">
                                <div className="section-title">
                                    <KeyIcon fontSize="small" />
                                    <span>Account Authentication Details (users table)</span>
                                </div>

                                <div className="subform-grid">
                                    {/* Email Address */}
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="email">
                                            <span className="material-symbols-outlined label-icon">mail</span>
                                            Login Email (users.email) *
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
                                            Password / Passcode *
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
                                </div>

                                {/* Active Status Checkbox */}
                                <div className="form-checkbox-row" style={{ marginTop: '8px' }}>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="is_active"
                                            checked={formData.is_active}
                                            onChange={handleFormChange}
                                        />
                                        <span>Enable account login immediately (<code>is_active = TRUE</code>)</span>
                                    </label>
                                </div>
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
                                    {formData.role === 'admin'
                                        ? 'CREATE ADMIN ACCOUNT'
                                        : formData.role === 'staff'
                                        ? 'CREATE STAFF & USER'
                                        : 'CREATE OWNER & USER'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
