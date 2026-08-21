import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import './css/VehicleIntake.css';

const API_BASE_URL = 'http://localhost:5000/api';

const INITIAL_FORM_STATE = {
    vin: '',
    make: '',
    model: '',
    year: '',
    licensePlate: '',
    ownerSearch: '',
    fullName: '',
    phone: '',
    email: '',
    notes: '',
};

export default function VehicleIntake() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM_STATE);
    const [selectedOwnerId, setSelectedOwnerId] = useState(null);
    const [ownerSearchResults, setOwnerSearchResults] = useState([]);
    const [isSearchingOwners, setIsSearchingOwners] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState(null);
    const [intakeSuccessData, setIntakeSuccessData] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Live search for existing owners
    useEffect(() => {
        const query = formData.ownerSearch.trim();
        if (query.length < 2) {
            setOwnerSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingOwners(true);
            try {
                const res = await fetch(`${API_BASE_URL}/owners/search?query=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setOwnerSearchResults(data.data);
                    }
                }
            } catch (err) {
                console.warn('Owner search error:', err.message);
            } finally {
                setIsSearchingOwners(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [formData.ownerSearch]);

    // Handle VIN auto-lookup on 17 characters
    const handleVinBlur = async () => {
        const vin = formData.vin.trim().toUpperCase();
        if (vin.length === 17) {
            try {
                const res = await fetch(`${API_BASE_URL}/vehicles/vin/${encodeURIComponent(vin)}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json.found && json.data) {
                        const v = json.data;
                        setFormData((prev) => ({
                            ...prev,
                            make: v.make || prev.make,
                            model: v.model || prev.model,
                            year: v.year ? String(v.year) : prev.year,
                            licensePlate: v.license_plate || prev.licensePlate,
                            fullName: v.owner_name || prev.fullName,
                            phone: v.owner_phone || prev.phone,
                            email: v.owner_email || prev.email,
                        }));
                        if (v.owner_id) {
                            setSelectedOwnerId(v.owner_id);
                        }
                        showNotification(`Recognized existing vehicle ${v.year || ''} ${v.make || ''} ${v.model || ''}`, 'info');
                    }
                }
            } catch (err) {
                console.warn('VIN lookup notice:', err.message);
            }
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name === 'vin' || name === 'licensePlate' ? value.toUpperCase() : value,
        }));

        // Reset selected owner if user modifies owner fields manually
        if (name === 'fullName' || name === 'phone' || name === 'email') {
            setSelectedOwnerId(null);
        }
    };

    const handleSelectExistingOwner = (owner) => {
        setSelectedOwnerId(owner.owner_id);
        setFormData((prev) => ({
            ...prev,
            ownerSearch: '',
            fullName: owner.full_name,
            phone: owner.phone_number,
            email: owner.email_address || '',
        }));
        setOwnerSearchResults([]);
        showNotification(`Selected existing owner: ${owner.full_name} (${owner.owner_id})`, 'info');
    };

    const handleClearSelectedOwner = () => {
        setSelectedOwnerId(null);
        setFormData((prev) => ({
            ...prev,
            fullName: '',
            phone: '',
            email: '',
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.vin.trim() || !formData.make.trim() || !formData.model.trim() || !formData.year || !formData.licensePlate.trim()) {
            showNotification('Please fill in all vehicle identification details.', 'error');
            return;
        }

        if (!formData.fullName.trim() || !formData.phone.trim()) {
            showNotification('Owner Full Name and Phone Number are required.', 'error');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch(`${API_BASE_URL}/intake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vin: formData.vin,
                    make: formData.make,
                    model: formData.model,
                    year: formData.year,
                    licensePlate: formData.licensePlate,
                    fullName: formData.fullName,
                    phone: formData.phone,
                    email: formData.email,
                    selectedOwnerId,
                    notes: formData.notes,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                showNotification(data.error || 'Failed to complete vehicle intake.', 'error');
                return;
            }

            setIntakeSuccessData(data.data);
            showNotification(`🎉 Work Order ${data.data.work_order_id} created successfully!`, 'success');
        } catch (err) {
            showNotification(`Server error during intake: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetForm = () => {
        setFormData(INITIAL_FORM_STATE);
        setSelectedOwnerId(null);
        setIntakeSuccessData(null);
    };

    return (
        <div className="intake-layout">
            {/* Sidebar Navigation */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Content Viewport */}
            <div className="intake-wrapper">
                {/* Top App Bar Header */}
                <header className="intake-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">New Vehicle Intake</h2>
                    </div>

                    <div className="header-right">
                    </div>
                </header>

                {/* Scrollable Main Form Canvas */}
                <main className="intake-main">
                    {/* Toast Notification */}
                    {notification && (
                        <div className={`intake-toast intake-toast-${notification.type}`}>
                            <span className="material-symbols-outlined">
                                {notification.type === 'error' ? 'error' : notification.type === 'info' ? 'info' : 'check_circle'}
                            </span>
                            <span>{notification.msg}</span>
                        </div>
                    )}

                    <form id="intakeForm" onSubmit={handleSubmit} className="intake-grid">
                        {/* Section 1: Vehicle Identification */}
                        <section className="intake-card col-span-8">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    directions_car
                                </span>
                                <div>
                                    <h3>Vehicle Identification & Specifications</h3>
                                    <p className="card-desc">Enter vehicle VIN, year, make, model, and registration plate.</p>
                                </div>
                            </div>

                            <div className="form-grid">
                                {/* VIN Input */}
                                <div className="form-group col-span-12">
                                    <label htmlFor="vin">VIN (Vehicle Identification Number) *</label>
                                    <div className="input-with-action">
                                        <input
                                            type="text"
                                            id="vin"
                                            name="vin"
                                            maxLength={17}
                                            placeholder="ENTER 17-CHARACTER VIN (e.g. 1HGCR2F83HA001234)"
                                            value={formData.vin}
                                            onChange={handleChange}
                                            onBlur={handleVinBlur}
                                            className="uppercase-input font-mono"
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="input-action-btn"
                                            onClick={handleVinBlur}
                                            title="Lookup VIN in database"
                                        >
                                            <span className="material-symbols-outlined">search</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Make */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="make">MAKE *</label>
                                    <input
                                        type="text"
                                        id="make"
                                        name="make"
                                        placeholder="e.g., Toyota, BMW, Audi"
                                        value={formData.make}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                {/* Model */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="model">MODEL *</label>
                                    <input
                                        type="text"
                                        id="model"
                                        name="model"
                                        placeholder="e.g., Camry, M3, Q5"
                                        value={formData.model}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                {/* Year */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="year">YEAR (1900 - 2100) *</label>
                                    <input
                                        type="number"
                                        id="year"
                                        name="year"
                                        min="1900"
                                        max="2100"
                                        placeholder="e.g., 2024"
                                        value={formData.year}
                                        onChange={handleChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                {/* License Plate */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="licensePlate">LICENSE PLATE *</label>
                                    <input
                                        type="text"
                                        id="licensePlate"
                                        name="licensePlate"
                                        placeholder="e.g., 7XYZ890"
                                        value={formData.licensePlate}
                                        onChange={handleChange}
                                        className="uppercase-input font-mono"
                                        required
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Owner Details */}
                        <section className="intake-card col-span-4">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    person
                                </span>
                                <div>
                                    <h3>Customer & Owner Information</h3>
                                    <p className="card-desc">Search existing customer or enter new contact information.</p>
                                </div>
                            </div>

                            {/* Existing Owner Search Bar */}
                            <div className="form-group search-group" style={{ position: 'relative' }}>
                                <label>QUICK LOOKUP EXISTING OWNER</label>
                                <div className="search-input-wrapper">
                                    <span className="material-symbols-outlined search-icon">search</span>
                                    <input
                                        type="text"
                                        name="ownerSearch"
                                        placeholder="Search by name, phone, email, or ID..."
                                        value={formData.ownerSearch}
                                        onChange={handleChange}
                                    />
                                </div>

                                {/* Dropdown Search Results */}
                                {ownerSearchResults.length > 0 && (
                                    <div className="owner-search-dropdown">
                                        {ownerSearchResults.map((owner) => (
                                            <div
                                                key={owner.owner_id}
                                                className="owner-result-item"
                                                onClick={() => handleSelectExistingOwner(owner)}
                                            >
                                                <div className="owner-result-name">
                                                    <strong>{owner.full_name}</strong>
                                                    <span className="owner-result-id">{owner.owner_id}</span>
                                                </div>
                                                <div className="owner-result-details">
                                                    <span>{owner.phone_number}</span>
                                                    {owner.email_address && <span> • {owner.email_address}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selectedOwnerId && (
                                <div className="selected-owner-chip">
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-yellow)' }}>verified</span>
                                    <span style={{ fontSize: '12px', flex: 1 }}>Linked Owner: <strong>{selectedOwnerId}</strong></span>
                                    <button type="button" onClick={handleClearSelectedOwner} className="chip-remove-btn" title="Clear selection">
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                                    </button>
                                </div>
                            )}

                            <div className="divider">
                                <span>{selectedOwnerId ? 'OR EDIT OWNER DATA' : 'OR ENTER NEW OWNER'}</span>
                            </div>

                            <div className="form-stack">
                                <div className="form-group">
                                    <label htmlFor="fullName">FULL NAME *</label>
                                    <input
                                        type="text"
                                        id="fullName"
                                        name="fullName"
                                        placeholder="First & Last Name"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="phone">PHONE NUMBER *</label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        placeholder="(555) 012-3456"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">EMAIL ADDRESS</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="owner@example.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Notes & Initial Observations */}
                        <section className="intake-card col-span-12">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    assignment
                                </span>
                                <div>
                                    <h3>Initial Observations & Work Order Parameters</h3>
                                    <p className="card-desc">Record customer concerns, initial diagnostics, and intake notes.</p>
                                </div>
                            </div>

                            <div className="media-grid">
                                {/* Notes Column */}
                                <div className="form-group notes-group">
                                    <label htmlFor="notes">INITIAL OBSERVATIONS / CUSTOMER CONCERNS</label>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        rows={4}
                                        placeholder="Describe reason for visit, customer symptom reports, diagnostic intake checks, or visible exterior notes..."
                                        value={formData.notes}
                                        onChange={handleChange}
                                    />
                                </div>

                                {/* Work Order Defaults Metadata Box */}
                                <div className="intake-meta-card">
                                    <div className="meta-card-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow)' }}>tune</span>
                                        <span>AUTOMATIC WORK ORDER DEFAULTS</span>
                                    </div>
                                    <div className="meta-details-list">
                                        <div className="meta-item">
                                            <span className="meta-label">INITIAL STATUS:</span>
                                            <span className="meta-val status-received-badge">RECEIVED</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">ESTIMATED COST:</span>
                                            <span className="meta-val font-mono">$0.00</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">TOTAL COST:</span>
                                            <span className="meta-val font-mono">$0.00</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">BAY / ADVISOR / STAFF:</span>
                                            <span className="meta-val" style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">SCHEDULE TIMESTAMPS:</span>
                                            <span className="meta-val" style={{ color: 'var(--text-muted)' }}>00:00 (Pending Schedule)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </form>
                </main>

                {/* Sticky Action Bar */}
                <footer className="intake-sticky-footer">
                    <div className="footer-actions">
                        <button type="button" className="cancel-btn" onClick={handleResetForm}>
                            Clear Form
                        </button>
                        <button type="submit" form="intakeForm" className="submit-btn" disabled={isSubmitting}>
                            <span className="material-symbols-outlined">{isSubmitting ? 'hourglass_top' : 'save'}</span>
                            <span>{isSubmitting ? 'Processing Intake...' : 'Save & Create Work Order'}</span>
                        </button>
                    </div>
                </footer>
            </div>

            {/* Modal: Intake Success Summary */}
            {intakeSuccessData && (
                <div className="intake-modal-overlay">
                    <div className="intake-modal-content">
                        <div className="success-icon-wrap">
                            <span className="material-symbols-outlined success-check-icon">task_alt</span>
                        </div>
                        <h3 className="success-modal-title">Vehicle Intake Complete!</h3>
                        <p className="success-modal-subtitle">
                            New repair work order and customer intake records created:
                        </p>

                        <div className="success-details-grid">
                            <div className="success-detail-box">
                                <span className="detail-label">WORK ORDER ID</span>
                                <span className="detail-value text-yellow font-mono">{intakeSuccessData.work_order_id}</span>
                            </div>

                            <div className="success-detail-box">
                                <span className="detail-label">STATUS</span>
                                <span className="detail-value text-emerald font-mono">RECEIVED</span>
                            </div>

                            <div className="success-detail-box">
                                <span className="detail-label">VEHICLE</span>
                                <span className="detail-value">{intakeSuccessData.year} {intakeSuccessData.make} {intakeSuccessData.model}</span>
                                <span className="detail-sub font-mono">{intakeSuccessData.vehicle_id} • VIN: {intakeSuccessData.vin}</span>
                            </div>

                            <div className="success-detail-box">
                                <span className="detail-label">OWNER</span>
                                <span className="detail-value">{intakeSuccessData.owner_name}</span>
                                <span className="detail-sub font-mono">{intakeSuccessData.owner_id} • {intakeSuccessData.owner_phone}</span>
                            </div>

                            {intakeSuccessData.initial_observations && (
                                <div className="success-detail-box grid-full">
                                    <span className="detail-label">INITIAL OBSERVATIONS</span>
                                    <span className="detail-value" style={{ fontSize: '12px', fontWeight: 400 }}>
                                        {intakeSuccessData.initial_observations}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="success-modal-actions">
                            <button type="button" className="secondary-btn" onClick={handleResetForm}>
                                Intake Another Vehicle
                            </button>
                            <button
                                type="button"
                                className="primary-btn"
                                onClick={() => {
                                    setIntakeSuccessData(null);
                                    window.location.href = '/';
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>dashboard</span>
                                <span>Go to Dashboard</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}