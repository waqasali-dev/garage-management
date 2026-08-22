import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/WorkOrders.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

const getStatusBadgeInfo = (status) => {
    switch (status) {
        case 'received':
            return { label: 'RECEIVED', type: 'warning', icon: 'pending_actions' };
        case 'diagnosed':
            return { label: 'DIAGNOSED', type: 'neutral', icon: 'handyman' };
        case 'in_progress':
            return { label: 'IN PROGRESS', type: 'progress', icon: 'build' };
        case 'ready':
            return { label: 'READY FOR PICKUP', type: 'info', icon: 'task_alt' };
        case 'completed':
            return { label: 'COMPLETED (PICKED UP)', type: 'success', icon: 'check_circle' };
        case 'cancelled':
            return { label: 'CANCELLED', type: 'error', icon: 'cancel' };
        default:
            return { label: (status || 'UNKNOWN').toUpperCase(), type: 'neutral', icon: 'schedule' };
    }
};

const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function WorkOrders() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [workOrders, setWorkOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTerm, setFilterTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [notification, setNotification] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchWorkOrders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/work-orders`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setWorkOrders(json.data);
                }
            } else {
                showNotification('Failed to fetch work orders from server', 'error');
            }
        } catch (err) {
            console.error('Error fetching work orders:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/work-orders/${deleteTarget.work_order_id}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to delete work order.', 'error');
                return;
            }

            showNotification(`🗑️ Work order [${deleteTarget.work_order_id}] was deleted successfully!`, 'success');
            setDeleteTarget(null);
            fetchWorkOrders();
        } catch (err) {
            showNotification(`Error deleting work order: ${err.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        fetchWorkOrders();
    }, []);

    // Filter Logic
    const filteredOrders = workOrders.filter((order) => {
        const query = (searchTerm || filterTerm).toLowerCase();
        const matchesQuery =
            (order.work_order_id || '').toLowerCase().includes(query) ||
            (order.make || '').toLowerCase().includes(query) ||
            (order.model || '').toLowerCase().includes(query) ||
            (order.vin || '').toLowerCase().includes(query) ||
            (order.license_plate || '').toLowerCase().includes(query) ||
            (order.owner_name || '').toLowerCase().includes(query) ||
            (order.assigned_staff_name || '').toLowerCase().includes(query);

        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

        return matchesQuery && matchesStatus;
    });

    // KPI Metrics calculation
    const inBayCount = workOrders.filter((w) => w.status === 'in_progress' || w.bay_assigned).length;
    const receivedCount = workOrders.filter((w) => w.status === 'received').length;
    const diagnosedCount = workOrders.filter((w) => w.status === 'diagnosed').length;
    const readyPickupCount = workOrders.filter((w) => w.status === 'ready').length;
    const completedCount = workOrders.filter((w) => w.status === 'completed').length;
    const totalEstRevenue = workOrders.reduce(
        (sum, w) => sum + (parseFloat(w.total_cost) || parseFloat(w.estimated_cost) || 0),
        0
    );

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

                        <div className="search-box">
                            <span className="material-symbols-outlined search-icon">search</span>
                            <input
                                type="text"
                                placeholder="Search Work Orders, VIN, or Owners..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-right">
                        <button className="icon-btn" onClick={fetchWorkOrders} title="Refresh Work Orders">
                            <span className="material-symbols-outlined">refresh</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="orders-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`orders-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Page Title & Action Buttons */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Active Work Orders</h2>
                                <p className="page-subtitle">Manage and track live in-progress vehicle repairs and bill of materials.</p>
                            </div>

                            <div className="action-buttons">
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => setStatusFilter(statusFilter === 'all' ? 'in_progress' : 'all')}
                                >
                                    <span className="material-symbols-outlined">filter_list</span>
                                    <span>{statusFilter === 'all' ? 'Filter: All' : `Filter: ${statusFilter.toUpperCase()}`}</span>
                                </button>
                                <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined">add</span>
                                    <span>New Vehicle Intake</span>
                                </Link>
                            </div>
                        </div>

                        {/* Micro Stats Grid */}
                        <div className="stats-grid">
                            <div
                                className={`stat-card ${statusFilter === 'in_progress' ? 'stat-active' : ''}`}
                                onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className="stat-title">In Active Repair</span>
                                <span className="stat-number text-highlight">{inBayCount}</span>
                            </div>
                            <div
                                className={`stat-card border-warning ${statusFilter === 'received' ? 'stat-active' : ''}`}
                                onClick={() => setStatusFilter(statusFilter === 'received' ? 'all' : 'received')}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className="stat-title">Received Queue</span>
                                <span className="stat-number text-warning">{receivedCount}</span>
                            </div>
                            <div
                                className={`stat-card ${statusFilter === 'ready' ? 'stat-active' : ''}`}
                                onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className="stat-title">Ready for Pickup</span>
                                <span className="stat-number" style={{ color: '#2dd4bf' }}>{readyPickupCount}</span>
                            </div>
                            <div
                                className={`stat-card border-success ${statusFilter === 'completed' ? 'stat-active' : ''}`}
                                onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className="stat-title">Picked Up / Done</span>
                                <span className="stat-number text-success">{completedCount}</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-title">Est. Revenue</span>
                                <span className="stat-number font-mono">
                                    ${totalEstRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
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
                                    <button className="toolbar-btn" title="Refresh Live Data" onClick={fetchWorkOrders}>
                                        <span className="material-symbols-outlined">refresh</span>
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
                                            <th>Lead Tech</th>
                                            <th>Bay</th>
                                            <th>Total Cost</th>
                                            <th>Date In</th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="9" className="empty-table-state">
                                                    Loading work orders...
                                                </td>
                                            </tr>
                                        ) : filteredOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="empty-table-state">
                                                    No work orders found matching the criteria. Click <Link to="/intake" style={{ color: 'var(--accent-yellow)', fontWeight: 700 }}>"New Vehicle Intake"</Link> to create one.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredOrders.map((order) => {
                                                const badge = getStatusBadgeInfo(order.status);
                                                const formattedDate = order.created_at
                                                    ? new Date(order.created_at).toLocaleDateString('en-US', {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })
                                                    : '--';

                                                return (
                                                    <tr
                                                        key={order.work_order_id}
                                                        className="table-row"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => navigate(`/work-orders/${order.work_order_id}`)}
                                                    >
                                                        <td className="font-mono wo-id">{order.work_order_id}</td>
                                                        <td>
                                                            <div className="vehicle-cell">
                                                                <div className="vehicle-icon-box">
                                                                    <span className="material-symbols-outlined">
                                                                        directions_car
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <div className="vehicle-name">
                                                                        {order.year} {order.make} {order.model}
                                                                    </div>
                                                                    <div className="vehicle-vin font-mono">
                                                                        {order.license_plate ? `Plate: ${order.license_plate}` : `VIN: ${order.vin}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div
                                                                className="owner-cell"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (order.owner_id) navigate(`/owners/${order.owner_id}`);
                                                                    else navigate('/owners');
                                                                }}
                                                            >
                                                                <div className="avatar-circle">{getInitials(order.owner_name)}</div>
                                                                <span>
                                                                    {order.owner_name} {order.owner_is_vip && <span style={{ color: 'var(--accent-yellow)' }}>★</span>}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`status-pill status-${badge.type}`}>
                                                                {badge.type === 'progress' && (
                                                                    <span className="status-dot animate-pulse"></span>
                                                                )}
                                                                <span className="material-symbols-outlined status-icon">
                                                                    {badge.icon}
                                                                </span>
                                                                {badge.label}
                                                            </span>
                                                        </td>
                                                        <td className="text-muted">
                                                            {order.assigned_staff_name || (
                                                                <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Unassigned</span>
                                                            )}
                                                        </td>
                                                        <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            {order.bay_assigned || '--'}
                                                        </td>
                                                        <td className="font-mono" style={{ color: 'var(--accent-yellow)', fontWeight: 700 }}>
                                                            ${parseFloat(order.total_cost || order.estimated_cost || 0).toFixed(2)}
                                                        </td>
                                                        <td className="text-muted font-mono" style={{ fontSize: '11px' }}>
                                                            {formattedDate}
                                                        </td>
                                                        <td className="text-right">
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                                {(order.status === 'received' || order.status === 'diagnosed') && (
                                                                    <button
                                                                        type="button"
                                                                        title="Delete work order (Receive / Diagnose phase only)"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setDeleteTarget(order);
                                                                        }}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: '1px solid rgba(239, 68, 68, 0.35)',
                                                                            color: '#f87171',
                                                                            width: '32px',
                                                                            height: '32px',
                                                                            borderRadius: '6px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s ease',
                                                                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                                                                            e.currentTarget.style.borderColor = '#ef4444';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                                                                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                                                                        }}
                                                                    >
                                                                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                                                    </button>
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    className="view-order-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/work-orders/${order.work_order_id}`);
                                                                    }}
                                                                >
                                                                    <span className="material-symbols-outlined">arrow_forward</span>
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

                            {/* Table Pagination */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing {filteredOrders.length} of {workOrders.length} work orders
                                </span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal Overlay: Delete Work Order Confirmation */}
            {deleteTarget && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '16px',
                    }}
                    onClick={() => !isDeleting && setDeleteTarget(null)}
                >
                    <div
                        style={{
                            backgroundColor: 'var(--bg-olive-card, #202b22)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '12px',
                            maxWidth: '480px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '8px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>warning</span>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-main, #f0f4f1)' }}>
                                    Delete Work Order
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted, #a3b1a6)' }}>
                                    Confirm complete removal from workshop queue
                                </p>
                            </div>
                        </div>

                        <div
                            style={{
                                backgroundColor: 'rgba(22, 30, 24, 0.8)',
                                border: '1px solid rgba(255, 216, 95, 0.15)',
                                borderRadius: '8px',
                                padding: '14px',
                                marginBottom: '16px',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Work Order ID:</span>
                                <strong style={{ fontFamily: 'monospace', color: 'var(--accent-yellow)' }}>{deleteTarget.work_order_id}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Vehicle:</span>
                                <strong>{deleteTarget.year} {deleteTarget.make} {deleteTarget.model}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Owner:</span>
                                <span>{deleteTarget.owner_name}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Phase:</span>
                                <span
                                    style={{
                                        textTransform: 'uppercase',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#38bdf8',
                                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                    }}
                                >
                                    {deleteTarget.status}
                                </span>
                            </div>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                            Are you sure you want to delete this work order? Any allocated parts will be automatically returned back to inventory stock.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                style={{
                                    height: '38px',
                                    padding: '0 16px',
                                    backgroundColor: 'transparent',
                                    border: '1px solid var(--border-glass, rgba(255, 216, 95, 0.15))',
                                    color: 'var(--text-muted)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                style={{
                                    height: '38px',
                                    padding: '0 18px',
                                    backgroundColor: '#ef4444',
                                    border: 'none',
                                    color: '#ffffff',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                {isDeleting ? 'Deleting...' : 'Delete Work Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}