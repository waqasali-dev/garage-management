import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import DeleteIcon from '@mui/icons-material/Delete';
import HandymanIcon from '@mui/icons-material/Handyman';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LinkIcon from '@mui/icons-material/Link';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import './WorkOrderExecution.css';
import { API_BASE_URL } from '../config/api';

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

// Media Categories conforming to PostgreSQL & SQLite schema media_type_enum
const MEDIA_TYPE_META = {
    vehicle_condition: {
        label: 'Vehicle Condition',
        icon: 'directions_car',
        desc: 'Intake inspection, bodywork, exterior / interior condition',
        tagClass: 'media-tag-condition',
    },
    part_damage: {
        label: 'Part Damage',
        icon: 'warning',
        desc: 'Defective parts, leaks, wear & tear, diagnostic evidence',
        tagClass: 'media-tag-damage',
    },
    receipt: {
        label: 'Receipt / Parts Slip',
        icon: 'receipt_long',
        desc: 'Supplier invoices, part purchase slips, warranty notes',
        tagClass: 'media-tag-receipt',
    },
    other: {
        label: 'Repair Progress & QC',
        icon: 'build_circle',
        desc: 'In-progress installation, final quality check, completed repair',
        tagClass: 'media-tag-progress',
    },
};

export default function WorkOrderExecution() {
    const { id } = useParams();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // Dropdown options
    const [staffList, setStaffList] = useState([]);
    const [inventoryItems, setInventoryItems] = useState([]);

    // Modals
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [isSubmittingItem, setIsSubmittingItem] = useState(false);
    const [itemType, setItemType] = useState('part'); // 'part' or 'labor'
    const [partSearchQuery, setPartSearchQuery] = useState('');
    const [itemFormData, setItemFormData] = useState({
        part_id: '',
        description: '',
        quantity_or_hours: '1',
        unit_price: '',
    });

    // Media Upload & Gallery States
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [mediaUploadMode, setMediaUploadMode] = useState('file'); // 'file' or 'url'
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaFilePreview, setMediaFilePreview] = useState('');
    const [mediaFileSize, setMediaFileSize] = useState('');
    const [mediaFileError, setMediaFileError] = useState('');
    const [isCompressingImage, setIsCompressingImage] = useState(false);
    const [isSubmittingMedia, setIsSubmittingMedia] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [mediaFormData, setMediaFormData] = useState({
        file_url: '',
        file_type: 'vehicle_condition',
    });

    // Lightbox & Delete Media States
    const [activeLightboxMedia, setActiveLightboxMedia] = useState(null);
    const [deleteMediaTarget, setDeleteMediaTarget] = useState(null);
    const [isDeletingMedia, setIsDeletingMedia] = useState(false);

    // Delete Line Item Modal State
    const [deleteItemTarget, setDeleteItemTarget] = useState(null);
    const [isDeletingItem, setIsDeletingItem] = useState(false);

    // Editable Assignment state
    const [isSavingAssignments, setIsSavingAssignments] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
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
                if (sJson.success && Array.isArray(sJson.data)) setStaffList(sJson.data);
            }
            if (invRes.ok) {
                const iJson = await invRes.json();
                if (iJson.success && Array.isArray(iJson.data)) setInventoryItems(iJson.data);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Advance or change status
    const handleStatusChange = async (newStatus) => {
        if (isUpdatingStatus) return;
        setIsUpdatingStatus(true);
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
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    // Save assignments (Bay, Staff, Observations)
    const handleSaveAssignments = async (e) => {
        e.preventDefault();
        if (isSavingAssignments) return;
        setIsSavingAssignments(true);
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
        } finally {
            setIsSavingAssignments(false);
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
                quantity_or_hours: prev.quantity_or_hours || '1',
            }));
        }
    };

    // Add Line Item (Part or Labor)
    const handleAddLineItem = async (e) => {
        e.preventDefault();
        if (isSubmittingItem) return;
        setIsSubmittingItem(true);
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
        } finally {
            setIsSubmittingItem(false);
        }
    };

    // Delete Line Item (Triggered from Modal Confirmation)
    const handleConfirmDeleteLineItem = async () => {
        if (!deleteItemTarget || isDeletingItem) return;
        setIsDeletingItem(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/items/${deleteItemTarget.item_id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                showNotification(`Line item removed and inventory stock restored!`, 'info');
                setDeleteItemTarget(null);
                fetchOrderDetails();
                fetchSelectors();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to remove line item', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsDeletingItem(false);
        }
    };

    // Process & Optimize Image File with HTML5 Canvas (Max 1600px, 0.85 quality)
    const processImageFile = (file) => {
        return new Promise((resolve, reject) => {
            if (!file || !file.type.startsWith('image/')) {
                reject(new Error('Please select a valid image file (JPG, PNG, WEBP, HEIC, etc.)'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1600;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                };
                img.onerror = () => reject(new Error('Unable to process the selected image.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file from storage.'));
            reader.readAsDataURL(file);
        });
    };

    const handleSelectMediaFile = async (file) => {
        if (!file) return;
        setMediaFileError('');
        setIsCompressingImage(true);
        try {
            const previewUrl = await processImageFile(file);
            setMediaFile(file);
            setMediaFilePreview(previewUrl);
            const formattedSize =
                file.size > 1024 * 1024
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${Math.round(file.size / 1024)} KB`;
            setMediaFileSize(formattedSize);
        } catch (err) {
            setMediaFileError(err.message);
            setMediaFile(null);
            setMediaFilePreview('');
        } finally {
            setIsCompressingImage(false);
        }
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleSelectMediaFile(e.dataTransfer.files[0]);
        }
    };

    const handleCloseMediaModal = () => {
        setIsMediaModalOpen(false);
        setMediaUploadMode('file');
        setMediaFile(null);
        setMediaFilePreview('');
        setMediaFileSize('');
        setMediaFileError('');
        setMediaFormData({ file_url: '', file_type: 'vehicle_condition' });
    };

    // Add Media Photo (Base64 file or image URL)
    const handleAddMedia = async (e) => {
        e.preventDefault();
        if (isSubmittingMedia) return;

        let targetUrl = '';
        if (mediaUploadMode === 'file') {
            if (!mediaFilePreview) {
                setMediaFileError('Please select or drag an image to upload.');
                return;
            }
            targetUrl = mediaFilePreview;
        } else {
            if (!mediaFormData.file_url.trim()) {
                setMediaFileError('Please enter a valid image URL.');
                return;
            }
            targetUrl = mediaFormData.file_url.trim();
        }

        setIsSubmittingMedia(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_url: targetUrl,
                    file_type: mediaFormData.file_type,
                }),
            });
            if (res.ok) {
                showNotification('📸 Inspection photo attached successfully!', 'success');
                handleCloseMediaModal();
                fetchOrderDetails();
            } else {
                const errData = await res.json();
                showNotification(errData.error || 'Failed to attach image', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsSubmittingMedia(false);
        }
    };

    // Delete Media Photo (Triggered from Modal Confirmation)
    const handleConfirmDeleteMedia = async () => {
        if (!deleteMediaTarget || isDeletingMedia) return;
        setIsDeletingMedia(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${id}/media/${deleteMediaTarget.media_id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                showNotification('🗑️ Inspection photo removed successfully', 'info');
                setDeleteMediaTarget(null);
                if (activeLightboxMedia?.media_id === deleteMediaTarget.media_id) {
                    setActiveLightboxMedia(null);
                }
                fetchOrderDetails();
            } else {
                const errJson = await res.json();
                showNotification(errJson.error || 'Failed to remove photo', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsDeletingMedia(false);
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

                                        <button
                                            type="submit"
                                            className="primary-btn save-details-btn"
                                            disabled={isSavingAssignments}
                                        >
                                            <SaveIcon fontSize="small" />
                                            <span>{isSavingAssignments ? 'Saving...' : 'Save Workshop Details'}</span>
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
                                                    fetchSelectors();
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
                                                    fetchSelectors();
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
                                                                    onClick={() => setDeleteItemTarget(item)}
                                                                    title="Remove Line Item from Work Order"
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

                                {/* Vehicle Condition & Inspection Media Card */}
                                <div className="exec-card">
                                    <div className="card-header-with-actions">
                                        <div className="card-header-title">
                                            <AddPhotoAlternateIcon className="card-icon" />
                                            <h3>Inspection Media & Vehicle Photos</h3>
                                            {order.media && order.media.length > 0 && (
                                                <span className="count-pill font-mono" style={{ backgroundColor: 'rgba(255, 216, 95, 0.15)', color: 'var(--accent-yellow)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                                    {order.media.length}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="secondary-btn-small"
                                            onClick={() => setIsMediaModalOpen(true)}
                                            title="Upload car photo or attach URL"
                                        >
                                            <CloudUploadIcon fontSize="small" />
                                            <span>+ Upload Photo</span>
                                        </button>
                                    </div>

                                    <div className="media-grid-wrap">
                                        {order.media && order.media.length > 0 ? (
                                            order.media.map((m) => {
                                                const meta = MEDIA_TYPE_META[m.file_type] || MEDIA_TYPE_META.vehicle_condition;
                                                const formattedDate = m.uploaded_at
                                                    ? new Date(m.uploaded_at).toLocaleDateString('en-US', {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })
                                                    : 'Recently attached';

                                                return (
                                                    <div key={m.media_id} className="media-thumb-card">
                                                        <div
                                                            className="media-img-container"
                                                            onClick={() => setActiveLightboxMedia(m)}
                                                            title="Click to enlarge / inspect photo"
                                                        >
                                                            <img
                                                                src={m.file_url}
                                                                alt={`Vehicle ${meta.label}`}
                                                                className="media-img"
                                                                loading="lazy"
                                                            />
                                                            <div className="media-overlay-actions">
                                                                <button
                                                                    type="button"
                                                                    className="media-action-icon-btn zoom-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveLightboxMedia(m);
                                                                    }}
                                                                    title="Inspect / Enlarge Photo"
                                                                >
                                                                    <ZoomInIcon fontSize="small" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="media-action-icon-btn delete-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setDeleteMediaTarget(m);
                                                                    }}
                                                                    title="Delete Photo"
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="media-caption">
                                                            <span className={`media-tag-pill ${meta.tagClass}`}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                                                    {meta.icon}
                                                                </span>
                                                                <span>{meta.label}</span>
                                                            </span>
                                                            <span className="media-date-text">{formattedDate}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="empty-media-box">
                                                <AddPhotoAlternateIcon style={{ fontSize: '40px', color: 'var(--text-muted)' }} />
                                                <p>No photos attached for this work order yet.</p>
                                                <button
                                                    type="button"
                                                    className="secondary-btn-small"
                                                    style={{ marginTop: '6px' }}
                                                    onClick={() => setIsMediaModalOpen(true)}
                                                >
                                                    <CloudUploadIcon fontSize="small" />
                                                    <span>Upload First Inspection Photo</span>
                                                </button>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label style={{ margin: 0 }}>SELECT FROM INVENTORY</label>
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            {inventoryItems.length} items available
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="🔍 Filter parts by name or SKU..."
                                        value={partSearchQuery}
                                        onChange={(e) => setPartSearchQuery(e.target.value)}
                                        className="exec-input"
                                        style={{ marginBottom: '8px', padding: '7px 10px', fontSize: '13px' }}
                                    />
                                    <select value={itemFormData.part_id} onChange={handlePartSelect} className="exec-input">
                                        <option value="">-- Choose Spare Part --</option>
                                        {inventoryItems
                                            .filter((inv) => {
                                                if (!partSearchQuery.trim()) return true;
                                                const q = partSearchQuery.toLowerCase();
                                                return (
                                                    (inv.part_name && inv.part_name.toLowerCase().includes(q)) ||
                                                    (inv.sku && inv.sku.toLowerCase().includes(q)) ||
                                                    (inv.category && inv.category.toLowerCase().includes(q))
                                                );
                                            })
                                            .map((inv) => {
                                                const stock = parseInt(inv.stock_quantity ?? inv.stock, 10) || 0;
                                                const stockBadge = stock <= 0 ? '🔴 Out of Stock' : stock <= 5 ? `⚠️ Low (${stock})` : `🟢 Stock: ${stock}`;
                                                return (
                                                    <option key={inv.part_id} value={inv.part_id}>
                                                        {inv.part_name} ({inv.sku}) • {stockBadge} • ${parseFloat(inv.selling_price).toFixed(2)}
                                                    </option>
                                                );
                                            })}
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
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => setIsAddItemModalOpen(false)}
                                    disabled={isSubmittingItem}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={isSubmittingItem}
                                >
                                    {isSubmittingItem ? 'Adding to Order...' : 'Add to Work Order'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Upload / Attach Inspection Photo */}
            {isMediaModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={() => !isSubmittingMedia && handleCloseMediaModal()}
                    style={{ zIndex: 9990 }}
                >
                    <div
                        className="modal-content"
                        style={{ maxWidth: '540px' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <div className="modal-title-wrap">
                                <h3>Upload Inspection & Car Photo</h3>
                                <p className="modal-subtitle">
                                    Capture or attach visual evidence of vehicle condition, damage diagnosis, or repair progress.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={handleCloseMediaModal}
                                disabled={isSubmittingMedia}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        {/* Upload Mode Selector (File Upload vs URL) */}
                        <div className="upload-tabs-wrap">
                            <button
                                type="button"
                                className={`upload-tab-btn ${mediaUploadMode === 'file' ? 'active' : ''}`}
                                onClick={() => {
                                    setMediaUploadMode('file');
                                    setMediaFileError('');
                                }}
                            >
                                <CloudUploadIcon fontSize="small" />
                                <span>Device / Camera File</span>
                            </button>
                            <button
                                type="button"
                                className={`upload-tab-btn ${mediaUploadMode === 'url' ? 'active' : ''}`}
                                onClick={() => {
                                    setMediaUploadMode('url');
                                    setMediaFileError('');
                                }}
                            >
                                <LinkIcon fontSize="small" />
                                <span>Image URL Link</span>
                            </button>
                        </div>

                        <form onSubmit={handleAddMedia} className="modal-form">
                            {/* File Upload Mode (Dropzone) */}
                            {mediaUploadMode === 'file' ? (
                                <div className="form-group">
                                    <label>PHOTO FILE (CAMERA / LOCAL STORAGE) *</label>

                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                handleSelectMediaFile(e.target.files[0]);
                                            }
                                        }}
                                    />

                                    {!mediaFilePreview ? (
                                        <div
                                            className={`media-dropzone ${isDragOver ? 'drag-active' : ''}`}
                                            onClick={() => fileInputRef.current?.click()}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setIsDragOver(true);
                                            }}
                                            onDragLeave={() => setIsDragOver(false)}
                                            onDrop={handleFileDrop}
                                        >
                                            <CloudUploadIcon className="dropzone-icon" />
                                            <p className="dropzone-title">
                                                {isCompressingImage
                                                    ? 'Optimizing Image...'
                                                    : 'Click to select photo or drag & drop here'}
                                            </p>
                                            <p className="dropzone-hint">
                                                Supports JPG, PNG, WEBP, HEIC (Auto-optimized for rapid sync)
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="dropzone-preview-wrap">
                                            <img
                                                src={mediaFilePreview}
                                                alt="Upload thumbnail"
                                                className="dropzone-preview-img"
                                            />
                                            <div className="preview-badge-overlay">
                                                <span>
                                                    📸 {mediaFile?.name || 'Selected Image'} ({mediaFileSize})
                                                </span>
                                                <button
                                                    type="button"
                                                    className="preview-clear-btn"
                                                    onClick={() => {
                                                        setMediaFile(null);
                                                        setMediaFilePreview('');
                                                        setMediaFileSize('');
                                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                                    }}
                                                >
                                                    <CloseIcon style={{ fontSize: '14px' }} />
                                                    <span>Change</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {mediaFileError && (
                                        <div style={{ color: '#f87171', fontSize: '11.5px', marginTop: '6px', fontFamily: 'monospace' }}>
                                            ⚠️ {mediaFileError}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* URL Mode */
                                <div className="form-group">
                                    <label>DIRECT PHOTO / IMAGE URL *</label>
                                    <input
                                        type="url"
                                        placeholder="https://images.unsplash.com/... or hosted image URL"
                                        value={mediaFormData.file_url}
                                        onChange={(e) => {
                                            setMediaFormData({ ...mediaFormData, file_url: e.target.value });
                                            setMediaFileError('');
                                        }}
                                        required={mediaUploadMode === 'url'}
                                        className="exec-input"
                                    />
                                    {mediaFormData.file_url.trim() && (
                                        <div className="dropzone-preview-wrap" style={{ marginTop: '10px' }}>
                                            <img
                                                src={mediaFormData.file_url.trim()}
                                                alt="Web source thumbnail"
                                                className="dropzone-preview-img"
                                                onError={() => setMediaFileError('Failed to load image from this URL. Please verify.')}
                                            />
                                        </div>
                                    )}
                                    {mediaFileError && (
                                        <div style={{ color: '#f87171', fontSize: '11.5px', marginTop: '6px', fontFamily: 'monospace' }}>
                                            ⚠️ {mediaFileError}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Media Category Selection */}
                            <div className="form-group">
                                <label>MEDIA CATEGORY (SELECT ONE)</label>
                                <div className="category-picker-grid">
                                    {Object.entries(MEDIA_TYPE_META).map(([typeKey, meta]) => {
                                        const isSelected = mediaFormData.file_type === typeKey;
                                        return (
                                            <div
                                                key={typeKey}
                                                className={`category-radio-card ${isSelected ? 'selected' : ''}`}
                                                onClick={() => setMediaFormData({ ...mediaFormData, file_type: typeKey })}
                                            >
                                                <div className="category-card-header">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isSelected ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                                                        {meta.icon}
                                                    </span>
                                                    <span>{meta.label}</span>
                                                    {isSelected && (
                                                        <CheckCircleIcon style={{ fontSize: '14px', marginLeft: 'auto', color: 'var(--accent-yellow)' }} />
                                                    )}
                                                </div>
                                                <span className="category-card-desc">{meta.desc}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={handleCloseMediaModal}
                                    disabled={isSubmittingMedia}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={isSubmittingMedia || isCompressingImage || (mediaUploadMode === 'file' && !mediaFilePreview)}
                                >
                                    <CloudUploadIcon fontSize="small" />
                                    <span>{isSubmittingMedia ? 'Attaching Photo...' : 'Upload & Attach Photo'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Fullscreen Image Lightbox */}
            {activeLightboxMedia && (
                <div
                    className="lightbox-overlay"
                    onClick={() => setActiveLightboxMedia(null)}
                >
                    <div
                        className="lightbox-content-box"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="lightbox-header-bar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {(() => {
                                    const meta = MEDIA_TYPE_META[activeLightboxMedia.file_type] || MEDIA_TYPE_META.vehicle_condition;
                                    return (
                                        <span className={`media-tag-pill ${meta.tagClass}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{meta.icon}</span>
                                            <span>{meta.label}</span>
                                        </span>
                                    );
                                })()}
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {activeLightboxMedia.uploaded_at
                                        ? new Date(activeLightboxMedia.uploaded_at).toLocaleString('en-US')
                                        : 'Inspection Photo'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    className="media-action-icon-btn delete-btn"
                                    onClick={() => setDeleteMediaTarget(activeLightboxMedia)}
                                    title="Delete this photo"
                                >
                                    <DeleteIcon fontSize="small" />
                                </button>
                                <button
                                    type="button"
                                    className="modal-close"
                                    onClick={() => setActiveLightboxMedia(null)}
                                    style={{ color: '#fff' }}
                                    title="Close fullscreen view"
                                >
                                    <CloseIcon style={{ fontSize: '24px' }} />
                                </button>
                            </div>
                        </div>

                        <img
                            src={activeLightboxMedia.file_url}
                            alt="Inspection record"
                            className="lightbox-img-full"
                        />

                        <div className="lightbox-footer-bar">
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                Work Order: <strong>{order?.work_order_id}</strong> • Vehicle: <strong>{order?.make} {order?.model} ({order?.license_plate})</strong>
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Delete Photo Confirmation Overlay */}
            {deleteMediaTarget && (
                <div
                    className="modal-overlay"
                    onClick={() => !isDeletingMedia && setDeleteMediaTarget(null)}
                    style={{ zIndex: 9999 }}
                >
                    <div
                        className="modal-content"
                        style={{ maxWidth: '440px', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <WarningAmberIcon style={{ fontSize: '22px' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f0f4f1' }}>
                                        Remove Attached Photo
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Confirm photo deletion from this work order
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setDeleteMediaTarget(null)}
                                disabled={isDeletingMedia}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid var(--border-glass)',
                                borderRadius: '8px',
                                padding: '10px',
                                margin: '14px 0',
                            }}
                        >
                            <img
                                src={deleteMediaTarget.file_url}
                                alt="Target item"
                                style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px' }}
                            />
                            <div style={{ flex: 1, fontSize: '12px' }}>
                                <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '4px' }}>
                                    {MEDIA_TYPE_META[deleteMediaTarget.file_type]?.label || 'Vehicle Photo'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>
                                    {deleteMediaTarget.uploaded_at
                                        ? new Date(deleteMediaTarget.uploaded_at).toLocaleDateString('en-US', {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })
                                        : 'Photo Item'}
                                </div>
                            </div>
                        </div>

                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 18px 0' }}>
                            Are you sure you want to remove this photo? It will be permanently removed from this vehicle's work order inspection record.
                        </p>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => setDeleteMediaTarget(null)}
                                disabled={isDeletingMedia}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-danger-confirm"
                                onClick={handleConfirmDeleteMedia}
                                disabled={isDeletingMedia}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <DeleteIcon fontSize="small" />
                                <span>{isDeletingMedia ? 'Removing...' : 'Delete Photo'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Delete Line Item Confirmation Overlay */}
            {deleteItemTarget && (
                <div
                    className="modal-overlay"
                    onClick={() => !isDeletingItem && setDeleteItemTarget(null)}
                    style={{ zIndex: 9999 }}
                >
                    <div
                        className="modal-content"
                        style={{ maxWidth: '460px', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>warning</span>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f0f4f1' }}>
                                        Remove Line Item
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Confirm removal from bill of materials
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setDeleteItemTarget(null)}
                                disabled={isDeletingItem}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        {/* Item Details Box */}
                        <div
                            style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 216, 95, 0.15)',
                                borderRadius: '8px',
                                padding: '14px',
                                margin: '16px 0',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className={`item-type-badge type-${deleteItemTarget.item_type}`}>
                                    {deleteItemTarget.item_type.toUpperCase()}
                                </span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--accent-yellow)', fontWeight: 700, fontSize: '15px' }}>
                                    ${parseFloat(deleteItemTarget.total_price || 0).toFixed(2)}
                                </span>
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main, #f0f4f1)', marginBottom: '4px' }}>
                                {deleteItemTarget.description}
                            </div>
                            {deleteItemTarget.sku && (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '6px' }}>
                                    SKU: {deleteItemTarget.sku}
                                </div>
                            )}
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', marginTop: '6px' }}>
                                <span>Quantity / Hours: <strong style={{ color: '#fff' }}>{parseFloat(deleteItemTarget.quantity_or_hours).toFixed(2)}</strong></span>
                                <span>Rate: <strong style={{ color: '#fff' }}>${parseFloat(deleteItemTarget.unit_price).toFixed(2)}</strong></span>
                            </div>
                        </div>

                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                            🛡️ <strong>Stock Restoration:</strong> If this is an inventory spare part, the allocated quantity will be automatically returned to parts inventory stock.
                        </p>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => setDeleteItemTarget(null)}
                                disabled={isDeletingItem}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDeleteLineItem}
                                disabled={isDeletingItem}
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
                                {isDeletingItem ? 'Removing Item...' : 'Remove Line Item'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
