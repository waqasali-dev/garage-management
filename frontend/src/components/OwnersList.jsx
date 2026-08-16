import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import StarIcon from '@mui/icons-material/Star';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import './css/OwnersList.css';

const API_BASE_URL = 'http://localhost:5000/api';

const INITIAL_OWNER_FORM = {
    owner_name: '',
    email: '',
    password: '',
    owner_phone: '',
    owner_address: '',
    owner_is_vip: false,
    is_active: true,
};

export default function OwnersList() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [owners, setOwners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'vip'
    const [notification, setNotification] = useState(null);

    // Modal state for Add Owner
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_OWNER_FORM);
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const fetchOwners = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/owners`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setOwners(json.data);
                }
            } else {
                showNotification('Failed to fetch owners list', 'error');
            }
        } catch (err) {
            console.error('Error fetching owners:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOwners();
    }, []);

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleCreateOwnerAccount = async (e) => {
        e.preventDefault();

        if (!formData.owner_name.trim() || !formData.email.trim() || !formData.password.trim() || !formData.owner_phone.trim()) {
            showNotification('Full Name, Phone, Email, and Password are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/admin/create-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'car_owner',
                    email: formData.email.trim(),
                    password: formData.password,
                    is_active: formData.is_active,
                    owner_name: formData.owner_name.trim(),
                    owner_phone: formData.owner_phone.trim(),
                    owner_address: formData.owner_address.trim(),
                    owner_is_vip: formData.owner_is_vip,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to create owner account', 'error');
                return;
            }

            showNotification(`🎉 Car Owner account for ${formData.owner_name} created successfully!`, 'success');
            setIsModalOpen(false);
            setFormData(INITIAL_OWNER_FORM);
            fetchOwners();
        } catch (err) {
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredOwners = owners.filter((owner) => {
        const query = searchTerm.toLowerCase();
        const matchesSearch =
            (owner.name || '').toLowerCase().includes(query) ||
            (owner.id || '').toLowerCase().includes(query) ||
            (owner.phone || '').toLowerCase().includes(query) ||
            (owner.email || '').toLowerCase().includes(query) ||
            (owner.vehicle || '').toLowerCase().includes(query);

        if (!matchesSearch) return false;

        if (activeFilter === 'active') return owner.isActive;
        if (activeFilter === 'vip') return owner.is_vip;
        return true;
    });

    return (
        <div className="owners-layout">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport */}
            <div className="owners-wrapper">
                {/* Header Bar */}
                <header className="owners-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>

                        <div className="header-search">
                            <SearchIcon className="search-icon" fontSize="small" />
                            <input
                                type="text"
                                placeholder="Search client name, phone, VIN, or vehicle..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-right">
                        <button className="icon-btn" onClick={fetchOwners} title="Refresh Live Data">
                            <RefreshIcon fontSize="small" />
                        </button>
                        <button className="icon-btn" aria-label="Notifications">
                            <NotificationsIcon fontSize="small" />
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="owners-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`owners-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Page Header */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Client Directory</h2>
                                <p className="page-subtitle">
                                    Manage registered vehicle owners, VIP profiles, vehicle fleets, and portal accounts.
                                </p>
                            </div>

                            <div className="header-action-group">
                                <button
                                    type="button"
                                    className="primary-btn"
                                    onClick={() => setIsModalOpen(true)}
                                >
                                    <PersonAddIcon fontSize="small" />
                                    <span>REGISTER NEW OWNER</span>
                                </button>
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="filter-tabs-bar">
                            <button
                                className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('all')}
                            >
                                All Clients ({owners.length})
                            </button>
                            <button
                                className={`filter-tab ${activeFilter === 'active' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('active')}
                            >
                                Active in Workshop ({owners.filter((o) => o.isActive).length})
                            </button>
                            <button
                                className={`filter-tab ${activeFilter === 'vip' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('vip')}
                            >
                                VIP Clients ({owners.filter((o) => o.is_vip).length})
                            </button>
                        </div>

                        {/* Data Table */}
                        <div className="table-card">
                            <div className="table-responsive">
                                <table className="owners-table">
                                    <thead>
                                        <tr>
                                            <th>OWNER ID / NAME</th>
                                            <th>CONTACT DETAILS</th>
                                            <th>REGISTERED VEHICLES</th>
                                            <th>STATUS</th>
                                            <th>LIFETIME SPENT</th>
                                            <th className="text-right">ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="6" className="empty-table-state">
                                                    Loading client directory from PostgreSQL...
                                                </td>
                                            </tr>
                                        ) : filteredOwners.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="empty-table-state">
                                                    No clients found matching the search query. Click "Register New Owner" above to add one.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredOwners.map((owner) => (
                                                <tr
                                                    key={owner.id}
                                                    className="table-row"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => navigate(`/owners/${owner.id}`)}
                                                >
                                                    <td>
                                                        <div className="owner-profile-cell">
                                                            <div className="avatar-circle">
                                                                {owner.initials}
                                                                {owner.is_vip && <span className="vip-star">★</span>}
                                                            </div>
                                                            <div>
                                                                <div className="owner-name">
                                                                    {owner.name}
                                                                    {owner.is_vip && (
                                                                        <span className="vip-badge-tag">VIP</span>
                                                                    )}
                                                                </div>
                                                                <div className="owner-id-sub font-mono">{owner.id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="contact-cell font-mono">
                                                            <span>📞 {owner.phone}</span>
                                                            {owner.email && <span className="email-sub">📧 {owner.email}</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="vehicle-cell">
                                                            <DirectionsCarIcon className="vehicle-icon" fontSize="small" />
                                                            <div>
                                                                <div className="vehicle-title">{owner.vehicle}</div>
                                                                <div className="vehicle-meta-sub font-mono">
                                                                    {owner.vehicles_count > 1 ? `+${owner.vehicles_count - 1} other vehicles` : owner.vin}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`status-pill status-${owner.statusType}`}>
                                                            {owner.isActive && <span className="pulse-dot"></span>}
                                                            {owner.lastService}
                                                        </span>
                                                    </td>
                                                    <td className="font-mono text-yellow" style={{ fontWeight: 700 }}>
                                                        {owner.lifetime_spent}
                                                    </td>
                                                    <td className="text-right">
                                                        <button
                                                            type="button"
                                                            className="view-details-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/owners/${owner.id}`);
                                                            }}
                                                            title="View Client Profile & Vehicles"
                                                        >
                                                            <ArrowForwardIcon fontSize="small" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination info */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing {filteredOwners.length} of {owners.length} registered clients
                                </span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal Overlay: Register Car Owner */}
            {isModalOpen && (
                <div className="owner-modal-overlay">
                    <div className="owner-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-icon">person_add</span>
                                <div>
                                    <h3 className="modal-title">Register New Car Owner Account</h3>
                                    <p className="modal-subtitle">Creates <code>car_owners</code> profile and customer login account</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCreateOwnerAccount} className="owner-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group grid-full">
                                    <label htmlFor="owner_name">CLIENT FULL NAME *</label>
                                    <input
                                        type="text"
                                        id="owner_name"
                                        name="owner_name"
                                        placeholder="e.g. Sarah Jenkins"
                                        value={formData.owner_name}
                                        onChange={handleFormChange}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="owner_phone">PHONE NUMBER *</label>
                                    <input
                                        type="text"
                                        id="owner_phone"
                                        name="owner_phone"
                                        placeholder="(555) 012-3456"
                                        value={formData.owner_phone}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">EMAIL ADDRESS (LOGIN) *</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="sarah.j@example.com"
                                        value={formData.email}
                                        onChange={handleFormChange}
                                        required
                                    />
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="password">ACCOUNT PASSWORD *</label>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            placeholder="Secure password for customer portal"
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

                                <div className="form-group grid-full">
                                    <label htmlFor="owner_address">BILLING & RESIDENTIAL ADDRESS</label>
                                    <input
                                        type="text"
                                        id="owner_address"
                                        name="owner_address"
                                        placeholder="442 Horizon Ridge Pkwy, Suite 400"
                                        value={formData.owner_address}
                                        onChange={handleFormChange}
                                    />
                                </div>

                                <div className="form-group grid-full toggle-row">
                                    <label className="toggle-label">
                                        <input
                                            type="checkbox"
                                            name="owner_is_vip"
                                            checked={formData.owner_is_vip}
                                            onChange={handleFormChange}
                                        />
                                        <span>Mark as VIP Client (Priority Workshop Queue)</span>
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Registering...' : 'Register Car Owner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}