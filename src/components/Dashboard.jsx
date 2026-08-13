import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/Dashboard.css';

export default function Dashboard() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="dashboard-layout">
            {/* Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main View Area */}
            <div className="dashboard-wrapper">
                {/* Top Header Bar */}
                <header className="top-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>

                        <div className="search-bar">
                            <span className="material-symbols-outlined search-icon">
                                search
                            </span>
                            <input
                                type="text"
                                placeholder="Search VIN, Owner, or Work Order..."
                            />
                        </div>
                    </div>

                    <div className="header-right">
                        <Link to="/intake" className="primary-action-btn" style={{ textDecoration: 'none' }}>
                            <span className="material-symbols-outlined">add</span>
                            <span className="btn-text">New Order</span>
                        </Link>

                        <div className="utility-actions">
                            <button className="icon-btn" aria-label="Notifications">
                                <span className="material-symbols-outlined">
                                    notifications
                                </span>
                                <span className="notification-badge"></span>
                            </button>

                            {/* <button className="icon-btn" aria-label="Help">
                                <span className="material-symbols-outlined">help</span>
                            </button>

                            <div className="user-avatar">
                                <span className="avatar-initials">PG</span>
                            </div> */}
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <main className="dashboard-main">
                    {/* Title Area */}
                    <section className="dashboard-title-bar">
                        <div>
                            <h2 className="page-title">System Overview</h2>
                            <p className="page-subtitle">Real-time status of shop operations.</p>
                        </div>
                        <div className="status-pill">
                            <span className="pulse-dot"></span>
                            Systems Online
                        </div>
                    </section>

                    {/* Bento Grid Layout */}
                    <div className="bento-grid">
                        {/* Active Work Orders Widget */}
                        <article className="bento-card col-span-8">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon yellow-glow">
                                        <span className="material-symbols-outlined">
                                            construction
                                        </span>
                                    </div>
                                    <h3>Active Work Orders</h3>
                                </div>
                                <span className="stat-value highlight">14</span>
                            </div>

                            <div className="orders-list">
                                <div className="order-row">
                                    <div className="order-meta">
                                        <span className="order-id">WO-8992</span>
                                        <div>
                                            <p className="order-vehicle">2019 Tesla Model 3</p>
                                            <p className="order-desc">Brake pad replacement</p>
                                        </div>
                                    </div>
                                    <div className="order-status-group">
                                        <div className="progress-stepper">
                                            <span className="step fill"></span>
                                            <span className="step fill"></span>
                                            <span className="step"></span>
                                        </div>
                                        <span className="badge badge-warning">In Progress</span>
                                    </div>
                                </div>

                                <div className="order-row">
                                    <div className="order-meta">
                                        <span className="order-id">WO-8993</span>
                                        <div>
                                            <p className="order-vehicle">2021 Ford F-150</p>
                                            <p className="order-desc">Transmission diagnostic</p>
                                        </div>
                                    </div>
                                    <div className="order-status-group">
                                        <div className="progress-stepper">
                                            <span className="step fill"></span>
                                            <span className="step"></span>
                                            <span className="step"></span>
                                        </div>
                                        <span className="badge badge-success">Inspection</span>
                                    </div>
                                </div>
                            </div>

                            <button className="card-footer-btn" onClick={() => navigate('/work-orders')}>View All Orders</button>
                        </article>

                        {/* Pending Approvals Widget */}
                        <article className="bento-card col-span-4">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon warning-glow">
                                        <span className="material-symbols-outlined">
                                            assignment_late
                                        </span>
                                    </div>
                                    <h3>Approvals</h3>
                                </div>
                            </div>
                            <div className="stat-summary">
                                <span className="stat-value warning">5</span>
                                <span className="stat-label">Pending</span>
                            </div>
                            <div className="approval-box">
                                <span className="approval-id">WO-8990 • Smith</span>
                                <p className="approval-title">Estimate Approval Req.</p>
                                <button className="secondary-action-btn" onClick={() => navigate('/work-orders/WO-8990')}>Review</button>
                            </div>
                        </article>

                        {/* Today's Schedule Widget */}
                        <article className="bento-card col-span-6">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon">
                                        <span className="material-symbols-outlined">
                                            calendar_today
                                        </span>
                                    </div>
                                    <h3>Today's Schedule</h3>
                                </div>
                            </div>
                            <div className="timeline-list">
                                <div className="timeline-item active" style={{ cursor: 'pointer' }} onClick={() => navigate('/scheduling')}>
                                    <span className="timeline-node"></span>
                                    <span className="timeline-time">09:00 AM</span>
                                    <p className="timeline-text">J. Doe - Drop off</p>
                                </div>
                                <div className="timeline-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/scheduling')}>
                                    <span className="timeline-node"></span>
                                    <span className="timeline-time">11:30 AM</span>
                                    <p className="timeline-text">Parts Delivery (AutoZone)</p>
                                </div>
                                <div className="timeline-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/scheduling')}>
                                    <span className="timeline-node"></span>
                                    <span className="timeline-time">02:00 PM</span>
                                    <p className="timeline-text">Staff Meeting</p>
                                </div>
                            </div>
                        </article>

                        {/* Low Stock Alerts Widget */}
                        <article className="bento-card col-span-6 alert-card">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon error-glow">
                                        <span className="material-symbols-outlined">warning</span>
                                    </div>
                                    <h3 className="text-error">Low Stock Alerts</h3>
                                </div>
                                <span className="badge badge-error">3 Items</span>
                            </div>
                            <div className="stock-list">
                                <div className="stock-row">
                                    <div>
                                        <span className="sku-tag">SKU: OIL-5W30-SYN</span>
                                        <p className="stock-name">Synthetic Oil 5W-30 (Drums)</p>
                                    </div>
                                    <div className="stock-count text-error">
                                        <strong>1</strong>
                                        <span>In Stock</span>
                                    </div>
                                </div>
                                <div className="stock-row">
                                    <div>
                                        <span className="sku-tag">SKU: FLT-OIL-XYZ</span>
                                        <p className="stock-name">Standard Oil Filters</p>
                                    </div>
                                    <div className="stock-count text-warning">
                                        <strong>12</strong>
                                        <span>In Stock</span>
                                    </div>
                                </div>
                            </div>
                            <button className="card-footer-btn outline-error" onClick={() => navigate('/inventory')}>
                                Order Supplies
                            </button>
                        </article>
                    </div>
                </main>
            </div>
        </div>
    );
}