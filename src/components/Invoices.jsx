import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './css/Invoices.css';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EmailIcon from '@mui/icons-material/Email';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

const INVOICES_DATA = [
    {
        id: 'INV-2023-089',
        owner: 'Sarah Jenkins',
        vehicle: '2019 Honda Civic',
        amount: '$1,250.00',
        dateIssued: 'Oct 12, 2023',
        status: 'Overdue',
        statusType: 'error',
    },
    {
        id: 'INV-2023-090',
        owner: 'Marcus Thorne',
        vehicle: '2021 Ford F-150',
        amount: '$845.50',
        dateIssued: 'Oct 24, 2023',
        status: 'Pending',
        statusType: 'pending',
    },
    {
        id: 'INV-2023-091',
        owner: 'Elena Rodriguez',
        vehicle: '2018 Toyota RAV4',
        amount: '$2,100.00',
        dateIssued: 'Oct 25, 2023',
        status: 'Paid',
        statusType: 'success',
    },
    {
        id: 'INV-2023-092',
        owner: 'David Chen',
        vehicle: '2022 Tesla Model 3',
        amount: '$450.00',
        dateIssued: 'Oct 26, 2023',
        status: 'Pending',
        statusType: 'pending',
    },
];

export default function Invoices() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filteredInvoices = INVOICES_DATA.filter((inv) => {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
            inv.id.toLowerCase().includes(search) ||
            inv.owner.toLowerCase().includes(search) ||
            inv.vehicle.toLowerCase().includes(search);

        if (!matchesSearch) return false;

        if (statusFilter === 'pending') return inv.statusType === 'pending';
        if (statusFilter === 'paid') return inv.statusType === 'success';
        if (statusFilter === 'overdue') return inv.statusType === 'error';
        return true;
    });

    return (
        <div className="invoices-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="invoices-wrapper">
                {/* Top Header Area */}
                <header className="invoices-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <div className="title-group">
                            <h2 className="header-title">Financial Overview</h2>
                            <p className="header-subtitle">
                                Manage and track all customer invoices.
                            </p>
                        </div>
                    </div>

                    <div className="header-actions">
                        <div className="search-box hide-mobile">
                            <SearchIcon className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search invoices..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>

                        <button type="button" className="primary-btn">
                            <AddIcon />
                            <span className="btn-text">New Invoice</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="invoices-main">
                    <div className="content-container">
                        {/* Filters & Stats Bento Layout */}
                        <div className="bento-top-row">
                            {/* Filter By Status Panel */}
                            <div className="filter-card">
                                <h3 className="filter-title">Filter by Status</h3>
                                <div className="radio-group">
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="all"
                                            checked={statusFilter === 'all'}
                                            onChange={() => setStatusFilter('all')}
                                        />
                                        <span>All Invoices</span>
                                    </label>
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="pending"
                                            checked={statusFilter === 'pending'}
                                            onChange={() => setStatusFilter('pending')}
                                        />
                                        <span className="text-warning-hover">Pending</span>
                                    </label>
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="paid"
                                            checked={statusFilter === 'paid'}
                                            onChange={() => setStatusFilter('paid')}
                                        />
                                        <span className="text-success-hover">Paid</span>
                                    </label>
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="overdue"
                                            checked={statusFilter === 'overdue'}
                                            onChange={() => setStatusFilter('overdue')}
                                        />
                                        <span className="text-error-hover">Overdue</span>
                                    </label>
                                </div>
                            </div>

                            {/* KPI Summary Grid */}
                            <div className="kpi-grid">
                                <div className="kpi-card">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Total Pending</span>
                                        <AccessTimeIcon className="text-warning" />
                                    </div>
                                    <span className="kpi-value">$12,450</span>
                                    <span className="kpi-subtext text-warning font-mono">
                                        24 Invoices
                                    </span>
                                </div>

                                <div className="kpi-card">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Collected (30d)</span>
                                        <CheckCircleIcon className="text-success" />
                                    </div>
                                    <span className="kpi-value">$45,200</span>
                                    <span className="kpi-subtext text-success font-mono">
                                        +15% from last mo
                                    </span>
                                </div>

                                <div className="kpi-card border-error">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Overdue</span>
                                        <WarningAmberIcon className="text-error" />
                                    </div>
                                    <span className="kpi-value">$3,100</span>
                                    <span className="kpi-subtext text-error font-mono font-bold">
                                        5 Action Required
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Invoices List Table Card */}
                        <div className="table-card">
                            <div className="table-responsive">
                                <table className="invoices-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice #</th>
                                            <th>Owner / Vehicle</th>
                                            <th>Amount</th>
                                            <th>Date Issued</th>
                                            <th>Status</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInvoices.map((inv) => (
                                            <tr key={inv.id} className="table-row">
                                                <td className="font-mono inv-id">{inv.id}</td>
                                                <td>
                                                    <div className="owner-name">{inv.owner}</div>
                                                    <div className="vehicle-desc">{inv.vehicle}</div>
                                                </td>
                                                <td className="font-mono amount-text">{inv.amount}</td>
                                                <td className="text-muted font-mono">{inv.dateIssued}</td>
                                                <td>
                                                    <span className={`status-pill status-${inv.statusType}`}>
                                                        <span
                                                            className={`status-dot ${inv.statusType === 'error' ? 'animate-pulse' : ''
                                                                }`}
                                                        ></span>
                                                        {inv.status}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <div className="row-actions">
                                                        {inv.statusType !== 'success' && (
                                                            <button
                                                                type="button"
                                                                className="action-icon-btn"
                                                                title="Send Reminder"
                                                            >
                                                                <EmailIcon />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="action-icon-btn"
                                                            title="View PDF"
                                                        >
                                                            <PictureAsPdfIcon />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination Footer */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing 1 to {filteredInvoices.length} of 24 entries
                                </span>
                                <div className="pagination-controls">
                                    <button className="pagination-btn" disabled>
                                        Prev
                                    </button>
                                    <button className="pagination-page active">1</button>
                                    <button className="pagination-page">2</button>
                                    <button className="pagination-page">3</button>
                                    <button className="pagination-btn">Next</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}