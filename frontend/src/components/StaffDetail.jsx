import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import StyledLoading from './StyledLoading';
import VehicleVisual from './VehicleVisual';
import { API_BASE_URL } from '../config/api';
import { useCurrency } from '../context/CurrencyContext';

// Material Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import SpeedIcon from '@mui/icons-material/Speed';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StarIcon from '@mui/icons-material/Star';
import AddIcon from '@mui/icons-material/Add';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import ClearIcon from '@mui/icons-material/Clear';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import ViewListIcon from '@mui/icons-material/ViewList';

import './css/StaffDetail.css';

const STAFF_ROLE_OPTIONS = [
    'Lead Technician',
    'Master Mechanic',
    'Diagnostics Specialist',
    'Electrical & Hybrid Tech',
    'Service Advisor',
    'Brake & Suspension Tech',
    'Lube & Tire Specialist',
    'Apprentice Technician',
];

export default function StaffDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { formatCurrency, currency } = useCurrency();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // Active sub-view tab: 'vehicles', 'work_orders', 'tasks'
    const [activeTab, setActiveTab] = useState('vehicles');
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [woFilter, setWoFilter] = useState('all');

    // Date Filtering & Management for Work Order History
    const [selectedMonth, setSelectedMonth] = useState('all'); // 'all', or 'YYYY-MM'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [dateSortOrder, setDateSortOrder] = useState('desc'); // 'desc' (newest first) or 'asc' (oldest first)
    const [isGroupedByMonth, setIsGroupedByMonth] = useState(false);

    // Edit Staff Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        full_name: '',
        role: 'Master Mechanic',
        phone_number: '',
        residential_address: '',
        hourly_rate: '45.00',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchStaffProfile = async () => {
        setIsLoading(true);
        try {
            const cleanId = id ? id.replace('#', '') : '';
            const res = await fetch(`${API_BASE_URL}/staff/${cleanId}/profile`);
            if (!res.ok) {
                // Fallback to /api/staff/:id
                const fallbackRes = await fetch(`${API_BASE_URL}/staff/${cleanId}`);
                if (!fallbackRes.ok) {
                    showNotification('Employee profile not found.', 'error');
                    return;
                }
                const fallbackJson = await fallbackRes.json();
                if (fallbackJson.success && fallbackJson.data) {
                    setProfile(fallbackJson.data);
                    syncEditFormData(fallbackJson.data.staff);
                    return;
                }
            }

            const json = await res.json();
            if (json.success && json.data) {
                setProfile(json.data);
                syncEditFormData(json.data.staff);
            }
        } catch (err) {
            console.error('Error fetching employee profile:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const syncEditFormData = (staff) => {
        if (!staff) return;
        setEditForm({
            full_name: staff.full_name || staff.name || '',
            role: staff.role || 'Master Mechanic',
            phone_number: staff.phone_number || staff.phone || '',
            residential_address: staff.residential_address || staff.address || '',
            hourly_rate: staff.hourly_rate || '45.00',
        });
    };

    useEffect(() => {
        if (id) {
            fetchStaffProfile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const handleToggleStatus = async () => {
        if (!profile || !profile.staff) return;
        const currentActive = profile.staff.is_active;
        const nextActive = !currentActive;
        const staffId = profile.staff.staff_id || profile.staff.id;

        // Optimistic UI update
        setProfile((prev) => ({
            ...prev,
            staff: {
                ...prev.staff,
                is_active: nextActive,
                is_suspended: !nextActive,
                account_active: nextActive,
            },
        }));

        showNotification(
            `Staff account for ${profile.staff.full_name} is now ${nextActive ? 'ACTIVE' : 'SUSPENDED'}.`,
            nextActive ? 'success' : 'warning'
        );

        try {
            const token = localStorage.getItem('garage_auth_token');
            await fetch(`${API_BASE_URL}/staff/${staffId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    'X-User-Role': 'admin',
                },
                body: JSON.stringify({ is_active: nextActive }),
            });
            fetchStaffProfile();
        } catch (err) {
            console.error('Failed to sync status with server:', err);
            showNotification(`Could not sync status: ${err.message}`, 'error');
            fetchStaffProfile();
        }
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (isSubmitting || !profile) return;

        setIsSubmitting(true);
        try {
            const staffId = profile.staff.staff_id || profile.staff.id;
            const res = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });

            const data = await res.json();
            if (!res.ok) {
                showNotification(data.error || 'Failed to update staff profile', 'error');
                return;
            }

            showNotification('Employee profile updated successfully!', 'success');
            setIsEditModalOpen(false);
            fetchStaffProfile();
        } catch (err) {
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="staff-detail-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="staff-detail-wrapper loading-center">
                    <StyledLoading
                        message="Loading Employee Profile & Managed Cars..."
                        subtitle="Syncing assigned vehicles, repair history, and bay shifts"
                        icon="engineering"
                        badge="Staff Roster Sync"
                        size="md"
                    />
                </div>
            </div>
        );
    }

    if (!profile || !profile.staff) {
        return (
            <div className="staff-detail-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="staff-detail-wrapper loading-center">
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                        Employee profile not found.
                    </p>
                    <button className="primary-btn" onClick={() => navigate('/staff')}>
                        Back to Staff Directory
                    </button>
                </div>
            </div>
        );
    }

    const { staff, metrics, managed_vehicles = [], work_orders = [], scheduled_tasks = [] } = profile;

    // Filter managed cars by search
    const filteredCars = managed_vehicles.filter((car) => {
        if (!vehicleSearch.trim()) return true;
        const q = vehicleSearch.toLowerCase();
        return (
            (car.make || '').toLowerCase().includes(q) ||
            (car.model || '').toLowerCase().includes(q) ||
            (car.license_plate || '').toLowerCase().includes(q) ||
            (car.owner_name || '').toLowerCase().includes(q) ||
            (car.vin || '').toLowerCase().includes(q)
        );
    });

    // Available distinct months from work orders for quick date filtering
    const monthsMap = new Map();
    (work_orders || []).forEach((wo) => {
        const rawDate = wo.created_at ? new Date(wo.created_at) : null;
        if (rawDate && !isNaN(rawDate.getTime())) {
            const key = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}`;
            const label = rawDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthsMap.set(key, { key, label, count: (monthsMap.get(key)?.count || 0) + 1 });
        }
    });
    const availableMonths = Array.from(monthsMap.values()).sort((a, b) => b.key.localeCompare(a.key));

    // Filter and sort work orders by status and date criteria
    const filteredWorkOrders = (work_orders || []).filter((wo) => {
        // 1. Status filter
        if (woFilter === 'active') {
            if (!['in_progress', 'received', 'diagnosed', 'scheduled', 'quality_check'].includes(wo.status)) {
                return false;
            }
        } else if (woFilter === 'completed') {
            if (!['completed', 'ready'].includes(wo.status)) {
                return false;
            }
        } else if (woFilter !== 'all') {
            if (wo.status !== woFilter) return false;
        }

        // 2. Month preset filter
        if (selectedMonth !== 'all') {
            const woMonth = wo.year_month || (wo.created_at ? new Date(wo.created_at).toISOString().slice(0, 7) : '');
            if (woMonth !== selectedMonth) return false;
        }

        // 3. Custom Date Range filter
        if (customStartDate) {
            const woDate = wo.date_raw || (wo.created_at ? new Date(wo.created_at).toISOString().slice(0, 10) : '');
            if (woDate < customStartDate) return false;
        }
        if (customEndDate) {
            const woDate = wo.date_raw || (wo.created_at ? new Date(wo.created_at).toISOString().slice(0, 10) : '');
            if (woDate > customEndDate) return false;
        }

        return true;
    }).sort((a, b) => {
        const timeA = a.created_timestamp || (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.created_timestamp || (b.created_at ? new Date(b.created_at).getTime() : 0);
        return dateSortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // Group work orders by month when requested
    let groupedWorkOrders = null;
    if (isGroupedByMonth) {
        const map = new Map();
        filteredWorkOrders.forEach((wo) => {
            const groupName = wo.month_year || 'Unassigned Date';
            if (!map.has(groupName)) {
                map.set(groupName, {
                    name: groupName,
                    items: [],
                    totalCost: 0,
                    completedCount: 0,
                });
            }
            const group = map.get(groupName);
            group.items.push(wo);
            group.totalCost += parseFloat(wo.total_cost || 0);
            if (['completed', 'ready'].includes(wo.status)) {
                group.completedCount += 1;
            }
        });
        groupedWorkOrders = Array.from(map.values());
    }

    const renderWorkOrderItem = (wo) => {
        const dateFormatted = wo.date_formatted || (wo.created_at
            ? new Date(wo.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              })
            : '--');

        return (
            <div
                key={wo.work_order_id}
                className="staff-wo-item"
                onClick={() => navigate(`/work-orders/${wo.work_order_id}`)}
            >
                <div className="wo-item-left">
                    <VehicleVisual
                        vehicleType={wo.vehicle_type}
                        make={wo.make}
                        model={wo.model}
                        size="xs"
                        showBadge={false}
                    />
                    <div className="wo-item-meta">
                        <div className="wo-item-title-row">
                            <span className="wo-item-id font-mono">
                                {wo.work_order_id}
                            </span>
                            <span className="wo-date-badge font-mono">
                                📅 {dateFormatted} {wo.time_formatted ? `• ${wo.time_formatted}` : ''}
                            </span>
                        </div>
                        <span className="wo-item-vehicle">
                            {wo.year} {wo.make} {wo.model} ({wo.license_plate})
                        </span>
                        <div className="wo-item-sub font-mono">
                            <span>Owner: {wo.owner_name}</span>
                            <span>•</span>
                            <span>Bay: {wo.bay_assigned || 'B1'}</span>
                            {wo.labor_hours > 0 && (
                                <>
                                    <span>•</span>
                                    <span>{wo.labor_hours} hrs labor</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="wo-item-right">
                    <span className={`status-pill pill-${wo.status}`}>
                        {wo.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="wo-item-cost font-mono">
                        {formatCurrency(wo.total_cost || 0)}
                    </span>
                </div>
            </div>
        );
    };

    const isSuspended = staff.is_suspended || !staff.is_active;

    return (
        <div className="staff-detail-layout">
            {/* Sidebar */}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Main Area */}
            <div className="staff-detail-wrapper">
                {/* Header */}
                <header className="staff-detail-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>
                        <div className="header-title-wrap">
                            <h2 className="header-title">Employee Profile & Managed Fleet</h2>
                        </div>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchStaffProfile} title="Refresh Live Data">
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="staff-detail-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`staff-detail-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Context Navigation Bar */}
                        <div className="context-nav-bar">
                            <Link to="/staff" className="back-link">
                                <ArrowBackIcon fontSize="small" />
                                <span>Back to Staff Directory</span>
                            </Link>

                            <div className="nav-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    <EditIcon fontSize="small" />
                                    <span>Edit Details</span>
                                </button>

                                {isSuspended ? (
                                    <button
                                        type="button"
                                        className="btn-success-outline"
                                        onClick={handleToggleStatus}
                                    >
                                        <CheckCircleIcon fontSize="small" />
                                        <span>Reactivate Account</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-danger-outline"
                                        onClick={handleToggleStatus}
                                    >
                                        <BlockIcon fontSize="small" />
                                        <span>Suspend Account</span>
                                    </button>
                                )}

                                <Link to="/intake" className="btn-secondary" style={{ textDecoration: 'none' }}>
                                    <AddIcon fontSize="small" />
                                    <span>New Intake</span>
                                </Link>
                            </div>
                        </div>

                        {/* Staff Hero Card */}
                        <section className="staff-hero-card">
                            <div className={`hero-avatar-box ${isSuspended ? 'avatar-suspended' : ''}`}>
                                <span className="hero-avatar-initials font-mono">{staff.initials}</span>
                            </div>

                            <div className="hero-info-stack">
                                <div className="hero-title-row">
                                    <div>
                                        <div className="staff-id-tag font-mono">STAFF ID #{staff.staff_id}</div>
                                        <h1 className="hero-name">
                                            {staff.full_name || staff.name}
                                            <span className={`hero-role-badge ${staff.role?.toLowerCase().includes('lead') ? 'role-lead' : ''}`}>
                                                {staff.role}
                                            </span>
                                        </h1>
                                        <div className="hero-meta-row" style={{ marginTop: '6px' }}>
                                            <span className={`status-badge-inline ${isSuspended ? 'badge-suspended' : 'badge-active'}`}>
                                                {isSuspended ? '● Suspended' : '● Active Status'}
                                            </span>
                                            <span>• Member Since {staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '--'}</span>
                                            {staff.has_user_account ? (
                                                <span className="font-mono" style={{ color: '#60a5fa' }}>Terminal Account Linked</span>
                                            ) : (
                                                <span className="font-mono text-muted">No Terminal Account</span>
                                            )}
                                        </div>
                                    </div>

                                    {isSuspended ? (
                                        <div className="hero-rate-pill pill-suspended font-mono">SUSPENDED</div>
                                    ) : (
                                        <div className="hero-rate-pill font-mono">${staff.hourly_rate}/hr</div>
                                    )}
                                </div>

                                <div className="hero-contact-grid font-mono">
                                    <div className="contact-item">
                                        <div className="contact-icon-box">
                                            <EmailIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="contact-label">EMAIL ADDRESS</span>
                                            <span className="contact-value">{staff.email}</span>
                                        </div>
                                    </div>

                                    <div className="contact-item">
                                        <div className="contact-icon-box">
                                            <PhoneIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="contact-label">PHONE NUMBER</span>
                                            <span className="contact-value">{staff.phone_number || staff.phone || 'Not Set'}</span>
                                        </div>
                                    </div>

                                    <div className="contact-item">
                                        <div className="contact-icon-box">
                                            <LocationOnIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="contact-label">RESIDENTIAL ADDRESS</span>
                                            <span className="contact-value">{staff.residential_address || staff.address || 'Not Provided'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Performance Metrics Bento Row */}
                        <div className="metrics-bento-grid">
                            {/* Managed Cars */}
                            <div className="metric-bento-card card-highlight">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Managed Cars</span>
                                    <div className="metric-card-icon">
                                        <DirectionsCarIcon fontSize="small" />
                                    </div>
                                </div>
                                <div className="metric-card-value text-yellow font-mono">
                                    {metrics?.total_managed_cars || managed_vehicles.length}
                                </div>
                                <span className="metric-card-sub">Distinct vehicles serviced</span>
                            </div>

                            {/* Active Work Orders */}
                            <div className="metric-bento-card">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Active Jobs</span>
                                    <div className="metric-card-icon">
                                        <SpeedIcon fontSize="small" />
                                    </div>
                                </div>
                                <div className="metric-card-value font-mono">
                                    {metrics?.active_jobs || 0}
                                </div>
                                <span className="metric-card-sub">In queue or underway</span>
                            </div>

                            {/* Completed Repairs */}
                            <div className="metric-bento-card">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Completed Jobs</span>
                                    <div className="metric-card-icon">
                                        <BuildIcon fontSize="small" />
                                    </div>
                                </div>
                                <div className="metric-card-value text-yellow font-mono">
                                    {metrics?.completed_jobs || 0}
                                </div>
                                <span className="metric-card-sub">Successfully repaired</span>
                            </div>

                            {/* Labor Hours */}
                            <div className="metric-bento-card">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Labor Logged</span>
                                    <div className="metric-card-icon">
                                        <AccessTimeIcon fontSize="small" />
                                    </div>
                                </div>
                                <div className="metric-card-value font-mono">
                                    {metrics?.total_labor_hours || '0.0'} hrs
                                </div>
                                <span className="metric-card-sub">Billed technician time</span>
                            </div>

                            {/* Billed Revenue */}
                            <div className="metric-bento-card">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Labor Value</span>
                                    <div className="metric-card-icon">
                                        <AttachMoneyIcon fontSize="small" />
                                    </div>
                                </div>
                                <div className="metric-card-value text-yellow font-mono">
                                    {formatCurrency(metrics?.total_revenue_generated || 0)}
                                </div>
                                <span className="metric-card-sub">Revenue generated</span>
                            </div>

                            {/* Garage Work Share */}
                            <div className="metric-bento-card">
                                <div className="metric-card-top">
                                    <span className="metric-card-label">Garage Work Share</span>
                                    <span className={`status-badge-inline ${isSuspended ? 'badge-suspended' : 'badge-active'}`}>
                                        {isSuspended ? 'Suspended' : `${metrics?.completed_jobs || 0}/${metrics?.total_garage_done || 0} Done`}
                                    </span>
                                </div>
                                <div className="metric-card-value font-mono">
                                    {isSuspended ? '0%' : `${metrics?.work_share_percent ?? metrics?.workload_percent ?? 0}%`}
                                </div>
                                <div className="mini-capacity-bar">
                                    <div
                                        className={`mini-capacity-fill ${
                                            isSuspended
                                                ? 'fill-suspended'
                                                : metrics?.workload_type === 'warning'
                                                ? 'fill-warning'
                                                : 'fill-success'
                                        }`}
                                        style={{ width: isSuspended ? '0%' : `${metrics?.work_share_percent ?? metrics?.workload_percent ?? 0}%` }}
                                    ></div>
                                </div>
                                <span className="metric-card-sub" style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {metrics?.completed_jobs || 0} of {metrics?.total_garage_done || 0} garage repairs completed
                                </span>
                            </div>
                        </div>

                        {/* Interactive Navigation Tabs */}
                        <div className="tabs-container">
                            <div className="tabs-group">
                                <button
                                    type="button"
                                    className={`tab-btn ${activeTab === 'vehicles' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('vehicles')}
                                >
                                    <DirectionsCarIcon fontSize="small" />
                                    <span>Managed Vehicles Record</span>
                                    <span className="tab-counter font-mono">{managed_vehicles.length}</span>
                                </button>

                                <button
                                    type="button"
                                    className={`tab-btn ${activeTab === 'work_orders' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('work_orders')}
                                >
                                    <BuildIcon fontSize="small" />
                                    <span>Work Order History</span>
                                    <span className="tab-counter font-mono">{work_orders.length}</span>
                                </button>

                                <button
                                    type="button"
                                    className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('tasks')}
                                >
                                    <CalendarMonthIcon fontSize="small" />
                                    <span>Bay Task Shifts</span>
                                    <span className="tab-counter font-mono">{scheduled_tasks.length}</span>
                                </button>
                            </div>

                            {activeTab === 'vehicles' && (
                                <input
                                    type="text"
                                    className="tab-search-input font-mono"
                                    placeholder="Filter cars by make, plate, owner..."
                                    value={vehicleSearch}
                                    onChange={(e) => setVehicleSearch(e.target.value)}
                                />
                            )}

                            {activeTab === 'work_orders' && (
                                <div className="tabs-group">
                                    <button
                                        type="button"
                                        className={`tab-btn ${woFilter === 'all' ? 'active' : ''}`}
                                        onClick={() => setWoFilter('all')}
                                    >
                                        All ({work_orders.length})
                                    </button>
                                    <button
                                        type="button"
                                        className={`tab-btn ${woFilter === 'active' ? 'active' : ''}`}
                                        onClick={() => setWoFilter('active')}
                                    >
                                        Active ({metrics?.active_jobs || 0})
                                    </button>
                                    <button
                                        type="button"
                                        className={`tab-btn ${woFilter === 'completed' ? 'active' : ''}`}
                                        onClick={() => setWoFilter('completed')}
                                    >
                                        Completed ({metrics?.completed_jobs || 0})
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* TAB 1: MANAGED CARS RECORD */}
                        {activeTab === 'vehicles' && (
                            <div>
                                {filteredCars.length === 0 ? (
                                    <div className="profile-empty-state">
                                        <DirectionsCarIcon className="empty-state-icon" />
                                        <h3 className="empty-state-title">No Managed Cars Found</h3>
                                        <p className="empty-state-sub">
                                            {vehicleSearch
                                                ? `No vehicles matched "${vehicleSearch}".`
                                                : 'No vehicles have been assigned to or serviced by this employee yet.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="managed-cars-grid">
                                        {filteredCars.map((car) => {
                                            const lastDate = car.latest_service_date
                                                ? new Date(car.latest_service_date).toLocaleDateString('en-US', {
                                                      month: 'short',
                                                      day: 'numeric',
                                                      year: 'numeric',
                                                  })
                                                : '--';

                                            return (
                                                <div key={car.vehicle_id} className="managed-car-card">
                                                    <div className="car-card-header">
                                                        <VehicleVisual
                                                            vehicleType={car.vehicle_type}
                                                            make={car.make}
                                                            model={car.model}
                                                            size="sm"
                                                            showBadge={true}
                                                        />
                                                        <div className="car-header-info">
                                                            <div className="car-title-row">
                                                                <span className="car-name-bold">
                                                                    {car.year} {car.make} {car.model}
                                                                </span>
                                                                <span className="car-plate-badge font-mono">
                                                                    {car.license_plate}
                                                                </span>
                                                            </div>
                                                            <div className="car-vin-sub font-mono">
                                                                VIN: {car.vin}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="car-details-panel">
                                                        <div className="detail-line">
                                                            <span className="detail-label">Client / Owner:</span>
                                                            <span className="detail-val">
                                                                {car.owner_name} {car.owner_is_vip && <StarIcon style={{ fontSize: 13, color: '#ffd85f', verticalAlign: 'middle' }} />}
                                                            </span>
                                                        </div>
                                                        <div className="detail-line">
                                                            <span className="detail-label">Client Phone:</span>
                                                            <span className="detail-val font-mono">{car.owner_phone || 'None'}</span>
                                                        </div>
                                                        <div className="detail-line">
                                                            <span className="detail-label">Last Serviced:</span>
                                                            <span className="detail-val font-mono">{lastDate}</span>
                                                        </div>
                                                        <div className="detail-line">
                                                            <span className="detail-label">Latest Status:</span>
                                                            <span className={`status-pill pill-${car.latest_status || 'received'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                                                                {(car.latest_status || 'received').replace('_', ' ').toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="car-card-footer">
                                                        <span className="service-count-pill font-mono">
                                                            Serviced {car.times_serviced || 1}x
                                                        </span>

                                                        {car.latest_work_order_id && (
                                                            <button
                                                                type="button"
                                                                className="car-link-btn font-mono"
                                                                onClick={() => navigate(`/work-orders/${car.latest_work_order_id}`)}
                                                            >
                                                                <span>View Order ({car.latest_work_order_id})</span>
                                                                <span>→</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 2: WORK ORDER HISTORY */}
                        {activeTab === 'work_orders' && (
                            <div className="tab-work-orders-container">
                                {/* Date Management & Filter Bar */}
                                <div className="wo-date-filter-bar">
                                    <div className="wo-date-presets">
                                        <span className="date-filter-label font-mono">
                                            <CalendarMonthIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />
                                            Month:
                                        </span>
                                        <button
                                            type="button"
                                            className={`date-preset-pill ${selectedMonth === 'all' && !customStartDate && !customEndDate ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedMonth('all');
                                                setCustomStartDate('');
                                                setCustomEndDate('');
                                            }}
                                        >
                                            All Dates ({work_orders.length})
                                        </button>
                                        {availableMonths.map((m) => (
                                            <button
                                                key={m.key}
                                                type="button"
                                                className={`date-preset-pill ${selectedMonth === m.key ? 'active' : ''}`}
                                                onClick={() => {
                                                    setSelectedMonth(m.key);
                                                    setCustomStartDate('');
                                                    setCustomEndDate('');
                                                }}
                                            >
                                                {m.label} ({m.count})
                                            </button>
                                        ))}
                                    </div>

                                    <div className="wo-date-custom-controls">
                                        <div className="date-input-group">
                                            <span className="date-group-label font-mono">From:</span>
                                            <input
                                                type="date"
                                                className="date-input-field font-mono"
                                                value={customStartDate}
                                                onChange={(e) => {
                                                    setCustomStartDate(e.target.value);
                                                    setSelectedMonth('all');
                                                }}
                                            />
                                        </div>

                                        <div className="date-input-group">
                                            <span className="date-group-label font-mono">To:</span>
                                            <input
                                                type="date"
                                                className="date-input-field font-mono"
                                                value={customEndDate}
                                                onChange={(e) => {
                                                    setCustomEndDate(e.target.value);
                                                    setSelectedMonth('all');
                                                }}
                                            />
                                        </div>

                                        {(customStartDate || customEndDate || selectedMonth !== 'all') && (
                                            <button
                                                type="button"
                                                className="date-action-btn font-mono"
                                                onClick={() => {
                                                    setSelectedMonth('all');
                                                    setCustomStartDate('');
                                                    setCustomEndDate('');
                                                }}
                                                title="Reset Date Filters"
                                            >
                                                <ClearIcon style={{ fontSize: 13 }} />
                                                <span>Reset Dates</span>
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            className={`date-action-btn font-mono ${dateSortOrder === 'asc' ? 'active' : ''}`}
                                            onClick={() => setDateSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                                            title="Toggle Date Sort Order"
                                        >
                                            <SwapVertIcon style={{ fontSize: 14 }} />
                                            <span>{dateSortOrder === 'desc' ? 'Newest First ↓' : 'Oldest First ↑'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            className={`date-action-btn font-mono ${isGroupedByMonth ? 'active' : ''}`}
                                            onClick={() => setIsGroupedByMonth((prev) => !prev)}
                                            title="Group work orders by month"
                                        >
                                            {isGroupedByMonth ? <ViewListIcon style={{ fontSize: 14 }} /> : <ViewAgendaIcon style={{ fontSize: 14 }} />}
                                            <span>{isGroupedByMonth ? 'Flat List' : 'Group by Month'}</span>
                                        </button>
                                    </div>
                                </div>

                                {filteredWorkOrders.length === 0 ? (
                                    <div className="profile-empty-state">
                                        <BuildIcon className="empty-state-icon" />
                                        <h3 className="empty-state-title">No Work Orders Matching Date Filter</h3>
                                        <p className="empty-state-sub">
                                            No repair orders found for the selected status and date range.
                                        </p>
                                        {(customStartDate || customEndDate || selectedMonth !== 'all' || woFilter !== 'all') && (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                style={{ marginTop: '12px' }}
                                                onClick={() => {
                                                    setWoFilter('all');
                                                    setSelectedMonth('all');
                                                    setCustomStartDate('');
                                                    setCustomEndDate('');
                                                }}
                                            >
                                                Reset All Filters
                                            </button>
                                        )}
                                    </div>
                                ) : isGroupedByMonth && groupedWorkOrders ? (
                                    <div className="wo-month-groups-container">
                                        {groupedWorkOrders.map((group) => (
                                            <div key={group.name} className="wo-month-group-card">
                                                <div className="wo-month-group-header font-mono">
                                                    <div className="group-header-left">
                                                        <CalendarMonthIcon style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }} />
                                                        <span className="group-header-title">{group.name}</span>
                                                        <span className="group-count-tag font-mono">
                                                            {group.items.length} {group.items.length === 1 ? 'order' : 'orders'}
                                                        </span>
                                                    </div>
                                                    <div className="group-header-right">
                                                        <span>{group.completedCount} completed</span>
                                                        <span>•</span>
                                                        <span className="text-yellow">{formatCurrency(group.totalCost)}</span>
                                                    </div>
                                                </div>
                                                <div className="work-orders-list">
                                                    {group.items.map((wo) => renderWorkOrderItem(wo))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="work-orders-list">
                                        {filteredWorkOrders.map((wo) => renderWorkOrderItem(wo))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: SCHEDULED BAY TASKS */}
                        {activeTab === 'tasks' && (
                            <div>
                                {scheduled_tasks.length === 0 ? (
                                    <div className="profile-empty-state">
                                        <CalendarMonthIcon className="empty-state-icon" />
                                        <h3 className="empty-state-title">No Bay Tasks Scheduled</h3>
                                        <p className="empty-state-sub">
                                            This staff member currently has no bay assignments in the workshop schedule.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="tasks-grid">
                                        {scheduled_tasks.map((task) => (
                                            <div key={task.task_id} className="task-card">
                                                <div className="task-card-top">
                                                    <span className="task-bay-badge font-mono">
                                                        Bay {task.bay_assigned || 'B1'}
                                                    </span>
                                                    <span className={`task-priority-pill font-mono priority-${task.priority}`}>
                                                        {task.priority}
                                                    </span>
                                                </div>

                                                <h4 className="task-title">{task.task_title}</h4>

                                                {task.make && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <VehicleVisual
                                                            vehicleType={task.vehicle_type}
                                                            make={task.make}
                                                            model={task.model}
                                                            size="xs"
                                                            showBadge={false}
                                                        />
                                                        <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>
                                                            {task.make} {task.model} ({task.license_plate})
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="task-timing font-mono">
                                                    <AccessTimeIcon style={{ fontSize: 14 }} />
                                                    <span>
                                                        {task.scheduled_date ? new Date(task.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'} | {task.start_time?.slice(0, 5)} - {task.end_time?.slice(0, 5)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modal: Edit Staff Member Profile */}
            {isEditModalOpen && (
                <div className="staff-modal-overlay">
                    <div className="staff-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <EditIcon className="modal-header-icon" />
                                <div>
                                    <h3 className="modal-title">Edit Employee Profile</h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Update personnel records, role, hourly rates & address
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setIsEditModalOpen(false)}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="staff-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="edit_full_name">FULL NAME *</label>
                                    <input
                                        type="text"
                                        id="edit_full_name"
                                        value={editForm.full_name}
                                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_role">WORKSHOP ROLE *</label>
                                    <select
                                        id="edit_role"
                                        value={editForm.role}
                                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                        required
                                    >
                                        {STAFF_ROLE_OPTIONS.map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_phone">PHONE NUMBER</label>
                                    <input
                                        type="text"
                                        id="edit_phone"
                                        className="font-mono"
                                        value={editForm.phone_number}
                                        onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_rate">HOURLY RATE ({currency?.code || currency?.symbol || '$'}) *</label>
                                    <input
                                        type="number"
                                        step="0.50"
                                        min="0"
                                        id="edit_rate"
                                        className="font-mono"
                                        value={editForm.hourly_rate}
                                        onChange={(e) => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="edit_address">RESIDENTIAL ADDRESS</label>
                                    <input
                                        type="text"
                                        id="edit_address"
                                        value={editForm.residential_address}
                                        onChange={(e) => setEditForm({ ...editForm, residential_address: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button
                                    type="button"
                                    className="btn-modal-cancel"
                                    onClick={() => setIsEditModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-modal-submit"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Saving...' : 'Save Profile Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
