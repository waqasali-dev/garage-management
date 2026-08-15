import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/OwnerDetail.css';

export default function OwnerDetail() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const passedOwner = location.state?.owner;

    // Example client state with fallback if navigated directly or via route
    const [clientData] = useState({
        name: passedOwner?.name || 'Marcus Thorne',
        tier: 'VIP Client',
        joinedDate: 'Oct 2021',
        phone: passedOwner?.phone || '+1 (555) 019-8472',
        email: passedOwner?.email || 'm.thorne@stellarcorp.io',
        address: '442 Horizon Ridge Pkwy, Suite 400, Neo-Vegas, NV 89012',
        lifetimeValue: '$14,250.00',
        initials: passedOwner?.initials || 'MT',
    });

    return (
        <div className="owner-detail-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Area */}
            <div className="owner-detail-wrapper">
                {/* Mobile App Bar Header */}
                <header className="detail-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">Owner Details</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Canvas Area */}
                <main className="detail-main">
                    <div className="content-container">
                        {/* Desktop Contextual Top Navigation */}
                        <div className="desktop-context-bar">
                            <Link to="/owners" className="back-link">
                                <span className="material-symbols-outlined">arrow_back</span>
                                <span>Back to Owners List</span>
                            </Link>

                            <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                                <span className="material-symbols-outlined">add</span>
                                <span>New Work Order</span>
                            </Link>
                        </div>

                        {/* Profile Hero Panel */}
                        <section className="profile-card">
                            {/* Profile Avatar Box */}
                            <div className="profile-avatar-box">
                                <span className="avatar-initials">{clientData.initials}</span>
                                <span className="vip-badge-dot" title="VIP Status"></span>
                            </div>

                            {/* Middle Profile Content Area */}
                            <div className="profile-info-stack">
                                <div className="profile-title-row">
                                    <div>
                                        <h2 className="client-name">{clientData.name}</h2>
                                        <p className="client-meta">
                                            <span className="material-symbols-outlined">loyalty</span>
                                            <span>{clientData.tier} • Joined {clientData.joinedDate}</span>
                                        </p>
                                    </div>

                                    <button className="mobile-edit-btn" aria-label="Edit Profile">
                                        <span className="material-symbols-outlined">edit</span>
                                    </button>
                                </div>

                                {/* Contact Data Details Grid */}
                                <div className="contact-details-grid">
                                    <div className="contact-detail-item">
                                        <div className="icon-box">
                                            <span className="material-symbols-outlined">phone_iphone</span>
                                        </div>
                                        <div>
                                            <span className="detail-label">PRIMARY PHONE</span>
                                            <p className="detail-value font-mono">{clientData.phone}</p>
                                        </div>
                                    </div>

                                    <div className="contact-detail-item">
                                        <div className="icon-box">
                                            <span className="material-symbols-outlined">mail</span>
                                        </div>
                                        <div>
                                            <span className="detail-label">EMAIL ADDRESS</span>
                                            <p className="detail-value">{clientData.email}</p>
                                        </div>
                                    </div>

                                    <div className="contact-detail-item col-span-full">
                                        <div className="icon-box">
                                            <span className="material-symbols-outlined">location_on</span>
                                        </div>
                                        <div>
                                            <span className="detail-label">BILLING ADDRESS</span>
                                            <p className="detail-value">{clientData.address}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Utility Box (Desktop) */}
                            <div className="profile-side-panel">
                                <button type="button" className="secondary-btn">
                                    <span className="material-symbols-outlined">edit</span>
                                    <span>Edit Profile</span>
                                </button>

                                <div className="lifetime-value-box">
                                    <span className="value-label">TOTAL LIFETIME VALUE</span>
                                    <p className="value-amount">{clientData.lifetimeValue}</p>
                                </div>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}