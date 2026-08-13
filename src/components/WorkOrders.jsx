import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/WorkOrders.css';

const WORK_ORDERS_DATA = [
    {
        id: '#WO-2049',
        vehicle: '2022 Tesla Model 3',
        vin: 'VIN: ...9F4A',
        vehicleType: 'directions_car',
        owner: 'Elena Smith',
        ownerInitials: 'ES',
        status: 'IN PROGRESS',
        statusType: 'progress',
        mechanic: 'J. Miller',
        cost: '$1,250.00',
        dateIn: 'Oct 24, 08:30',
    },
    {
        id: '#WO-2050',
        vehicle: '2020 Rivian R1T',
        vin: 'VIN: ...2B8C',
        vehicleType: 'electric_car',
        owner: 'Marcus Doe',
        ownerInitials: 'MD',
        status: 'WAITING ON PARTS',
        statusType: 'warning',
        mechanic: 'S. Connor',
        cost: '$3,400.00',
        dateIn: 'Oct 23, 14:15',
    },
    {
        id: '#WO-2045',
        vehicle: '2018 Ford F-150',
        vin: 'VIN: ...7X9P',
        vehicleType: 'local_shipping',
        owner: 'Alice Wong',
        ownerInitials: 'AW',
        status: 'READY FOR PICKUP',
        statusType: 'success',
        mechanic: 'T. Barnes',
        cost: '$450.00',
        dateIn: 'Oct 22, 09:00',
    },
    {
        id: '#WO-2051',
        vehicle: '2023 Porsche 911',
        vin: 'VIN: ...4M2Z',
        vehicleType: 'directions_car',
        owner: 'Richard Branson',
        ownerInitials: 'RB',
        status: 'SCHEDULED',
        statusType: 'neutral',
        mechanic: '--',
        cost: 'TBD',
        dateIn: 'Oct 26, 10:00',
    },
];

export default function WorkOrders() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTerm, setFilterTerm] = useState('');

    const filteredOrders = WORK_ORDERS_DATA.filter((order) => {
        const search = (searchTerm || filterTerm).toLowerCase();
        return (
            order.id.toLowerCase().includes(search) ||
            order.vehicle.toLowerCase().includes(search) ||
            order.owner.toLowerCase().includes(search) ||
            order.mechanic.toLowerCase().includes(search)
        );
    });

    return (
        <div className="orders-layout">
            {/* Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="orders-wrapper">
                {/* Top Header Bar */}
                <header className="orders-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>

                        <div className="header-search">
                            <span className="material-symbols-outlined search-icon">search</span>
                            <input
                                type="text"
                                placeholder="Search Work Orders, VIN, or Owners..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <div className="keyboard-shortcut">
                                <span>⌘</span>
                                <span>K</span>
                            </div>
                        </div>
                    </div>

                    <div className="header-right">
                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="orders-main">
                    <div className="content-container">
                        {/* Page Title & Action Buttons */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Active Work Orders</h2>
                                <p className="page-subtitle">Manage and track in-progress vehicle repairs.</p>
                            </div>

                            <div className="action-buttons">
                                <button type="button" className="secondary-btn">
                                    <span className="material-symbols-outlined">filter_list</span>
                                    <span>Filters</span>
                                </button>
                                <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined">add</span>
                                    <span>New Work Order</span>
                                </Link>
                            </div>
                        </div>

                        {/* Micro Stats Grid */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <span className="stat-title">In Bay</span>
                                <span className="stat-number text-highlight">14</span>
                            </div>
                            <div className="stat-card border-warning">
                                <span className="stat-title">Awaiting Parts</span>
                                <span className="stat-number text-warning">6</span>
                            </div>
                            <div className="stat-card border-success">
                                <span className="stat-title">Ready for Pickup</span>
                                <span className="stat-number text-success">3</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-title">Est. Revenue</span>
                                <span className="stat-number">$12.4k</span>
                            </div>
                        </div>

                        {/* Table Container */}
                        <div className="table-card">
                            {/* Table Toolbar */}
                            <div className="table-toolbar">
                                <div className="toolbar-search">
                                    <span className="material-symbols-outlined">search</span>
                                    <input
                                        type="text"
                                        placeholder="Filter this view..."
                                        value={filterTerm}
                                        onChange={(e) => setFilterTerm(e.target.value)}
                                    />
                                </div>
                                <div className="toolbar-actions">
                                    <button className="toolbar-btn" title="Export">
                                        <span className="material-symbols-outlined">download</span>
                                    </button>
                                    <button className="toolbar-btn" title="Column Settings">
                                        <span className="material-symbols-outlined">view_column</span>
                                    </button>
                                </div>
                            </div>

                            {/* Data Table */}
                            <div className="table-responsive">
                                <table className="orders-table">
                                    <thead>
                                        <tr>
                                            <th>WO #</th>
                                            <th>Vehicle</th>
                                            <th>Owner</th>
                                            <th>Status</th>
                                            <th>Mechanic</th>
                                            <th>Est. Cost</th>
                                            <th>Date In</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOrders.map((order) => (
                                            <tr
                                                key={order.id}
                                                className="table-row"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/work-orders/${order.id.replace('#', '')}`, { state: { order } })}
                                            >
                                                <td className="font-mono wo-id">{order.id}</td>
                                                <td>
                                                    <div className="vehicle-cell">
                                                        <div className="vehicle-icon-box">
                                                            <span className="material-symbols-outlined">
                                                                {order.vehicleType}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <div className="vehicle-name">{order.vehicle}</div>
                                                            <div className="vehicle-vin">{order.vin}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div
                                                        className="owner-cell"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate('/owners');
                                                        }}
                                                    >
                                                        <div className="avatar-circle">{order.ownerInitials}</div>
                                                        <span>{order.owner}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`status-pill status-${order.statusType}`}>
                                                        {order.statusType === 'progress' && (
                                                            <span className="status-dot animate-pulse"></span>
                                                        )}
                                                        {order.statusType === 'warning' && (
                                                            <span className="material-symbols-outlined status-icon">warning</span>
                                                        )}
                                                        {order.statusType === 'success' && (
                                                            <span className="material-symbols-outlined status-icon">check_circle</span>
                                                        )}
                                                        {order.statusType === 'neutral' && (
                                                            <span className="material-symbols-outlined status-icon">schedule</span>
                                                        )}
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td className="text-muted">{order.mechanic}</td>
                                                <td className="font-mono">{order.cost}</td>
                                                <td className="text-muted">{order.dateIn}</td>
                                                <td className="text-right">
                                                    <button className="more-btn" aria-label="More options" onClick={(e) => e.stopPropagation()}>
                                                        <span className="material-symbols-outlined">more_vert</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination */}
                            <div className="table-pagination">
                                <span className="pagination-info">Showing 1 to {filteredOrders.length} of 24 entries</span>
                                <div className="pagination-controls">
                                    <button className="pagination-btn" disabled>
                                        <span className="material-symbols-outlined">chevron_left</span>
                                    </button>
                                    <button className="pagination-page active">1</button>
                                    <button className="pagination-page">2</button>
                                    <button className="pagination-page">3</button>
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