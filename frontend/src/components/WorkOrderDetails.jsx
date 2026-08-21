import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TaxInvoiceModal from './TaxInvoiceModal';
import './css/WorkOrderDetails.css';

const API_BASE_URL = 'http://localhost:5000/api';

const STATUS_STEPS = [
    { key: 'received', label: 'Received', icon: 'pending_actions' },
    { key: 'diagnosed', label: 'Diagnosed', icon: 'handyman' },
    { key: 'in_progress', label: 'In Progress', icon: 'build' },
    { key: 'ready', label: 'Ready for Pickup', icon: 'task_alt' },
    { key: 'completed', label: 'Completed (Picked Up)', icon: 'check_circle' },
];

export default function WorkOrderDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [noteText, setNoteText] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [notification, setNotification] = useState(null);

    // Invoice State
    const [invoiceData, setInvoiceData] = useState(null);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

    // Full Activity Log Modal State
    const [isFullLogOpen, setIsFullLogOpen] = useState(false);

    // Modal state for adding Part/Labor
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [itemType, setItemType] = useState('part');
    const [inventoryList, setInventoryList] = useState([]);
    const [itemFormData, setItemFormData] = useState({
        part_id: '',
        description: '',
        quantity_or_hours: '1',
        unit_price: '',
    });
    const [isSubmittingItem, setIsSubmittingItem] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchInvoiceDetails = async (targetId) => {
        if (!targetId) return;
        try {
            const res = await fetch(`${API_BASE_URL}/invoices/${encodeURIComponent(targetId)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    setInvoiceData(json.data);
                } else {
                    setInvoiceData(null);
                }
            } else {
                setInvoiceData(null);
            }
        } catch (err) {
            setInvoiceData(null);
        }
    };

    const fetchOrderDetails = async () => {
        setIsLoading(true);
        try {
            const cleanId = id ? id.replace('#', '').trim() : '';
            if (!cleanId || cleanId.toLowerCase() === 'details') {
                const listRes = await fetch(`${API_BASE_URL}/work-orders`);
                if (listRes.ok) {
                    const listJson = await listRes.json();
                    if (listJson.success && Array.isArray(listJson.data) && listJson.data.length > 0) {
                        navigate(`/work-orders/${listJson.data[0].work_order_id}`, { replace: true });
                        return;
                    }
                }
                setIsLoading(false);
                setOrder(null);
                return;
            }

            const res = await fetch(`${API_BASE_URL}/work-orders/${encodeURIComponent(cleanId)}`);
            if (!res.ok) {
                showNotification(`Work order '${cleanId}' not found`, 'error');
                setOrder(null);
                return;
            }
            const json = await res.json();
            if (json.success && json.data) {
                setOrder(json.data);
                fetchInvoiceDetails(json.data.work_order_id);
            } else {
                setOrder(null);
            }
        } catch (err) {
            console.error('Error fetching work order details:', err);
            showNotification(`Error: ${err.message}`, 'error');
            setOrder(null);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInventoryForPicker = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/inventory/items`);
            if (res.ok) {
                const json = await res.json();
                if (json.success) setInventoryList(json.data || []);
            }
        } catch (err) {
            console.warn('Inventory lookup notice:', err.message);
        }
    };

    useEffect(() => {
        fetchOrderDetails();
        fetchInventoryForPicker();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Handle Status Change
    const handleStatusChange = async (newStatus) => {
        if (!order) return;
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${order.work_order_id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                showNotification(`Status updated to ${newStatus.toUpperCase()}!`, 'success');
                fetchOrderDetails();
            } else {
                const errData = await res.json();
                showNotification(errData.error || 'Failed to update status', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Add Internal Activity Note
    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!noteText.trim() || !order) return;

        setIsSubmittingNote(true);
        try {
            const res = await fetch(`${API_BASE_URL}/work-orders/${order.work_order_id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: noteText.trim() }),
            });

            if (res.ok) {
                showNotification('Activity note added to timeline', 'success');
                setNoteText('');
                fetchOrderDetails();
            } else {
                const errData = await res.json();
                showNotification(errData.error || 'Failed to add note', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsSubmittingNote(false);
        }
    };

    // Part selection in modal
    const handlePartSelect = (e) => {
        const partId = e.target.value;
        if (!partId) {
            setItemFormData((prev) => ({ ...prev, part_id: '', unit_price: '', description: '' }));
            return;
        }
        const selected = inventoryList.find((i) => i.part_id === parseInt(partId, 10));
        if (selected) {
            setItemFormData((prev) => ({
                ...prev,
                part_id: String(selected.part_id),
                description: `${selected.part_name} (${selected.sku})`,
                unit_price: String(selected.selling_price || '0.00'),
            }));
        }
    };

    // Invoice Handlers
    const handleCreateInvoice = async () => {
        if (!order) return;
        setIsGeneratingInvoice(true);
        try {
            const res = await fetch(`${API_BASE_URL}/invoices/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ work_order_id: order.work_order_id }),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showNotification('Tax Invoice created successfully!', 'success');
                // Fetch full invoice details
                const invRes = await fetch(`${API_BASE_URL}/invoices/${encodeURIComponent(json.data.invoice_id)}`);
                if (invRes.ok) {
                    const invJson = await invRes.json();
                    setInvoiceData(invJson.data);
                } else {
                    setInvoiceData(json.data);
                }
                setIsInvoiceModalOpen(true);
            } else {
                showNotification(json.error || 'Failed to generate invoice', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsGeneratingInvoice(false);
        }
    };

    const handleOpenInvoice = async () => {
        if (invoiceData) {
            setIsInvoiceModalOpen(true);
            return;
        }
        if (!order) return;
        try {
            const res = await fetch(`${API_BASE_URL}/invoices/${encodeURIComponent(order.work_order_id)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    setInvoiceData(json.data);
                    setIsInvoiceModalOpen(true);
                    return;
                }
            }
            // If not existing yet and status is ready, create it
            if (order.status === 'ready') {
                handleCreateInvoice();
            }
        } catch (err) {
            if (order.status === 'ready') {
                handleCreateInvoice();
            }
        }
    };

    // Mark Invoice as Paid (Admin / Staff action)
    const handleMarkInvoicePaid = async () => {
        if (!invoiceData) return;
        try {
            const res = await fetch(`${API_BASE_URL}/invoices/${encodeURIComponent(invoiceData.invoice_id)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'paid' }),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showNotification('Invoice successfully marked as PAID!', 'success');
                fetchInvoiceDetails(order.work_order_id);
            } else {
                showNotification(json.error || 'Failed to update invoice status', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Submit new Part / Labor line item
    const handleAddItemSubmit = async (e) => {
        e.preventDefault();
        if (!order) return;

        setIsSubmittingItem(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${order.work_order_id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_type: itemType,
                    part_id: itemType === 'part' ? itemFormData.part_id : null,
                    description: itemFormData.description,
                    quantity_or_hours: itemFormData.quantity_or_hours,
                    unit_price: itemFormData.unit_price,
                }),
            });

            if (res.ok) {
                showNotification(`Added ${itemType.toUpperCase()} item to work order!`, 'success');
                setIsAddItemModalOpen(false);
                setItemFormData({ part_id: '', description: '', quantity_or_hours: '1', unit_price: '' });
                fetchOrderDetails();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to add item', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsSubmittingItem(false);
        }
    };

    // Delete Line item
    const handleDeleteItem = async (itemId) => {
        if (!order || !window.confirm('Are you sure you want to remove this line item?')) return;

        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${order.work_order_id}/items/${itemId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                showNotification('Line item removed from work order', 'info');
                fetchOrderDetails();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    if (isLoading) {
        return (
            <div className="wo-details-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="wo-details-wrapper loading-center">
                    <span className="material-symbols-outlined spinning-icon" style={{ fontSize: '48px', color: 'var(--accent-yellow)' }}>
                        build
                    </span>
                    <p style={{ fontFamily: 'JetBrains Mono', marginTop: '14px', color: 'var(--text-muted)' }}>
                        Loading Work Order details from database...
                    </p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="wo-details-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="wo-details-wrapper loading-center">
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>Work order not found.</p>
                    <button className="primary-btn" onClick={() => navigate('/work-orders')}>
                        Back to Work Orders
                    </button>
                </div>
            </div>
        );
    }

    // Financial totals
    const itemsList = order.items || [];
    const subtotal = itemsList.reduce(
        (sum, item) => sum + parseFloat(item.total_price || (item.quantity_or_hours * item.unit_price) || 0),
        0
    );
    const total = subtotal;

    // Timeline list
    const timelineList = order.timeline || [];

    // Current step index
    const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);

    return (
        <div className="wo-details-layout">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport */}
            <div className="wo-details-wrapper">
                {/* Header Bar */}
                <header className="details-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">Work Order Details</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchOrderDetails} title="Refresh Live Data">
                            <span className="material-symbols-outlined">refresh</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Workspace */}
                <main className="details-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`details-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Top Page Control Header */}
                        <div className="page-header-row">
                            <div className="title-stack">
                                <div className="title-inline">
                                    <Link to="/work-orders" className="back-btn" aria-label="Go back">
                                        <span className="material-symbols-outlined">arrow_back</span>
                                    </Link>
                                    <h2 className="order-id">{order.work_order_id}</h2>
                                    <span className={`badge badge-${order.status === 'in_progress' ? 'warning' : order.status === 'ready' ? 'cyan' : order.status === 'completed' ? 'success' : 'info'} font-mono`}>
                                        {(order.status === 'ready' ? 'READY FOR PICKUP' : order.status === 'completed' ? 'COMPLETED (PICKED UP)' : order.status || 'received').replace('_', ' ').toUpperCase()}
                                    </span>
                                </div>
                                <p className="order-meta-desc">
                                    {order.year} {order.make} {order.model} • Owner: <strong>{order.owner_name}</strong> ({order.owner_phone}) • VIN: <span className="font-mono">{order.vin}</span>
                                </p>
                            </div>

                            <div className="page-actions">
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => navigate(`/staff/work-orders/${order.work_order_id}`)}
                                >
                                    <span className="material-symbols-outlined">engineering</span>
                                    <span>Staff Execution Hub</span>
                                </button>

                                {/* Invoice Creation Button: ONLY AVAILABLE WHEN STATUS IS READY FOR PICKUP */}
                                {order.status === 'ready' && !invoiceData && (
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={handleCreateInvoice}
                                        disabled={isGeneratingInvoice}
                                        style={{
                                            backgroundColor: 'var(--accent-yellow)',
                                            color: 'var(--bg-olive-dark)',
                                            fontWeight: 700,
                                        }}
                                        title="Create official Tax Invoice for this vehicle"
                                    >
                                        <span className="material-symbols-outlined">receipt_long</span>
                                        <span>{isGeneratingInvoice ? 'Creating Invoice...' : '➕ Create Tax Invoice'}</span>
                                    </button>
                                )}

                                {/* View Invoice Button (When invoice already exists) */}
                                {invoiceData && (
                                    <button
                                        type="button"
                                        className="secondary-btn"
                                        onClick={handleOpenInvoice}
                                        title="View & Print official Tax Invoice"
                                    >
                                        <span className="material-symbols-outlined">receipt_long</span>
                                        <span>📄 View Tax Invoice</span>
                                    </button>
                                )}

                                {/* Mark Invoice as Paid Button (When invoice exists and is unpaid) */}
                                {invoiceData && invoiceData.status !== 'paid' && (
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={handleMarkInvoicePaid}
                                        style={{ backgroundColor: 'var(--status-success)', color: '#000', fontWeight: 700 }}
                                        title="Mark this invoice as settled and paid"
                                    >
                                        <span className="material-symbols-outlined">paid</span>
                                        <span>Mark as Paid</span>
                                    </button>
                                )}

                                {/* Invoice Paid Badge */}
                                {invoiceData && invoiceData.status === 'paid' && (
                                    <span className="badge badge-cyan font-mono" style={{ padding: '8px 12px', fontSize: '11px' }}>
                                        ✓ INVOICE PAID
                                    </span>
                                )}

                                {order.status !== 'ready' && order.status !== 'completed' && (
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleStatusChange('ready')}
                                        title="Mark vehicle as repaired and ready for customer pickup"
                                    >
                                        <span className="material-symbols-outlined">task_alt</span>
                                        <span>Mark Ready for Pickup</span>
                                    </button>
                                )}

                                {order.status === 'ready' && (
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleStatusChange('completed')}
                                        style={{ backgroundColor: 'var(--status-success)', color: '#000' }}
                                        title="Confirm customer has picked up their vehicle"
                                    >
                                        <span className="material-symbols-outlined">check_circle</span>
                                        <span>Confirm Owner Pickup & Complete</span>
                                    </button>
                                )}

                                {order.status === 'completed' && (
                                    <span className="badge badge-success font-mono" style={{ padding: '8px 14px', fontSize: '12px' }}>
                                        ✓ VEHICLE PICKED UP & COMPLETED
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Active Repair Status Stepper */}
                        <section className="stepper-card">
                            <h3 className="section-title">Repair Lifecycle Status</h3>
                            <div className="stepper-track">
                                {/* Connecting background and active progress line */}
                                <div className="stepper-line-container">
                                    <div className="stepper-line-bg"></div>
                                    <div
                                        className="stepper-line-fill"
                                        style={{
                                            width: currentStepIdx >= 0 ? `${(currentStepIdx / (STATUS_STEPS.length - 1)) * 100}%` : '0%',
                                        }}
                                    ></div>
                                </div>

                                {STATUS_STEPS.map((step, idx) => {
                                    const isCompleted = currentStepIdx > idx;
                                    const isActive = currentStepIdx === idx;
                                    const isPending = currentStepIdx < idx;

                                    return (
                                        <div
                                            key={step.key}
                                            className={`step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''} ${isPending ? 'disabled' : ''}`}
                                            onClick={() => handleStatusChange(step.key)}
                                            style={{ cursor: 'pointer' }}
                                            title={`Click to set status to ${step.label}`}
                                        >
                                            <div className={`step-icon ${isActive ? 'pulse-glow' : ''}`}>
                                                <span className="material-symbols-outlined">
                                                    {isCompleted ? 'check' : step.icon}
                                                </span>
                                            </div>
                                            <span className={`step-label ${isActive ? 'active-text' : ''}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Two Column Grid Section */}
                        <div className="details-grid">
                            {/* Left Column (Required Work & Items Table) */}
                            <div className="left-column">
                                {/* Required Work / Observations Card */}
                                <article className="info-card">
                                    <div className="card-header-row">
                                        <h3>Required Work & Observations</h3>
                                        <div className="badge-meta-row">
                                            {order.bay_assigned && (
                                                <span className="meta-pill">📍 {order.bay_assigned}</span>
                                            )}
                                            {order.assigned_staff_name && (
                                                <span className="meta-pill">🔧 {order.assigned_staff_name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="work-description">
                                        {order.initial_observations || 'No initial observations recorded for this vehicle intake.'}
                                    </p>
                                </article>

                                {/* Parts & Labor Breakdown Card */}
                                <article className="info-card">
                                    <div className="card-header-row">
                                        <h3>Parts & Labor (Bill of Materials)</h3>
                                        <div className="header-btn-group">
                                            <button
                                                type="button"
                                                className="secondary-btn-sm"
                                                onClick={() => {
                                                    setItemType('part');
                                                    setIsAddItemModalOpen(true);
                                                }}
                                            >
                                                <span className="material-symbols-outlined">add</span> Add Part
                                            </button>
                                            <button
                                                type="button"
                                                className="secondary-btn-sm"
                                                onClick={() => {
                                                    setItemType('labor');
                                                    setIsAddItemModalOpen(true);
                                                }}
                                            >
                                                <span className="material-symbols-outlined">handyman</span> Add Labor
                                            </button>
                                        </div>
                                    </div>

                                    <div className="table-responsive">
                                        <table className="breakdown-table">
                                            <thead>
                                                <tr>
                                                    <th>Type</th>
                                                    <th>Description / SKU</th>
                                                    <th className="text-right">Qty/Hrs</th>
                                                    <th className="text-right">Unit Price</th>
                                                    <th className="text-right">Total</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {itemsList.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="empty-items-cell">
                                                            No parts or labor line items added yet. Click "+ Add Part" or "+ Add Labor" above.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    itemsList.map((item) => (
                                                        <tr key={item.item_id} className="table-row">
                                                            <td>
                                                                <span
                                                                    className={`type-tag ${
                                                                        item.item_type === 'part' ? 'tag-part' : 'tag-labor'
                                                                    }`}
                                                                >
                                                                    {item.item_type.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div className="item-title">{item.description}</div>
                                                                {item.sku && (
                                                                    <div className="item-sku font-mono">SKU: {item.sku}</div>
                                                                )}
                                                            </td>
                                                            <td className="text-right font-mono">
                                                                {parseFloat(item.quantity_or_hours).toFixed(1)}
                                                            </td>
                                                            <td className="text-right font-mono">
                                                                ${parseFloat(item.unit_price).toFixed(2)}
                                                            </td>
                                                            <td className="text-right font-mono highlight">
                                                                ${parseFloat(item.total_price || (item.quantity_or_hours * item.unit_price) || 0).toFixed(2)}
                                                            </td>
                                                            <td className="text-right">
                                                                <button
                                                                    type="button"
                                                                    className="delete-item-icon-btn"
                                                                    title="Remove Item"
                                                                    onClick={() => handleDeleteItem(item.item_id)}
                                                                >
                                                                    <span className="material-symbols-outlined">delete</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="total-row">
                                                    <td colSpan="3"></td>
                                                    <td className="text-right total-label font-mono">Grand Total</td>
                                                    <td className="text-right total-amount font-mono" colSpan="2">
                                                        ${total.toFixed(2)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </article>
                            </div>

                            {/* Right Column (Activity Timeline & Notes - Constrained Height) */}
                            <div className="right-column">
                                <article className="info-card timeline-card">
                                    <div className="card-header-row">
                                        <h3>Activity Log & Audit Trail</h3>
                                        {timelineList.length > 0 && (
                                            <button
                                                type="button"
                                                className="see-full-log-btn"
                                                onClick={() => setIsFullLogOpen(true)}
                                                title="View complete activity history"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>history</span>
                                                <span>See Full Log ({timelineList.length})</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="timeline-wrapper-contained">
                                        {timelineList.length === 0 ? (
                                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '16px 0', fontFamily: 'JetBrains Mono' }}>
                                                No activity logs recorded yet.
                                            </p>
                                        ) : (
                                            timelineList.slice(0, 4).map((entry, idx) => {
                                                const timeStr = entry.created_at
                                                    ? new Date(entry.created_at).toLocaleDateString('en-US', {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })
                                                    : 'Recent';

                                                return (
                                                    <div
                                                        key={entry.log_id || idx}
                                                        className={`timeline-row ${idx === 0 ? 'is-latest' : ''}`}
                                                    >
                                                        <span className="timeline-node"></span>
                                                        <span className="timeline-timestamp font-mono">{timeStr}</span>
                                                        <div className="timeline-box">
                                                            <p className="timeline-text">{entry.description}</p>
                                                            {entry.staff_name && (
                                                                <span className="timeline-author">By: {entry.staff_name}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}

                                        {timelineList.length > 4 && (
                                            <div style={{ textAlign: 'center', padding: '4px 0' }}>
                                                <button
                                                    type="button"
                                                    className="expand-log-pill-btn"
                                                    onClick={() => setIsFullLogOpen(true)}
                                                >
                                                    + {timelineList.length - 4} older activity entries... View Full Log
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <form onSubmit={handleAddNote} className="note-form">
                                        <input
                                            type="text"
                                            placeholder="Add internal note to audit trail..."
                                            value={noteText}
                                            onChange={(e) => setNoteText(e.target.value)}
                                            disabled={isSubmittingNote}
                                        />
                                        <button type="submit" aria-label="Send note" disabled={isSubmittingNote}>
                                            <span className="material-symbols-outlined">send</span>
                                        </button>
                                    </form>
                                </article>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal: Full Activity Log List */}
            {isFullLogOpen && (
                <div className="wo-modal-overlay" onClick={() => setIsFullLogOpen(false)}>
                    <div className="wo-modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-row">
                            <div className="modal-title-wrap">
                                <span className="material-symbols-outlined modal-icon">history</span>
                                <h3>Complete Activity Log ({timelineList.length} Events)</h3>
                            </div>
                            <button
                                type="button"
                                className="modal-close-icon"
                                onClick={() => setIsFullLogOpen(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div style={{ maxHeight: '480px', overflowY: 'auto', paddingRight: '8px' }}>
                            <div className="timeline-wrapper" style={{ margin: '16px 0 16px 12px' }}>
                                {timelineList.map((entry, idx) => {
                                    const timeStr = entry.created_at
                                        ? new Date(entry.created_at).toLocaleDateString('en-US', {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })
                                        : 'Recent';

                                    return (
                                        <div
                                            key={entry.log_id || idx}
                                            className={`timeline-row ${idx === 0 ? 'is-latest' : ''}`}
                                        >
                                            <span className="timeline-node"></span>
                                            <span className="timeline-timestamp font-mono">{timeStr}</span>
                                            <div className="timeline-box">
                                                <p className="timeline-text">{entry.description}</p>
                                                {entry.staff_name && (
                                                    <span className="timeline-author">By: {entry.staff_name}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="modal-footer-row">
                            <button
                                type="button"
                                className="primary-btn"
                                onClick={() => setIsFullLogOpen(false)}
                            >
                                Close Log
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Official Tax Invoice PDF & Print */}
            {isInvoiceModalOpen && (
                <TaxInvoiceModal
                    invoice={invoiceData || {
                        ...order,
                        subtotal: total,
                        total_amount: total * 1.05,
                        tax_amount: total * 0.05,
                        date_issued: new Date().toISOString().split('T')[0],
                    }}
                    onClose={() => setIsInvoiceModalOpen(false)}
                />
            )}

            {/* Modal Overlay: Add Part / Labor Line Item */}
            {isAddItemModalOpen && (
                <div className="wo-modal-overlay">
                    <div className="wo-modal-content">
                        <div className="modal-header-row">
                            <div className="modal-title-wrap">
                                <span className="material-symbols-outlined modal-icon">
                                    {itemType === 'part' ? 'inventory_2' : 'build'}
                                </span>
                                <h3>{itemType === 'part' ? 'Add Inventory Part' : 'Add Labor Hours'}</h3>
                            </div>
                            <button
                                type="button"
                                className="modal-close-icon"
                                onClick={() => setIsAddItemModalOpen(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleAddItemSubmit} className="wo-modal-form">
                            {itemType === 'part' && (
                                <div className="form-group">
                                    <label>SELECT SPARE PART FROM INVENTORY</label>
                                    <select
                                        value={itemFormData.part_id}
                                        onChange={handlePartSelect}
                                        className="modal-input"
                                    >
                                        <option value="">-- Choose from inventory_data --</option>
                                        {inventoryList.map((inv) => (
                                            <option key={inv.part_id} value={inv.part_id}>
                                                {inv.part_name} ({inv.sku}) • Stock: {inv.stock_quantity} • ${parseFloat(inv.selling_price).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>DESCRIPTION *</label>
                                <input
                                    type="text"
                                    placeholder={itemType === 'part' ? 'Part title' : 'e.g. Brake Caliper Replacement & Fluid Flush'}
                                    value={itemFormData.description}
                                    onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                                    className="modal-input"
                                    required
                                />
                            </div>

                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label>{itemType === 'part' ? 'QUANTITY' : 'HOURS'} *</label>
                                    <input
                                        type="number"
                                        step={itemType === 'part' ? '1' : 'any'}
                                        min={itemType === 'part' ? '1' : '0.1'}
                                        value={itemFormData.quantity_or_hours}
                                        onChange={(e) => setItemFormData({ ...itemFormData, quantity_or_hours: e.target.value })}
                                        className="modal-input font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>UNIT PRICE / RATE ($) *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        placeholder="0.00"
                                        value={itemFormData.unit_price}
                                        onChange={(e) => setItemFormData({ ...itemFormData, unit_price: e.target.value })}
                                        className="modal-input font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-row">
                                <button
                                    type="button"
                                    className="modal-cancel-btn"
                                    onClick={() => setIsAddItemModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={isSubmittingItem}
                                >
                                    {isSubmittingItem ? 'Adding Item...' : 'Add to Work Order'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}