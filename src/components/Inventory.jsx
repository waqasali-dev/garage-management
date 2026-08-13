import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './css/Inventory.css';

const INVENTORY_DATA = [
    {
        sku: 'BRK-PAD-001',
        name: 'Ceramic Brake Pads (Front)',
        category: 'Brakes',
        stock: 45,
        unitCost: '$45.00',
        status: 'Optimal',
        statusType: 'success',
    },
    {
        sku: 'OIL-SYN-5W30',
        name: 'Synthetic Motor Oil 5W-30 (Qt)',
        category: 'Fluids',
        stock: 8,
        unitCost: '$8.50',
        status: 'Low Stock',
        statusType: 'warning',
    },
    {
        sku: 'FLT-OIL-092',
        name: 'High-Mileage Oil Filter',
        category: 'Filters',
        stock: 112,
        unitCost: '$6.25',
        status: 'Optimal',
        statusType: 'success',
    },
    {
        sku: 'SPK-PLG-IR',
        name: 'Iridium Spark Plug (Set of 4)',
        category: 'Ignition',
        stock: 24,
        unitCost: '$32.00',
        status: 'Optimal',
        statusType: 'success',
    },
    {
        sku: 'BTRY-AGM-H7',
        name: 'AGM Automotive Battery H7',
        category: 'Electrical',
        stock: 0,
        unitCost: '$185.00',
        status: 'Out of Stock',
        statusType: 'error',
    },
];

export default function Inventory() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredItems = INVENTORY_DATA.filter((item) => {
        const search = searchTerm.toLowerCase();
        return (
            item.sku.toLowerCase().includes(search) ||
            item.name.toLowerCase().includes(search) ||
            item.category.toLowerCase().includes(search)
        );
    });

    return (
        <div className="inventory-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="inventory-wrapper">
                {/* Top Header Bar */}
                <header className="inventory-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <div className="title-group">
                            <h2 className="header-title">Inventory Management</h2>
                            <p className="header-subtitle">
                                Manage stock levels, reorder alerts, and parts catalog.
                            </p>
                        </div>
                    </div>

                    <div className="header-actions">
                        <div className="search-box hide-mobile">
                            <span className="material-symbols-outlined search-icon">
                                search
                            </span>
                            <input
                                type="text"
                                placeholder="Search SKU, Part Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>

                        <button className="icon-btn hide-mobile" aria-label="Help">
                            <span className="material-symbols-outlined">help</span>
                        </button>

                        <button type="button" className="primary-btn">
                            <span className="material-symbols-outlined">add</span>
                            <span className="btn-text">Add Part</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="inventory-main">
                    <div className="content-container">
                        {/* KPI Stats Bento Grid */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Total Value</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        account_balance_wallet
                                    </span>
                                </div>
                                <span className="kpi-value">$142,500</span>
                                <div className="kpi-trend text-success">
                                    <span className="material-symbols-outlined">trending_up</span>
                                    <span>+2.4% vs last month</span>
                                </div>
                            </div>

                            <div className="kpi-card warning-glow">
                                <div className="kpi-top">
                                    <span className="kpi-title">Low Stock Alerts</span>
                                    <span className="material-symbols-outlined text-warning">
                                        warning
                                    </span>
                                </div>
                                <span className="kpi-value text-warning">12</span>
                                <span className="kpi-subtext">Items below threshold</span>
                            </div>

                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Active POs</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        local_shipping
                                    </span>
                                </div>
                                <span className="kpi-value">5</span>
                                <span className="kpi-subtext">Expected this week</span>
                            </div>

                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Total Items</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        category
                                    </span>
                                </div>
                                <span className="kpi-value">1,248</span>
                                <span className="kpi-subtext">Across 14 categories</span>
                            </div>
                        </div>

                        {/* Main Table Card */}
                        <div className="table-card">
                            <div className="table-toolbar">
                                <h3 className="toolbar-title">Parts Inventory</h3>
                                <div className="toolbar-actions">
                                    <button type="button" className="toolbar-btn">
                                        <span className="material-symbols-outlined">filter_list</span>
                                        <span>Filter</span>
                                    </button>
                                    <button type="button" className="toolbar-btn">
                                        <span className="material-symbols-outlined">download</span>
                                        <span>Export</span>
                                    </button>
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="inventory-table">
                                    <thead>
                                        <tr>
                                            <th>SKU</th>
                                            <th>Part Name</th>
                                            <th>Category</th>
                                            <th className="text-right">Stock Level</th>
                                            <th className="text-right">Unit Cost</th>
                                            <th className="text-center">Status</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredItems.map((item) => (
                                            <tr
                                                key={item.sku}
                                                className={`table-row ${item.statusType === 'warning' ? 'row-warning' : ''
                                                    } ${item.statusType === 'error' ? 'row-error' : ''}`}
                                            >
                                                <td className="font-mono sku-code">{item.sku}</td>
                                                <td className="item-name">{item.name}</td>
                                                <td className="text-muted">{item.category}</td>
                                                <td
                                                    className={`text-right font-mono stock-count ${item.statusType === 'warning'
                                                        ? 'text-warning'
                                                        : item.statusType === 'error'
                                                            ? 'text-error'
                                                            : ''
                                                        }`
                                                    }
                                                >
                                                    {item.stock}
                                                </td>
                                                <td className="text-right font-mono text-muted">
                                                    {item.unitCost}
                                                </td>
                                                <td className="text-center">
                                                    <span className={`status-pill pill-${item.statusType}`}>
                                                        {item.statusType === 'warning' && (
                                                            <span className="material-symbols-outlined status-icon">
                                                                warning
                                                            </span>
                                                        )}
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <button
                                                        type="button"
                                                        className="more-btn"
                                                        aria-label="Options"
                                                    >
                                                        <span className="material-symbols-outlined">
                                                            more_vert
                                                        </span>
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
                                    Showing 1 to {filteredItems.length} of 1,248 entries
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