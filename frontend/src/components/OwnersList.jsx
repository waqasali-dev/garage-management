import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/OwnersList.css';

const OWNERS_DATA = [
    {
        id: '#OWN-8492',
        name: 'Sarah Jenkins',
        initials: 'SJ',
        isActive: true,
        phone: '(555) 012-3456',
        email: 'sarah.j@example.com',
        vehicle: '2022 Porsche Taycan',
        vehicleType: 'directions_car',
        vin: 'VIN: WP0AA2Y1XN...',
        additionalVehicles: 0,
        lastService: 'In Shop (Active)',
        serviceDetail: '',
        statusType: 'active',
    },
    {
        id: '#OWN-7731',
        name: 'Marcus Chen',
        initials: 'MC',
        isActive: false,
        phone: '(555) 987-6543',
        email: 'm.chen.corp@example.com',
        vehicle: '2019 Tesla Model 3',
        vehicleType: 'electric_car',
        vin: 'VIN: 5YJ3E1EA7K...',
        additionalVehicles: 1,
        lastService: 'Oct 12, 2023',
        serviceDetail: 'Brake Service',
        statusType: 'history',
    },
    {
        id: '#OWN-9102',
        name: 'Elena Rodriguez',
        initials: 'ER',
        isActive: false,
        phone: '(555) 444-2211',
        email: 'elena.r@example.com',
        vehicle: '2021 Audi RS e-tron GT',
        vehicleType: 'directions_car',
        vin: 'VIN: WAURFAFC0M...',
        additionalVehicles: 0,
        lastService: 'Aug 05, 2023',
        serviceDetail: 'Diagnostic',
        statusType: 'history',
    },
    {
        id: '#OWN-6629',
        name: 'James Sullivan',
        initials: 'JS',
        isActive: false,
        phone: '(555) 777-8899',
        email: 'j.sullivan@example.com',
        vehicle: '2018 BMW M3',
        vehicleType: 'directions_car',
        vin: 'VIN: WBS3C9C59J...',
        additionalVehicles: 0,
        lastService: 'Jan 15, 2023',
        serviceDetail: 'Tire Rotation',
        statusType: 'history',
    },
];

export default function OwnersList() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');

    const filteredOwners = OWNERS_DATA.filter((owner) => {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
            owner.name.toLowerCase().includes(search) ||
            owner.id.toLowerCase().includes(search) ||
            owner.phone.toLowerCase().includes(search) ||
            owner.email.toLowerCase().includes(search) ||
            owner.vehicle.toLowerCase().includes(search);

        if (!matchesSearch) return false;

        if (activeFilter === 'active') return owner.isActive;
        return true;
    });

    return (
        <div className="owners-layout">
            {/* Sidebar Component */}
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
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">Client Directory</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Download Directory">
                            <span className="material-symbols-outlined">download</span>
                        </button>
                        <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                            <span className="material-symbols-outlined">add</span>
                            <span className="btn-text">New Owner</span>
                        </Link>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="owners-main">
                    <div className="content-container">
                        {/* Filter & Search Toolbar */}
                        <div className="toolbar-row">
                            <div className="search-box">
                                <span className="material-symbols-outlined search-icon">
                                    search
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by Owner Name, VIN, Phone, or Email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="filter-chips">
                                <button
                                    type="button"
                                    className={`chip-btn ${activeFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('all')}
                                >
                                    <span className="material-symbols-outlined">filter_list</span>
                                    <span>All Clients</span>
                                </button>
                                <button
                                    type="button"
                                    className={`chip-btn ${activeFilter === 'active' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('active')}
                                >
                                    <span>Active Service</span>
                                </button>
                                <button
                                    type="button"
                                    className={`chip-btn ${activeFilter === 'recent' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('recent')}
                                >
                                    <span>Recent (30d)</span>
                                </button>
                            </div>
                        </div>

                        {/* Main Table View */}
                        <div className="table-card">
                            <div className="table-responsive">
                                <table className="owners-table">
                                    <thead>
                                        <tr>
                                            <th>Owner Details</th>
                                            <th className="hide-mobile">Contact Info</th>
                                            <th className="hide-tablet">Registered Vehicles</th>
                                            <th className="hide-tablet">Last Service</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOwners.map((owner) => (
                                            <tr key={owner.id} className="table-row">
                                                {/* Owner Details */}
                                                <td>
                                                    <div
                                                        className="owner-profile-cell"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => navigate(`/owners/${owner.id.replace('#', '')}`, { state: { owner } })}
                                                    >
                                                        <div className="profile-avatar-box">
                                                            <span className="avatar-initials">
                                                                {owner.initials}
                                                            </span>
                                                            {owner.isActive && (
                                                                <span className="active-dot"></span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="owner-name">{owner.name}</div>
                                                            <div className="owner-id font-mono">{owner.id}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Contact Info */}
                                                <td className="hide-mobile">
                                                    <div className="contact-stack">
                                                        <div className="contact-item highlight">
                                                            <span className="material-symbols-outlined">phone</span>
                                                            <span className="font-mono">{owner.phone}</span>
                                                        </div>
                                                        <div className="contact-item text-muted">
                                                            <span className="material-symbols-outlined">mail</span>
                                                            <span>{owner.email}</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Vehicles */}
                                                <td className="hide-tablet">
                                                    <div className="vehicle-stack">
                                                        <div className="vehicle-tag">
                                                            <span className="material-symbols-outlined">
                                                                {owner.vehicleType}
                                                            </span>
                                                            <span>{owner.vehicle}</span>
                                                        </div>
                                                        {owner.vin && (
                                                            <div className="vin-text font-mono">{owner.vin}</div>
                                                        )}
                                                        {owner.additionalVehicles > 0 && (
                                                            <div className="additional-tag">
                                                                +{owner.additionalVehicles} more vehicle
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Last Service */}
                                                <td className="hide-tablet">
                                                    {owner.isActive ? (
                                                        <div className="active-service-pill">
                                                            <span className="material-symbols-outlined">schedule</span>
                                                            <span>{owner.lastService}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="service-history">
                                                            <div className="service-date">{owner.lastService}</div>
                                                            <div className="service-desc">{owner.serviceDetail}</div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Actions */}
                                                <td className="text-right">
                                                    <button
                                                        type="button"
                                                        className="action-btn"
                                                        onClick={() => navigate(`/owners/${owner.id.replace('#', '')}`, { state: { owner } })}
                                                    >
                                                        View Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing 1 to {filteredOwners.length} of 248 entries
                                </span>
                                <div className="pagination-controls">
                                    <button className="pagination-btn" disabled>
                                        <span className="material-symbols-outlined">chevron_left</span>
                                    </button>
                                    <button className="pagination-page active">1</button>
                                    <button className="pagination-page">2</button>
                                    <button className="pagination-page">3</button>
                                    <span className="pagination-dots">...</span>
                                    <button className="pagination-btn">
                                        <span className="material-symbols-outlined">chevron_right</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}