import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import './css/Inventory.css';

const API_BASE_URL = 'http://localhost:5000/api';

const DEFAULT_CATEGORIES = [
    'Brakes',
    'Fluids & Oils',
    'Filters',
    'Ignition & Spark',
    'Electrical & Battery',
    'Suspension & Steering',
    'Tires & Wheels',
    'Exhaust',
    'Engine Components',
    'General Hardware',
];

const INITIAL_FORM_STATE = {
    sku: '',
    part_name: '',
    category: 'Brakes',
    stock_quantity: '10',
    reorder_threshold: '5',
    unit_cost: '0.00',
    selling_price: '0.00',
};

export default function Inventory() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [kpi, setKpi] = useState({
        totalValue: '$0.00',
        lowStockAlerts: 0,
        totalItems: 0,
        totalSKUs: 0,
        categoriesCount: 0,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Add Part Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM_STATE);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Restock Modal State
    const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
    const [restockTarget, setRestockTarget] = useState(null);
    const [restockQty, setRestockQty] = useState('10');
    const [restockUnitCost, setRestockUnitCost] = useState('');
    const [isRestocking, setIsRestocking] = useState(false);

    // Edit Part Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editFormData, setEditFormData] = useState({
        sku: '',
        part_name: '',
        category: 'General Hardware',
        stock_quantity: '0',
        reorder_threshold: '5',
        unit_cost: '0.00',
        selling_price: '0.00',
    });
    const [isEditing, setIsEditing] = useState(false);

    // Delete Confirmation Modal State
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Toast Notification
    const [notification, setNotification] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Fetch live inventory data from PostgreSQL via backend API
    const loadInventoryData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/inventory`);
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setItems(json.data || []);
                    if (json.kpi) {
                        setKpi(json.kpi);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load inventory:', err);
            showNotification('Could not connect to inventory database', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInventoryData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name === 'sku' ? value.toUpperCase() : value,
        }));
    };

    const handleOpenModal = () => {
        setFormData(INITIAL_FORM_STATE);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    // Open Restock Modal for a specific part
    const handleOpenRestockModal = (item) => {
        setRestockTarget(item);
        setRestockQty('10');
        setRestockUnitCost(item.unit_cost ? String(item.unit_cost) : '');
        setIsRestockModalOpen(true);
    };

    const handleCloseRestockModal = () => {
        setIsRestockModalOpen(false);
        setRestockTarget(null);
    };

    const handleAddPart = async (e) => {
        e.preventDefault();

        if (!formData.sku.trim() || !formData.part_name.trim()) {
            showNotification('SKU and Part Name are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sku: formData.sku.trim(),
                    part_name: formData.part_name.trim(),
                    category: formData.category,
                    stock_quantity: parseInt(formData.stock_quantity, 10) || 0,
                    reorder_threshold: parseInt(formData.reorder_threshold, 10) || 5,
                    unit_cost: parseFloat(formData.unit_cost) || 0.0,
                    selling_price: parseFloat(formData.selling_price) || 0.0,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to add part to inventory.', 'error');
                return;
            }

            showNotification(`🎉 Part [${data.data.sku}] ${data.data.part_name} added to inventory!`, 'success');
            setIsModalOpen(false);
            setFormData(INITIAL_FORM_STATE);
            loadInventoryData();
        } catch (err) {
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Submit Restock Quantity
    const handleRestockSubmit = async (e) => {
        e.preventDefault();

        if (!restockTarget) return;

        const qty = parseInt(restockQty, 10);
        if (isNaN(qty) || qty <= 0) {
            showNotification('Please enter a valid positive quantity to add.', 'error');
            return;
        }

        setIsRestocking(true);
        try {
            const res = await fetch(`${API_BASE_URL}/inventory/${restockTarget.part_id}/restock`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    added_quantity: qty,
                    unit_cost: restockUnitCost ? parseFloat(restockUnitCost) : undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to restock part.', 'error');
                return;
            }

            showNotification(
                `📦 Restocked +${qty} units of [${restockTarget.sku}]! New stock: ${data.data.stock_quantity}`,
                'success'
            );
            setIsRestockModalOpen(false);
            setRestockTarget(null);
            loadInventoryData();
        } catch (err) {
            showNotification(`Restock error: ${err.message}`, 'error');
        } finally {
            setIsRestocking(false);
        }
    };

    // Edit Part Modal Handlers
    const handleOpenEditModal = (item) => {
        setEditTarget(item);
        setEditFormData({
            sku: item.sku || '',
            part_name: item.name || item.part_name || '',
            category: item.category || 'General Hardware',
            stock_quantity: String(item.stock ?? item.stock_quantity ?? 0),
            reorder_threshold: String(item.reorder_threshold ?? 5),
            unit_cost: String(item.unit_cost ?? '0.00'),
            selling_price: String(item.selling_price ?? '0.00'),
        });
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!editTarget) return;

        setIsEditing(true);
        try {
            const partId = editTarget.part_id || editTarget.id;
            const res = await fetch(`${API_BASE_URL}/inventory/${partId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData),
            });

            if (res.ok) {
                showNotification(`Part [${editFormData.sku}] updated successfully!`, 'success');
                setIsEditModalOpen(false);
                setEditTarget(null);
                loadInventoryData();
            } else {
                const errData = await res.json();
                showNotification(errData.error || 'Failed to update part details.', 'error');
            }
        } catch (err) {
            showNotification(`Update error: ${err.message}`, 'error');
        } finally {
            setIsEditing(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const partId = deleteTarget.part_id || deleteTarget.id;
            const res = await fetch(`${API_BASE_URL}/inventory/${partId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                showNotification(`Part [${deleteTarget.sku}] removed from inventory database.`, 'info');
                setDeleteTarget(null);
                loadInventoryData();
            } else {
                const errData = await res.json();
                showNotification(errData.error || 'Could not delete part.', 'error');
            }
        } catch (err) {
            showNotification(`Delete failed: ${err.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredItems = items.filter((item) => {
        const search = searchTerm.toLowerCase();
        return (
            (item.sku || '').toLowerCase().includes(search) ||
            (item.name || '').toLowerCase().includes(search) ||
            (item.category || '').toLowerCase().includes(search)
        );
    });

    return (
        <div className="inventory-layout">
            {/* Sidebar Navigation */}
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

                        <button className="icon-btn" onClick={loadInventoryData} title="Refresh Inventory Data">
                            <span className="material-symbols-outlined">refresh</span>
                        </button>

                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>

                        <button type="button" className="primary-btn" onClick={handleOpenModal}>
                            <span className="material-symbols-outlined">add</span>
                            <span className="btn-text">Add Part</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="inventory-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`inventory-toast toast-${notification.type}`}>
                                <span className="material-symbols-outlined">
                                    {notification.type === 'error' ? 'error' : notification.type === 'info' ? 'info' : 'check_circle'}
                                </span>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* KPI Stats Bento Grid */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Total Value</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        account_balance_wallet
                                    </span>
                                </div>
                                <span className="kpi-value">{kpi.totalValue}</span>
                                <div className="kpi-trend text-success">
                                    <span className="material-symbols-outlined">trending_up</span>
                                    <span>Based on live cost</span>
                                </div>
                            </div>

                            <div className={`kpi-card ${kpi.lowStockAlerts > 0 ? 'warning-glow' : ''}`}>
                                <div className="kpi-top">
                                    <span className="kpi-title">Low Stock Alerts</span>
                                    <span className="material-symbols-outlined text-warning">
                                        warning
                                    </span>
                                </div>
                                <span className="kpi-value text-warning">{kpi.lowStockAlerts}</span>
                                <span className="kpi-subtext">Items below threshold</span>
                            </div>

                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Total Parts Catalog</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        inventory_2
                                    </span>
                                </div>
                                <span className="kpi-value">{kpi.totalSKUs}</span>
                                <span className="kpi-subtext">Unique SKU lines</span>
                            </div>

                            <div className="kpi-card">
                                <div className="kpi-top">
                                    <span className="kpi-title">Total Stock Count</span>
                                    <span className="material-symbols-outlined icon-muted">
                                        category
                                    </span>
                                </div>
                                <span className="kpi-value">{kpi.totalItems.toLocaleString()}</span>
                                <span className="kpi-subtext">Across {kpi.categoriesCount} categories</span>
                            </div>
                        </div>

                        {/* Main Table Card */}
                        <div className="table-card">
                            <div className="table-toolbar">
                                <h3 className="toolbar-title">Parts Inventory</h3>
                                <div className="toolbar-actions">
                                    <button type="button" className="toolbar-btn" onClick={loadInventoryData}>
                                        <span className="material-symbols-outlined">refresh</span>
                                        <span>Reload</span>
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
                                            <th className="text-right">Selling Price</th>
                                            <th className="text-center">Status</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="8" className="empty-table-state">
                                                    Loading inventory parts from database...
                                                </td>
                                            </tr>
                                        ) : filteredItems.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="empty-table-state">
                                                    No parts found in inventory. Click <strong>"Add Part"</strong> above to register your first spare part.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredItems.map((item) => (
                                                <tr
                                                    key={item.part_id || item.sku}
                                                    className={`table-row ${item.statusType === 'warning'
                                                            ? 'row-warning'
                                                            : item.statusType === 'error'
                                                                ? 'row-error'
                                                                : ''
                                                        }`}
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
                                                            }`}
                                                    >
                                                        {item.stock}
                                                    </td>
                                                    <td className="text-right font-mono text-muted">
                                                        {item.unitCost}
                                                    </td>
                                                    <td className="text-right font-mono" style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>
                                                        {item.sellingPrice}
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
                                                        <div className="table-actions-group">
                                                            <button
                                                                type="button"
                                                                className="action-restock-btn"
                                                                title="Restock / Add more units of this part"
                                                                onClick={() => handleOpenRestockModal(item)}
                                                            >
                                                                <span className="material-symbols-outlined">add_circle</span>
                                                                <span className="restock-btn-label">Restock</span>
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="action-edit-btn"
                                                                title="Edit Part Details & Selling Price"
                                                                onClick={() => handleOpenEditModal(item)}
                                                            >
                                                                <span className="material-symbols-outlined">edit</span>
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="action-delete-btn"
                                                                title="Delete part from inventory"
                                                                onClick={() => setDeleteTarget(item)}
                                                            >
                                                                <span className="material-symbols-outlined">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination */}
                            <div className="table-pagination">
                                <span className="pagination-info">
                                    Showing {filteredItems.length} of {items.length} parts
                                </span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal Overlay: Add New Part to inventory_data */}
            {isModalOpen && (
                <div className="inventory-modal-overlay">
                    <div className="inventory-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-header-icon">inventory_2</span>
                                <div>
                                    <h3 className="modal-title">Add Part to Inventory</h3>
                                    <p className="modal-subtitle">Insert record into PostgreSQL <code>inventory_data</code> table</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={handleCloseModal}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleAddPart} className="inventory-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="sku">SKU (Part Code) *</label>
                                    <input
                                        type="text"
                                        id="sku"
                                        name="sku"
                                        placeholder="e.g. BRK-PAD-001"
                                        value={formData.sku}
                                        onChange={handleFormChange}
                                        className="uppercase-input font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="category">Category *</label>
                                    <select
                                        id="category"
                                        name="category"
                                        value={formData.category}
                                        onChange={handleFormChange}
                                        required
                                    >
                                        {DEFAULT_CATEGORIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="part_name">Part Name / Description *</label>
                                    <input
                                        type="text"
                                        id="part_name"
                                        name="part_name"
                                        placeholder="e.g. Ceramic Brake Pads (Front Axle)"
                                        value={formData.part_name}
                                        onChange={handleFormChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="stock_quantity">Initial Stock Quantity *</label>
                                    <input
                                        type="number"
                                        id="stock_quantity"
                                        name="stock_quantity"
                                        min="0"
                                        placeholder="10"
                                        value={formData.stock_quantity}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="reorder_threshold">Reorder Threshold *</label>
                                    <input
                                        type="number"
                                        id="reorder_threshold"
                                        name="reorder_threshold"
                                        min="0"
                                        placeholder="5"
                                        value={formData.reorder_threshold}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="unit_cost">Unit Cost ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        id="unit_cost"
                                        name="unit_cost"
                                        placeholder="45.00"
                                        value={formData.unit_cost}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="selling_price">Selling Price ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        id="selling_price"
                                        name="selling_price"
                                        placeholder="65.00"
                                        value={formData.selling_price}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="button" className="btn-modal-cancel" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving to Database...' : 'Save Part to Inventory'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Overlay: Restock Existing Part */}
            {isRestockModalOpen && restockTarget && (
                <div className="inventory-modal-overlay">
                    <div className="inventory-modal-content restock-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-header-icon restock-icon">add_box</span>
                                <div>
                                    <h3 className="modal-title">Restock Inventory Part</h3>
                                    <p className="modal-subtitle">Add purchased units to existing inventory stock</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={handleCloseRestockModal}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Part Summary Card */}
                        <div className="restock-summary-box">
                            <div className="restock-part-info">
                                <span className="restock-sku font-mono">{restockTarget.sku}</span>
                                <span className="restock-name">{restockTarget.name}</span>
                                <span className="restock-category text-muted">Category: {restockTarget.category}</span>
                            </div>
                            <div className="restock-current-badge">
                                <span className="badge-label">CURRENT STOCK</span>
                                <span className="badge-val font-mono">{restockTarget.stock} units</span>
                            </div>
                        </div>

                        <form onSubmit={handleRestockSubmit} className="inventory-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="restock_qty">QUANTITY TO ADD *</label>
                                    <input
                                        type="number"
                                        id="restock_qty"
                                        min="1"
                                        step="1"
                                        placeholder="e.g. 10"
                                        value={restockQty}
                                        onChange={(e) => setRestockQty(e.target.value)}
                                        className="font-mono"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="restock_cost">NEW UNIT COST ($)</label>
                                    <input
                                        type="number"
                                        id="restock_cost"
                                        step="0.01"
                                        min="0"
                                        placeholder={restockTarget.unit_cost ? String(restockTarget.unit_cost) : '0.00'}
                                        value={restockUnitCost}
                                        onChange={(e) => setRestockUnitCost(e.target.value)}
                                        className="font-mono"
                                    />
                                </div>
                            </div>

                            {/* Calculation Preview */}
                            <div className="restock-calc-preview">
                                <span>NEW ESTIMATED STOCK:</span>
                                <strong className="font-mono text-yellow">
                                    {(parseInt(restockTarget.stock, 10) || 0) + (parseInt(restockQty, 10) || 0)} units
                                </strong>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="button" className="btn-modal-cancel" onClick={handleCloseRestockModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isRestocking}>
                                    {isRestocking ? 'Restocking...' : `+ Restock ${restockQty || 0} Units`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Overlay: Edit Existing Part */}
            {isEditModalOpen && editTarget && (
                <div className="inventory-modal-overlay" onClick={() => !isEditing && setIsEditModalOpen(false)}>
                    <div className="inventory-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-header-icon" style={{ color: '#38bdf8' }}>edit_note</span>
                                <div>
                                    <h3 className="modal-title">Edit Inventory Part</h3>
                                    <p className="modal-subtitle">Update pricing and catalog details for <code>{editTarget.sku}</code></p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setIsEditModalOpen(false)}
                                disabled={isEditing}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="inventory-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="edit_sku">SKU (Part Code) *</label>
                                    <input
                                        type="text"
                                        id="edit_sku"
                                        name="sku"
                                        value={editFormData.sku}
                                        onChange={(e) => setEditFormData({ ...editFormData, sku: e.target.value })}
                                        className="uppercase-input font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_category">Category *</label>
                                    <select
                                        id="edit_category"
                                        name="category"
                                        value={editFormData.category}
                                        onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                                        required
                                    >
                                        {DEFAULT_CATEGORIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="edit_part_name">Part Name / Description *</label>
                                    <input
                                        type="text"
                                        id="edit_part_name"
                                        name="part_name"
                                        value={editFormData.part_name}
                                        onChange={(e) => setEditFormData({ ...editFormData, part_name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_selling_price" style={{ color: 'var(--accent-yellow)', fontWeight: 800 }}>
                                        Selling Price ($) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        id="edit_selling_price"
                                        name="selling_price"
                                        value={editFormData.selling_price}
                                        onChange={(e) => setEditFormData({ ...editFormData, selling_price: e.target.value })}
                                        className="font-mono"
                                        style={{ borderColor: 'rgba(255, 216, 95, 0.5)', backgroundColor: 'rgba(255, 216, 95, 0.06)' }}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_unit_cost">Unit Cost ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        id="edit_unit_cost"
                                        name="unit_cost"
                                        value={editFormData.unit_cost}
                                        onChange={(e) => setEditFormData({ ...editFormData, unit_cost: e.target.value })}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_stock_quantity">Current Stock Quantity *</label>
                                    <input
                                        type="number"
                                        id="edit_stock_quantity"
                                        name="stock_quantity"
                                        min="0"
                                        value={editFormData.stock_quantity}
                                        onChange={(e) => setEditFormData({ ...editFormData, stock_quantity: e.target.value })}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_reorder_threshold">Reorder Threshold *</label>
                                    <input
                                        type="number"
                                        id="edit_reorder_threshold"
                                        name="reorder_threshold"
                                        min="0"
                                        value={editFormData.reorder_threshold}
                                        onChange={(e) => setEditFormData({ ...editFormData, reorder_threshold: e.target.value })}
                                        className="font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button
                                    type="button"
                                    className="btn-modal-cancel"
                                    onClick={() => setIsEditModalOpen(false)}
                                    disabled={isEditing}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-modal-submit"
                                    disabled={isEditing}
                                >
                                    {isEditing ? 'Updating...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Overlay: Delete Confirmation */}
            {deleteTarget && (
                <div className="inventory-modal-overlay" onClick={() => !isDeleting && setDeleteTarget(null)}>
                    <div className="inventory-modal-content delete-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-header-icon delete-icon">warning</span>
                                <div>
                                    <h3 className="modal-title">Delete Inventory Part</h3>
                                    <p className="modal-subtitle">Confirm removal of part catalog record</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Part Summary Card */}
                        <div className="delete-summary-box">
                            <div className="restock-part-info">
                                <span className="restock-sku font-mono">{deleteTarget.sku}</span>
                                <span className="restock-name">{deleteTarget.name}</span>
                                <span className="restock-category text-muted">Category: {deleteTarget.category}</span>
                            </div>
                            <div className="restock-current-badge">
                                <span className="badge-label">CURRENT STOCK</span>
                                <span className="badge-val font-mono">{deleteTarget.stock} units</span>
                            </div>
                        </div>

                        <div className="delete-warning-message">
                            <p>
                                Are you sure you want to delete <strong>{deleteTarget.name}</strong> (<code>{deleteTarget.sku}</code>) from the inventory database?
                            </p>
                            <p className="delete-note">
                                🛡️ <strong>Data Integrity Note:</strong> Any existing work orders or tax invoices that used this part will safely preserve their billed line items and repair history.
                            </p>
                        </div>

                        <div className="modal-footer-actions">
                            <button
                                type="button"
                                className="btn-modal-cancel"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-modal-delete"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Part'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}