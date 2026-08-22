import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import StarIcon from '@mui/icons-material/Star';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import './css/OwnersList.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

const INITIAL_OWNER_FORM = {
    existing_owner_id: '',
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

    // "Already Customer" linking state
    const [isAlreadyCustomer, setIsAlreadyCustomer] = useState(false);
    const [unlinkedOwners, setUnlinkedOwners] = useState([]);
    const [showEmailDropdown, setShowEmailDropdown] = useState(false);
    const emailDropdownRef = useRef(null);

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

    // Fetch unlinked customers
    const fetchUnlinkedOwners = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/owners/unlinked`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setUnlinkedOwners(json.data);
                }
            }
        } catch (err) {
            console.error('Error fetching unlinked customers:', err);
        }
    };

    useEffect(() => {
        fetchOwners();
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (emailDropdownRef.current && !emailDropdownRef.current.contains(e.target)) {
                setShowEmailDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOpenModal = () => {
        setFormData(INITIAL_OWNER_FORM);
        setIsAlreadyCustomer(false);
        setShowEmailDropdown(false);
        setShowPassword(false);
        setIsModalOpen(true);
        fetchUnlinkedOwners();
    };

    const handleToggleAlreadyCustomer = (e) => {
        const checked = e.target.checked;
        setIsAlreadyCustomer(checked);
        if (checked) {
            fetchUnlinkedOwners();
            setShowEmailDropdown(true);
        } else {
            setShowEmailDropdown(false);
            setFormData((prev) => ({
                ...prev,
                existing_owner_id: '',
            }));
        }
    };

    const handleSelectUnlinkedOwner = (owner) => {
        setFormData((prev) => ({
            ...prev,
            existing_owner_id: owner.owner_id,
            owner_name: owner.full_name || '',
            owner_phone: owner.phone_number || '',
            email: owner.email_address || '',
            owner_address: owner.billing_address || '',
            owner_is_vip: Boolean(owner.is_vip),
        }));
        setShowEmailDropdown(false);
        showNotification(`✓ Linked intake profile for ${owner.full_name} (${owner.owner_id})`, 'info');
    };

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
                    existing_owner_id: formData.existing_owner_id || null,
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
            setIsAlreadyCustomer(false);
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
            {/* Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="owners-wrapper">
                {/* Desktop Header Bar */}
                <header className="owners-header hide-mobile">
                    <div className="header-search">
                        <SearchIcon className="search-icon" fontSize="small" />
                        <input
                            type="text"
                            placeholder="Search by owner name, phone, VIN, or vehicle..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchOwners} title="Refresh Directory">
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Mobile Header Bar */}
                <header className="owners-header-mobile">
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setIsSidebarOpen(true)}
                        aria-label="Open Navigation Menu"
                    >
                        <MenuIcon fontSize="small" />
                    </button>
                    <h1 className="mobile-title">Car Owners</h1>
                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchOwners}>
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="owners-main">
                    {/* Toast Notification Banner */}
                    {notification && (
                        <div className={`notification-banner ${notification.type} animate-slide-down`}>
                            <span>{notification.msg}</span>
                            <button className="notif-close" onClick={() => setNotification(null)}>✕</button>
                        </div>
                    )}

                    <div className="content-container">
                        {/* Page Header */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Clients & Car Owners</h2>
                                <p className="page-subtitle">
                                    Customer profiles, contact details, vehicle fleet records, and portal access accounts.
                                </p>
                            </div>

                            <button className="primary-btn" onClick={handleOpenModal}>
                                <PersonAddIcon fontSize="small" />
                                <span>Register Car Owner</span>
                            </button>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <span className="kpi-title font-mono">TOTAL CLIENTS</span>
                                <span className="kpi-value">{owners.length}</span>
                                <span className="kpi-subtext">Registered car owners</span>
                            </div>

                            <div className="kpi-card">
                                <span className="kpi-title font-mono">IN-SHOP CLIENTS</span>
                                <span className="kpi-value text-yellow">
                                    {owners.filter((o) => o.isActive).length}
                                </span>
                                <span className="kpi-subtext">Active repairs ongoing</span>
                            </div>

                            <div className="kpi-card">
                                <span className="kpi-title font-mono">VIP CLIENTS</span>
                                <span className="kpi-value" style={{ color: 'var(--accent-yellow)' }}>
                                    {owners.filter((o) => o.is_vip).length}
                                </span>
                                <span className="kpi-subtext">Priority service tier</span>
                            </div>
                        </div>

                        {/* Filter Tabs & Search Summary */}
                        <div className="filter-bar">
                            <div className="filter-pills">
                                <button
                                    type="button"
                                    className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('all')}
                                >
                                    All Clients ({owners.length})
                                </button>
                                <button
                                    type="button"
                                    className={`filter-pill ${activeFilter === 'active' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('active')}
                                >
                                    In-Shop Active ({owners.filter((o) => o.isActive).length})
                                </button>
                                <button
                                    type="button"
                                    className={`filter-pill ${activeFilter === 'vip' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('vip')}
                                >
                                    VIP Tier ({owners.filter((o) => o.is_vip).length})
                                </button>
                            </div>
                        </div>

                        {/* Owners Grid */}
                        <div className="owners-grid">
                            {isLoading ? (
                                <div className="loading-state">
                                    <p className="font-mono">Loading car owners directory...</p>
                                </div>
                            ) : filteredOwners.length === 0 ? (
                                <div className="empty-state">
                                    <DirectionsCarIcon style={{ fontSize: '48px', opacity: 0.4 }} />
                                    <p style={{ marginTop: '12px' }}>No car owners found matching your criteria.</p>
                                    <button className="secondary-btn" onClick={handleOpenModal} style={{ marginTop: '8px' }}>
                                        + Register First Car Owner
                                    </button>
                                </div>
                            ) : (
                                filteredOwners.map((owner) => (
                                    <div
                                        key={owner.id}
                                        className="owner-card"
                                        onClick={() => navigate(`/owners/${owner.id}`)}
                                    >
                                        <div className="owner-card-header">
                                            <div className="owner-avatar-group">
                                                <div className="owner-avatar">{owner.initials}</div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <h3 className="owner-name">{owner.name}</h3>
                                                        {owner.is_vip && (
                                                            <StarIcon
                                                                style={{
                                                                    fontSize: '16px',
                                                                    color: 'var(--accent-yellow)',
                                                                }}
                                                                titleAccess="VIP Client"
                                                            />
                                                        )}
                                                    </div>
                                                    <span className="owner-id font-mono">{owner.id}</span>
                                                </div>
                                            </div>
                                            <span className={`status-badge badge-${owner.statusType}`}>
                                                {owner.lastService}
                                            </span>
                                        </div>

                                        <div className="owner-card-body">
                                            <div className="vehicle-info-box">
                                                <DirectionsCarIcon className="vehicle-icon" />
                                                <div className="vehicle-details">
                                                    <span className="vehicle-title">{owner.vehicle}</span>
                                                    {owner.vin && <span className="vehicle-vin font-mono">{owner.vin}</span>}
                                                </div>
                                                {owner.additionalVehicles > 0 && (
                                                    <span className="add-vehicle-pill font-mono">
                                                        +{owner.additionalVehicles}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="contact-info">
                                                <div className="contact-row">
                                                    <span className="contact-label font-mono">PHONE:</span>
                                                    <span className="contact-value font-mono">{owner.phone}</span>
                                                </div>
                                                {owner.email && (
                                                    <div className="contact-row">
                                                        <span className="contact-label font-mono">EMAIL:</span>
                                                        <span className="contact-value">{owner.email}</span>
                                                    </div>
                                                )}
                                                <div className="contact-row">
                                                    <span className="contact-label font-mono">LIFETIME SPENT:</span>
                                                    <span className="contact-value font-mono text-yellow" style={{ fontWeight: 700 }}>
                                                        {owner.lifetime_spent}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="owner-card-footer">
                                            <span className="portal-status font-mono">
                                                {owner.has_user_account ? '🔑 Portal Active' : '⚪ No Portal Account'}
                                            </span>
                                            <span className="view-detail-link">
                                                <span>View Client Profile</span>
                                                <ArrowForwardIcon fontSize="inherit" />
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
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
                                    <h3 className="modal-title">Register Car Owner Account</h3>
                                    <p className="modal-subtitle">
                                        Creates <code>car_owners</code> profile and customer login account
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCreateOwnerAccount} className="owner-modal-form">
                            <div className="form-grid-2col">
                                {/* "Already Customer" Linking Checkbox */}
                                <div className="form-group grid-full toggle-row already-customer-box">
                                    <label className="toggle-label">
                                        <input
                                            type="checkbox"
                                            checked={isAlreadyCustomer}
                                            onChange={handleToggleAlreadyCustomer}
                                        />
                                        <span style={{ fontWeight: 700, color: 'var(--accent-yellow)' }}>
                                            Already Customer (Link Existing Intake Profile)
                                        </span>
                                    </label>
                                    <span className="already-customer-hint font-mono">
                                        Select customers created during vehicle intake without portal accounts
                                    </span>
                                </div>

                                {formData.existing_owner_id && (
                                    <div className="form-group grid-full linked-pill-banner">
                                        <CheckCircleIcon fontSize="small" style={{ color: 'var(--status-success)' }} />
                                        <span>
                                            Linked to Existing Customer: <strong>{formData.existing_owner_id}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            className="unlink-btn font-mono"
                                            onClick={() => setFormData((prev) => ({ ...prev, existing_owner_id: '' }))}
                                        >
                                            Change / Unlink
                                        </button>
                                    </div>
                                )}

                                <div className="form-group grid-full" ref={emailDropdownRef} style={{ position: 'relative' }}>
                                    <label htmlFor="email">EMAIL ADDRESS (LOGIN) *</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="sarah.j@example.com"
                                        value={formData.email}
                                        onChange={handleFormChange}
                                        onFocus={() => {
                                            if (isAlreadyCustomer && unlinkedOwners.length > 0) {
                                                setShowEmailDropdown(true);
                                            }
                                        }}
                                        required
                                        autoFocus
                                    />

                                    {/* Unlinked Customers Autocomplete Dropdown */}
                                    {isAlreadyCustomer && showEmailDropdown && unlinkedOwners.length > 0 && (
                                        <div className="unlinked-owners-dropdown">
                                            <div className="dropdown-header font-mono">
                                                Existing Customers without Accounts ({unlinkedOwners.length})
                                            </div>
                                            <div className="dropdown-list">
                                                {unlinkedOwners
                                                    .filter(
                                                        (o) =>
                                                            !formData.email ||
                                                            (o.email_address || '').toLowerCase().includes(formData.email.toLowerCase()) ||
                                                            (o.full_name || '').toLowerCase().includes(formData.email.toLowerCase())
                                                    )
                                                    .map((owner) => (
                                                        <div
                                                            key={owner.owner_id}
                                                            className="dropdown-item"
                                                            onClick={() => handleSelectUnlinkedOwner(owner)}
                                                        >
                                                            <div className="item-main">
                                                                <span className="item-name">{owner.full_name}</span>
                                                                <span className="item-email font-mono">
                                                                    {owner.email_address || 'No Email on record'}
                                                                </span>
                                                            </div>
                                                            <div className="item-sub font-mono">
                                                                <span>{owner.owner_id}</span>
                                                                <span>•</span>
                                                                <span>{owner.phone_number}</span>
                                                                {owner.primary_vehicle && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>🚗 {owner.primary_vehicle}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

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
                                    <label htmlFor="password">PORTAL PASSWORD *</label>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            placeholder="Secure password"
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
                                    {isSubmitting ? 'Registering...' : formData.existing_owner_id ? 'Link & Create Account' : 'Register Car Owner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}