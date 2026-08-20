import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TaxInvoiceModal from './TaxInvoiceModal';
import './css/Invoices.css';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Invoices() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [invoicesList, setInvoicesList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Selected Invoice for PDF Modal
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);

    const fetchInvoices = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/invoices`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setInvoicesList(json.data);
                }
            }
        } catch (err) {
            console.error('Error fetching invoices:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const handleViewPdf = async (inv) => {
        setIsLoadingPdf(true);
        try {
            const res = await fetch(`${API_BASE_URL}/invoices/${encodeURIComponent(inv.invoice_id)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    setSelectedInvoice(json.data);
                    setIsPdfModalOpen(true);
                    return;
                }
            }
            setSelectedInvoice(inv);
            setIsPdfModalOpen(true);
        } catch (err) {
            setSelectedInvoice(inv);
            setIsPdfModalOpen(true);
        } finally {
            setIsLoadingPdf(false);
        }
    };

    // Filter Invoices
    const filteredInvoices = invoicesList.filter((inv) => {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
            (inv.invoice_id || '').toLowerCase().includes(search) ||
            (inv.work_order_id || '').toLowerCase().includes(search) ||
            (inv.owner_name || '').toLowerCase().includes(search) ||
            `${inv.year || ''} ${inv.make || ''} ${inv.model || ''} ${inv.license_plate || ''}`.toLowerCase().includes(search);

        if (!matchesSearch) return false;

        const invStatus = (inv.status || 'pending').toLowerCase();
        if (statusFilter === 'pending') return invStatus === 'pending';
        if (statusFilter === 'paid') return invStatus === 'paid';
        if (statusFilter === 'overdue') return invStatus === 'overdue';
        return true;
    });

    // Compute Live KPI Stats
    const totalPending = invoicesList
        .filter((inv) => (inv.status || '').toLowerCase() === 'pending')
        .reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

    const pendingCount = invoicesList.filter((inv) => (inv.status || '').toLowerCase() === 'pending').length;

    const totalCollected = invoicesList
        .filter((inv) => (inv.status || '').toLowerCase() === 'paid')
        .reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

    const totalOverdue = invoicesList
        .filter((inv) => (inv.status || '').toLowerCase() === 'overdue')
        .reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

    const overdueCount = invoicesList.filter((inv) => (inv.status || '').toLowerCase() === 'overdue').length;

    return (
        <div className="invoices-layout">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

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
                            <h2 className="header-title">Financial Overview & Tax Invoices</h2>
                            <p className="header-subtitle">
                                Official billing records, tax calculations (5% VAT), and printable PDF statements.
                            </p>
                        </div>
                    </div>

                    <div className="header-actions">
                        <div className="search-box hide-mobile">
                            <SearchIcon className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search by Invoice #, WO, Owner, Plate..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button className="icon-btn" onClick={fetchInvoices} title="Refresh Invoices">
                            <RefreshIcon fontSize="small" />
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
                                        <span>All Invoices ({invoicesList.length})</span>
                                    </label>
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="pending"
                                            checked={statusFilter === 'pending'}
                                            onChange={() => setStatusFilter('pending')}
                                        />
                                        <span className="text-warning-hover">Pending ({pendingCount})</span>
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
                                        <span className="text-error-hover">Overdue ({overdueCount})</span>
                                    </label>
                                </div>
                            </div>

                            {/* KPI Summary Grid */}
                            <div className="kpi-grid">
                                <div className="kpi-card">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Total Pending / Outstanding</span>
                                        <AccessTimeIcon className="text-warning" />
                                    </div>
                                    <span className="kpi-value font-mono">${totalPending.toFixed(2)}</span>
                                    <span className="kpi-subtext text-warning font-mono">
                                        {pendingCount} Invoices
                                    </span>
                                </div>

                                <div className="kpi-card">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Collected Revenue</span>
                                        <CheckCircleIcon className="text-success" />
                                    </div>
                                    <span className="kpi-value font-mono">${totalCollected.toFixed(2)}</span>
                                    <span className="kpi-subtext text-success font-mono">
                                        Settled Invoices
                                    </span>
                                </div>

                                <div className="kpi-card border-error">
                                    <div className="kpi-top">
                                        <span className="kpi-title">Overdue Invoices</span>
                                        <WarningAmberIcon className="text-error" />
                                    </div>
                                    <span className="kpi-value font-mono">${totalOverdue.toFixed(2)}</span>
                                    <span className="kpi-subtext text-error font-mono font-bold">
                                        {overdueCount} Action Required
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
                                            <th>Tax Invoice #</th>
                                            <th>Work Order</th>
                                            <th>Owner / Customer</th>
                                            <th>Vehicle [Plate]</th>
                                            <th>Subtotal</th>
                                            <th>VAT (5%)</th>
                                            <th>Total (OMR/$)</th>
                                            <th>Date Issued</th>
                                            <th>Status</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                                    Loading invoices records from database...
                                                </td>
                                            </tr>
                                        ) : filteredInvoices.length === 0 ? (
                                            <tr>
                                                <td colSpan="10" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                                    No invoices found matching criteria. Invoices are generated automatically in Work Order Details once repairs are ready for pickup.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredInvoices.map((inv) => {
                                                const statusType = inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : 'pending';

                                                return (
                                                    <tr
                                                        key={inv.invoice_id}
                                                        className="table-row"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => handleViewPdf(inv)}
                                                    >
                                                        <td className="font-mono inv-id">{inv.invoice_id}</td>
                                                        <td className="font-mono" style={{ color: 'var(--accent-yellow)' }}>
                                                            {inv.work_order_id}
                                                        </td>
                                                        <td>
                                                            <div className="owner-name font-bold">
                                                                {inv.owner_name} {inv.owner_is_vip && <span style={{ color: 'var(--accent-yellow)' }}>★</span>}
                                                            </div>
                                                            <div className="text-muted font-mono" style={{ fontSize: '11px' }}>{inv.owner_phone}</div>
                                                        </td>
                                                        <td>
                                                            <div className="vehicle-desc">
                                                                {inv.year} {inv.make} {inv.model}
                                                            </div>
                                                            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                🚗 {inv.license_plate}
                                                            </div>
                                                        </td>
                                                        <td className="font-mono">${parseFloat(inv.subtotal || 0).toFixed(2)}</td>
                                                        <td className="font-mono text-muted">${parseFloat(inv.tax_amount || 0).toFixed(2)}</td>
                                                        <td className="font-mono amount-text" style={{ color: 'var(--accent-yellow)', fontWeight: 800 }}>
                                                            ${parseFloat(inv.total_amount || 0).toFixed(2)}
                                                        </td>
                                                        <td className="text-muted font-mono">{inv.date_issued}</td>
                                                        <td>
                                                            <span className={`status-pill status-${statusType}`}>
                                                                <span className={`status-dot ${statusType === 'error' ? 'animate-pulse' : ''}`}></span>
                                                                {(inv.status || 'PENDING').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="text-right">
                                                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    className="action-icon-btn"
                                                                    title="View & Print Official Tax Invoice PDF"
                                                                    onClick={() => handleViewPdf(inv)}
                                                                >
                                                                    <PictureAsPdfIcon fontSize="small" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination Footer */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing {filteredInvoices.length} of {invoicesList.length} total invoices
                                </span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Official Tax Invoice PDF Modal */}
            {isPdfModalOpen && selectedInvoice && (
                <TaxInvoiceModal
                    invoice={selectedInvoice}
                    onClose={() => setIsPdfModalOpen(false)}
                />
            )}
        </div>
    );
}