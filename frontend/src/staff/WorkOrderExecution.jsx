import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
// import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HandymanIcon from '@mui/icons-material/Handyman';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import SaveIcon from '@mui/icons-material/Save';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StarIcon from '@mui/icons-material/Star';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventNoteIcon from '@mui/icons-material/EventNote';
import './WorkOrderExecution.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

const STATUS_STEPS = [
    { key: 'received', label: '1. RECEIVED', icon: 'pending_actions' },
    { key: 'diagnosed', label: '2. DIAGNOSED', icon: 'handyman' },
    { key: 'in_progress', label: '3. IN PROGRESS', icon: 'build' },
    { key: 'ready', label: '4. READY FOR PICKUP', icon: 'task_alt' },
    { key: 'completed', label: '5. COMPLETED (PICKED UP)', icon: 'check_circle' },
];

const BAY_OPTIONS = [
    'Bay 1 - Heavy Repair & Engine',
    'Bay 2 - Diagnostics & Electrical',
    'Lift 3 - Quick Lube & Inspection',
    'Lift 4 - Brakes & Suspension',
    'Bay 5 - Tires & Alignment',
    'Detail & Delivery Bay',
];

export default function WorkOrderExecution() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // Dropdown options
    const [staffList, setStaffList] = useState([]);
    const [inventoryItems, setInventoryItems] = useState([]);

    // Modals
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [itemType, setItemType] = useState('part'); // 'part' or 'labor'
    const [itemFormData, setItemFormData] = useState({
        part_id: '',
        description: '',
        quantity_or_hours: '1',
        unit_price: '',
    });

    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [mediaFormData, setMediaFormData] = useState({
        file_url: '',
        file_type: 'vehicle_condition',
    });

    // Editable Assignment state
    const [assignmentData, setAssignmentData] = useState({
        bay_assigned: '',
        assigned_staff_id: '',
        estimated_cost: '',
        initial_observations: '',
    });

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchOrderDetails = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}`);
            if (!res.ok) {
                showNotification('Work order not found', 'error');
                return;
            }
            const json = await res.json();
            if (json.success && json.data) {
                setOrder(json.data);
                setAssignmentData({
                    bay_assigned: json.data.bay_assigned || '',
                    assigned_staff_id: json.data.assigned_staff_id || '',
                    estimated_cost: json.data.estimated_cost || '0.00',
                    initial_observations: json.data.initial_observations || '',
                });
            }
        } catch (err) {
            console.error('Error fetching order details:', err);
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSelectors = async () => {
        try {
            const [staffRes, invRes] = await Promise.all([
                fetch(`${API_BASE_URL}/staff/list`),
                fetch(`${API_BASE_URL}/inventory/items`),
            ]);
            if (staffRes.ok) {
                const sJson = await staffRes.json();
                if (sJson.success) setStaffList(sJson.data);
            }
            if (invRes.ok) {
                const iJson = await invRes.json();
                if (iJson.success) setInventoryItems(iJson.data);
            }
        } catch (err) {
            console.warn('Selector lookup notice:', err.message);
        }
    };

    useEffect(() => {
        if (id) {
            fetchOrderDetails();
            fetchSelectors();
        }
    }, [id]);

    // Advance or change status
    const handleStatusChange = async (newStatus) => {
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                showNotification(`Status advanced to ${newStatus.toUpperCase()}!`, 'success');
                fetchOrderDetails();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to update status', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Save assignments (Bay, Staff, Observations)
    const handleSaveAssignments = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/details`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(assignmentData),
            });
            if (res.ok) {
                showNotification('Workshop assignments & parameters saved!', 'success');
                fetchOrderDetails();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to save', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Part selection handler
    const handlePartSelect = (e) => {
        const partId = e.target.value;
        if (!partId) {
            setItemFormData((prev) => ({ ...prev, part_id: '', unit_price: '', description: '' }));
            return;
        }
        const selected = inventoryItems.find((i) => i.part_id === parseInt(partId, 10));
        if (selected) {
            setItemFormData((prev) => ({
                ...prev,
                part_id: String(selected.part_id),
                description: `${selected.part_name} (${selected.sku})`,
                unit_price: String(selected.selling_price || '0.00'),
            }));
        }
    };

    // Add Line Item (Part or Labor)
    const handleAddLineItem = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/items`, {
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
                fetchSelectors();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to add item', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Delete Line Item
    const handleDeleteLineItem = async (itemId) => {
        if (!window.confirm('Are you sure you want to remove this line item? (Inventory parts will be restocked)')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/items/${itemId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                showNotification('Line item removed and inventory restocked', 'info');
                fetchOrderDetails();
                fetchSelectors();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Add Media Photo
    const handleAddMedia = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mediaFormData),
            });
            if (res.ok) {
                showNotification('Media attached successfully!', 'success');
                setIsMediaModalOpen(false);
                setMediaFormData({ file_url: '', file_type: 'vehicle_condition' });
                fetchOrderDetails();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    if (isLoading) {
        return (
            <div className="exec-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="exec-wrapper loading-center">
                    <BuildIcon className="spinning-icon" />
                    <p>Loading Work Order Execution Workspace...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="exec-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="exec-wrapper loading-center">
                    <p>Work Order Not Found</p>
                    <button className="primary-btn" onClick={() => navigate('/staff/dashboard')}>
                        Back to Staff Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="exec-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="exec-wrapper">
                {/* Header */}
                <header className="exec-header">
                    <div className="header-left">
                        <button className="back-btn" onClick={() => navigate('/staff/dashboard')}>
                            <ArrowBackIcon fontSize="small" />
                            <span>Staff Dashboard</span>
                        </button>
                        <div className="header-divider"></div>
                        <h2 className="header-wo-title">
                            {order.work_order_id} <span>• {order.year} {order.make} {order.model}</span>
                        </h2>
                    </div>

                    <div className="header-right">
                        <span className={`status-pill pill-${order.status}`}>
                            {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                    </div>
                </header>

                {/* Main Content */}
                <main className="exec-main">
                    <div className="exec-container">
                        {/* Toast */}
                        {notification && (
                            <div className={`exec-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Interactive Status Pipeline Stepper */}
                        <div className="pipeline-stepper-card">
                            <div className="stepper-title-row">
                                <span className="stepper-tag">WORK ORDER REPAIR LIFECYCLE</span>
                                <span className="current-status-text">CURRENT STAGE: <strong>{order.status.toUpperCase()}</strong></span>
                            </div>

                            <div className="pipeline-steps">
                                {STATUS_STEPS.map((step, idx) => {
                                    const stepOrder = ['received', 'diagnosed', 'in_progress', 'ready', 'completed'];
                                    const currentIdx = stepOrder.indexOf(order.status);
                                    const stepIdx = stepOrder.indexOf(step.key);
                                    const isCurrent = order.status === step.key;
                                    const isPast = currentIdx !== -1 && stepIdx < currentIdx;

                                    return (
                                        <button
                                            key={step.key}
                                            type="button"
                                            className={`step-node ${isCurrent ? 'node-active' : ''} ${isPast ? 'node-past' : ''}`}
                                            onClick={() => handleStatusChange(step.key)}
                                        >
                                            <span className="step-circle">{idx + 1}</span>
                                            <span className="step-label">{step.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Two Column Grid */}
                        <div className="exec-grid">
                            {/* Left Column: Vehicle, Owner, and Workshop Assignment */}
                            <div className="exec-col-left">
                                {/* Vehicle Card */}
                                <div className="exec-card">
                                    <div className="card-header">
                                        <DirectionsCarIcon className="card-icon" />
                                        <h3>Vehicle Identification</h3>
                                    </div>
                                    <div className="info-pairs-grid">
                                        <div>
                                            <span className="info-label">VEHICLE</span>
                                            <span className="info-val">{order.year} {order.make} {order.model}</span>
                                        </div>
                                        <div>
                                            <span className="info-label">LICENSE PLATE</span>
                                            <span className="info-val font-mono">{order.license_plate}</span>
                                        </div>
                                        <div>
                                            <span className="info-label">VIN</span>
                                            <span className="info-val font-mono" style={{ fontSize: '11px' }}>{order.vin}</span>
                                        </div>
                                        <div>
                                            <span className="info-label">VEHICLE ID</span>
                                            <span className="info-val font-mono">{order.vehicle_id}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Owner Card */}
                                <div className="exec-card">
                                    <div className="card-header">
                                        <PersonIcon className="card-icon" />
                                        <h3>Customer & Vehicle Owner</h3>
                                    </div>
                                    <div className="info-pairs-grid">
                                        <div>
                                            <span className="info-label">OWNER NAME</span>
                                            <span className="info-val">
                                                {order.owner_name} {order.owner_is_vip && <StarIcon className="vip-icon" fontSize="inherit" />}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="info-label">PHONE NUMBER</span>
                                            <span className="info-val font-mono">{order.owner_phone}</span>
                                        </div>
                                        <div className="grid-full">
                                            <span className="info-label">EMAIL ADDRESS</span>
                                            <span className="info-val font-mono">{order.owner_email || 'None on file'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Workshop Assignments Form */}
                                <form onSubmit={handleSaveAssignments} className="exec-card">
                                    <div className="card-header">
                                        <BuildIcon className="card-icon" />
                                        <h3>Workshop Assignment & Notes</h3>
                                    </div>

                                    <div className="form-stack">
                                        <div className="form-group">
                                            <label>ASSIGNED REPAIR BAY</label>
                                            <select
                                                value={assignmentData.bay_assigned}
                                                onChange={(e) => setAssignmentData({ ...assignmentData, bay_assigned: e.target.value })}
                                                className="exec-input"
                                            >
                                                <option value="">-- Unassigned Bay --</option>
                                                {BAY_OPTIONS.map((b) => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label>LEAD TECHNICIAN</label>
                                            <select
                                                value={assignmentData.assigned_staff_id}
                                                onChange={(e) => setAssignmentData({ ...assignmentData, assigned_staff_id: e.target.value })}
                                                className="exec-input"
                                            >
                                                <option value="">-- Unassigned Staff --</option>
                                                {staffList.map((s) => (
                                                    <option key={s.staff_id} value={s.staff_id}>
                                                        {s.full_name} ({s.role} - ${parseFloat(s.hourly_rate).toFixed(2)}/hr)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label>INITIAL OBSERVATIONS / CONCERNS</label>
                                            <textarea
                                                rows={3}
                                                value={assignmentData.initial_observations}
                                                onChange={(e) => setAssignmentData({ ...assignmentData, initial_observations: e.target.value })}
                                                className="exec-input exec-textarea"
                                            />
                                        </div>

                                        <button type="submit" className="primary-btn save-details-btn">
                                            <SaveIcon fontSize="small" />
                                            <span>Save Workshop Details</span>
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Right Column: Line Items (Parts & Labor) and Media */}
                            <div className="exec-col-right">
                                {/* Line Items Card */}
                                <div className="exec-card">
                                    <div className="card-header-with-actions">
                                        <div className="card-header-title">
                                            <HandymanIcon className="card-icon" />
                                            <h3>Parts & Labor Bill of Materials</h3>
                                        </div>
                                        <div className="header-btn-row">
                                            <button
                                                type="button"
                                                className="secondary-btn-small"
                                                onClick={() => {
                                                    setItemType('part');
                                                    setIsAddItemModalOpen(true);
                                                }}
                                            >
                                                {/* <AddCircleOutlineIcon fontSize="small" /> */}
                                                <span>+ Add Part</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="secondary-btn-small"
                                                onClick={() => {
                                                    setItemType('labor');
                                                    setIsAddItemModalOpen(true);
                                                }}
                                            >
                                                <BuildIcon fontSize="small" />
                                                <span>+ Add Labor</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Items Table */}
                                    <div className="items-table-wrap">
                                        <table className="exec-table">
                                            <thead>
                                                <tr>
                                                    <th>TYPE</th>
                                                    <th>DESCRIPTION / SKU</th>
                                                    <th>QTY / HRS</th>
                                                    <th>RATE</th>
                                                    <th>TOTAL</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.items && order.items.length > 0 ? (
                                                    order.items.map((item) => (
                                                        <tr key={item.item_id}>
                                                            <td>
                                                                <span className={`item-type-badge type-${item.item_type}`}>
                                                                    {item.item_type.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <strong>{item.description}</strong>
                                                                {item.sku && <div className="item-sku-sub font-mono">SKU: {item.sku}</div>}
                                                            </td>
                                                            <td className="font-mono">{parseFloat(item.quantity_or_hours).toFixed(2)}</td>
                                                            <td className="font-mono">${parseFloat(item.unit_price).toFixed(2)}</td>
                                                            <td className="font-mono text-yellow font-bold">
                                                                ${parseFloat(item.total_price || 0).toFixed(2)}
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <button
                                                                    type="button"
                                                                    className="delete-item-btn"
                                                                    onClick={() => handleDeleteLineItem(item.item_id)}
                                                                    title="Delete Line Item"
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="6" className="empty-table-cell">
                                                            No parts or labor items recorded yet. Click "+ Add Part" or "+ Add Labor" above.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Grand Total Bar */}
                                    <div className="cost-summary-bar">
                                        <div className="cost-summary-item">
                                            <span className="summary-label">TOTAL PARTS & LABOR:</span>
                                            <span className="summary-val font-mono text-yellow">
                                                ${parseFloat(order.total_cost || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Vehicle Condition Media Card */}
                                <div className="exec-card">
                                    <div className="card-header-with-actions">
                                        <div className="card-header-title">
                                            <AddPhotoAlternateIcon className="card-icon" />
                                            <h3>Inspection Media & Photos</h3>
                                        </div>
                                        <button
                                            type="button"
                                            className="secondary-btn-small"
                                            onClick={() => setIsMediaModalOpen(true)}
                                        >
                                            <AddPhotoAlternateIcon fontSize="small" />
                                            <span>+ Attach Photo</span>
                                        </button>
                                    </div>

                                    <div className="media-grid-wrap">
                                        {order.media && order.media.length > 0 ? (
                                            order.media.map((m) => (
                                                <div key={m.media_id} className="media-thumb-card">
                                                    <img src={m.file_url} alt="Work Order media" className="media-img" />
                                                    <div className="media-caption">
                                                        <span className="media-type-tag">{m.file_type}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="empty-media-box">
                                                <AddPhotoAlternateIcon style={{ fontSize: '36px', color: 'var(--text-muted)' }} />
                                                <p>No photos attached for this work order.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Scheduled Tasks for this Vehicle Card */}
                                <div className="exec-card">
                                    <div className="card-header-with-actions">
                                        <div className="card-header-title">
                                            <CalendarMonthIcon className="card-icon" />
                                            <h3>Scheduled Tasks & Bay Appointments</h3>
                                        </div>
                                        <button
                                            type="button"
                                            className="secondary-btn-small"
                                            onClick={() => navigate('/staff/schedules')}
                                            title="Open Workshop Schedule"
                                        >
                                            <CalendarMonthIcon fontSize="small" />
                                            <span>All Schedules</span>
                                        </button>
                                    </div>

                                    <div className="scheduled-tasks-wrap">
                                        {order.scheduled_tasks && order.scheduled_tasks.length > 0 ? (
                                            <div className="tasks-cards-list">
                                                {order.scheduled_tasks.map((task) => (
                                                    <div key={task.task_id} className={`task-schedule-item priority-${task.priority || 'standard'}`}>
                                                        <div className="task-top-row">
                                                            <div className="task-title-group">
                                                                <span className={`task-priority-pill priority-${task.priority || 'standard'}`}>
                                                                    {(task.priority || 'STANDARD').toUpperCase()}
                                                                </span>
                                                                <h4 className="task-heading">{task.task_title}</h4>
                                                            </div>
                                                            {task.bay_assigned && (
                                                                <span className="bay-badge font-mono">📍 {task.bay_assigned}</span>
                                                            )}
                                                        </div>

                                                        {task.task_description && (
                                                            <p className="task-desc">{task.task_description}</p>
                                                        )}

                                                        <div className="task-meta-footer font-mono">
                                                            <div className="meta-pair">
                                                                <CalendarMonthIcon fontSize="inherit" />
                                                                <span>{task.scheduled_date || 'Today'}</span>
                                                            </div>
                                                            <div className="meta-pair">
                                                                <AccessTimeIcon fontSize="inherit" />
                                                                <span>{task.start_time} - {task.end_time} ({task.duration_hours || '1.0'}h)</span>
                                                            </div>
                                                            {task.assigned_staff_name && (
                                                                <div className="meta-pair tech-pair">
                                                                    <PersonIcon fontSize="inherit" />
                                                                    <span>Tech: {task.assigned_staff_name}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="empty-tasks-box">
                                                <CalendarMonthIcon style={{ fontSize: '36px', color: 'var(--text-muted)' }} />
                                                <p>No scheduled tasks or bay appointments booked for this vehicle yet.</p>
                                                <button
                                                    type="button"
                                                    className="view-schedule-link-btn font-mono"
                                                    onClick={() => navigate('/staff/schedules')}
                                                >
                                                    Open Workshop Schedule →
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal: Add Line Item */}
            {isAddItemModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{itemType === 'part' ? 'Add Inventory Part to Work Order' : 'Add Labor Hours to Work Order'}</h3>
                            <button className="modal-close" onClick={() => setIsAddItemModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleAddLineItem} className="modal-form">
                            {itemType === 'part' && (
                                <div className="form-group">
                                    <label>SELECT FROM INVENTORY</label>
                                    <select value={itemFormData.part_id} onChange={handlePartSelect} className="exec-input">
                                        <option value="">-- Choose Spare Part --</option>
                                        {inventoryItems.map((inv) => (
                                            <option key={inv.part_id} value={inv.part_id}>
                                                {inv.part_name} ({inv.sku}) - Stock: {inv.stock_quantity} - ${parseFloat(inv.selling_price).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>DESCRIPTION *</label>
                                <input
                                    type="text"
                                    placeholder={itemType === 'part' ? 'Part description' : 'e.g. Brake Caliper Replacement & Bleeding'}
                                    value={itemFormData.description}
                                    onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                                    required
                                    className="exec-input"
                                />
                            </div>

                            <div className="subform-2col">
                                <div className="form-group">
                                    <label>{itemType === 'part' ? 'QUANTITY' : 'HOURS'} *</label>
                                    <input
                                        type="number"
                                        step={itemType === 'part' ? '1' : 'any'}
                                        min={itemType === 'part' ? '1' : '0.1'}
                                        value={itemFormData.quantity_or_hours}
                                        onChange={(e) => setItemFormData({ ...itemFormData, quantity_or_hours: e.target.value })}
                                        required
                                        className="exec-input font-mono"
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
                                        required
                                        className="exec-input font-mono"
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddItemModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="primary-btn">
                                    Add to Work Order
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add Media Photo */}
            {isMediaModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Attach Vehicle Inspection Photo</h3>
                            <button className="modal-close" onClick={() => setIsMediaModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleAddMedia} className="modal-form">
                            <div className="form-group">
                                <label>PHOTO / IMAGE URL *</label>
                                <input
                                    type="url"
                                    placeholder="https://images.unsplash.com/... or media path"
                                    value={mediaFormData.file_url}
                                    onChange={(e) => setMediaFormData({ ...mediaFormData, file_url: e.target.value })}
                                    required
                                    className="exec-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>MEDIA CATEGORY TAG</label>
                                <select
                                    value={mediaFormData.file_type}
                                    onChange={(e) => setMediaFormData({ ...mediaFormData, file_type: e.target.value })}
                                    className="exec-input"
                                >
                                    <option value="vehicle_condition">Vehicle Intake Condition</option>
                                    <option value="part_damage">Part Damage Diagnosis</option>
                                    <option value="repair_progress">Repair In Progress</option>
                                    <option value="completed_job">Completed Quality Check</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsMediaModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="primary-btn">
                                    Attach Media
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
