import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import EngineeringIcon from '@mui/icons-material/Engineering';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import StarIcon from '@mui/icons-material/Star';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HandymanIcon from '@mui/icons-material/Handyman';
import './StaffDashboard.css';

const API_BASE_URL = 'http://localhost:5000/api';

export default function StaffDashboard() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [workOrders, setWorkOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [notification, setNotification] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchWorkOrders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setWorkOrders(json.data);
                }
            }
        } catch (err) {
            console.error('Error fetching staff work orders:', err);
            showNotification('Failed to fetch work orders from server', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkOrders();
    }, []);

    const handleQuickAdvance = async (e, orderId, nextStatus) => {
        e.stopPropagation();
        try {
            const res = await fetch(`${API_BASE_URL}/staff/work-orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
            });
            if (res.ok) {
                showNotification(`Work Order ${orderId} moved to ${nextStatus.toUpperCase()}!`, 'success');
                fetchWorkOrders();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Filter logic
    const filteredOrders = workOrders.filter((wo) => {
        const query = searchTerm.toLowerCase();
        const matchesSearch =
            (wo.work_order_id || '').toLowerCase().includes(query) ||
            (wo.vin || '').toLowerCase().includes(query) ||
            (wo.make || '').toLowerCase().includes(query) ||
            (wo.model || '').toLowerCase().includes(query) ||
            (wo.owner_name || '').toLowerCase().includes(query) ||
            (wo.license_plate || '').toLowerCase().includes(query);

        const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const metrics = {
        total: workOrders.length,
        received: workOrders.filter((w) => w.status === 'received').length,
        diagnosed: workOrders.filter((w) => w.status === 'diagnosed').length,
        inProgress: workOrders.filter((w) => w.status === 'in_progress').length,
        completed: workOrders.filter((w) => w.status === 'completed').length,
    };

    return (
        <div className="staff-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="staff-wrapper">
                {/* Header */}
                <header className="staff-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>
                        <div className="header-title-wrap">
                            <h2 className="header-title">Staff Workshop & Repair Hub</h2>
                            <span className="live-status-pill">
                                <span className="pulse-dot"></span> LIVE REDIS CACHED
                            </span>
                        </div>
                    </div>

                    <div className="header-right">
                        <div className="search-box">
                            <SearchIcon className="search-icon" fontSize="small" />
                            <input
                                type="text"
                                placeholder="Search WO#, VIN, Plate, Owner..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button className="icon-btn" onClick={fetchWorkOrders} title="Refresh Live Data">
                            <RefreshIcon fontSize="small" />
                        </button>

                        <button className="icon-btn" aria-label="Notifications">
                            <NotificationsIcon fontSize="small" />
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="staff-main">
                    <div className="staff-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`staff-toast toast-${notification.type}`}>
                                <EngineeringIcon fontSize="small" />
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Page Title & Actions */}
                        <div className="page-intro-row">
                            <div>
                                <h1 className="main-heading">Active Work Orders & Repair Queue</h1>
                                <p className="sub-heading">
                                    Monitor incoming vehicle intakes, advance diagnostic states, allocate inventory parts, and log labor hours.
                                </p>
                            </div>
                            <button
                                className="primary-btn new-intake-btn"
                                onClick={() => navigate('/intake')}
                            >
                                <DirectionsCarIcon fontSize="small" />
                                <span>NEW VEHICLE INTAKE</span>
                            </button>
                        </div>

                        {/* Metric KPI Cards */}
                        <div className="metrics-grid">
                            <div className="metric-card card-received" onClick={() => setStatusFilter('received')}>
                                <div className="metric-icon-wrap icon-received">
                                    <PendingActionsIcon />
                                </div>
                                <div>
                                    <div className="metric-label">Received / Queue</div>
                                    <div className="metric-val text-yellow">{metrics.received}</div>
                                    <div className="metric-hint">Awaiting Inspection</div>
                                </div>
                            </div>

                            <div className="metric-card card-diagnosed" onClick={() => setStatusFilter('diagnosed')}>
                                <div className="metric-icon-wrap icon-diagnosed">
                                    <HandymanIcon />
                                </div>
                                <div>
                                    <div className="metric-label">Under Diagnosis</div>
                                    <div className="metric-val text-blue">{metrics.diagnosed}</div>
                                    <div className="metric-hint">Estimates & Parts Needed</div>
                                </div>
                            </div>

                            <div className="metric-card card-inprogress" onClick={() => setStatusFilter('in_progress')}>
                                <div className="metric-icon-wrap icon-inprogress">
                                    <BuildIcon />
                                </div>
                                <div>
                                    <div className="metric-label">In Active Repair</div>
                                    <div className="metric-val text-emerald">{metrics.inProgress}</div>
                                    <div className="metric-hint">Technician on Bay</div>
                                </div>
                            </div>

                            <div className="metric-card card-completed" onClick={() => setStatusFilter('completed')}>
                                <div className="metric-icon-wrap icon-completed">
                                    <CheckCircleIcon />
                                </div>
                                <div>
                                    <div className="metric-label">Completed Jobs</div>
                                    <div className="metric-val text-purple">{metrics.completed}</div>
                                    <div className="metric-hint">Ready for Invoicing</div>
                                </div>
                            </div>
                        </div>

                        {/* Toolbar & Filter Tabs */}
                        <div className="filter-toolbar">
                            <div className="tab-group">
                                <span className="filter-text"><FilterListIcon fontSize="small" /> Status Filter:</span>
                                <button
                                    className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    All Jobs ({metrics.total})
                                </button>
                                <button
                                    className={`tab-btn tab-received ${statusFilter === 'received' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('received')}
                                >
                                    Received ({metrics.received})
                                </button>
                                <button
                                    className={`tab-btn tab-diagnosed ${statusFilter === 'diagnosed' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('diagnosed')}
                                >
                                    Diagnosed ({metrics.diagnosed})
                                </button>
                                <button
                                    className={`tab-btn tab-inprogress ${statusFilter === 'in_progress' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('in_progress')}
                                >
                                    In Progress ({metrics.inProgress})
                                </button>
                                <button
                                    className={`tab-btn tab-completed ${statusFilter === 'completed' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('completed')}
                                >
                                    Completed ({metrics.completed})
                                </button>
                            </div>
                        </div>

                        {/* Work Orders List / Grid */}
                        <div className="orders-grid">
                            {isLoading ? (
                                <div className="loading-card col-span-full">
                                    <EngineeringIcon className="spinning-icon" />
                                    <p>Loading Active Workshop Work Orders...</p>
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="empty-card col-span-full">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>No Work Orders Found</h3>
                                    <p>There are no jobs matching the selected filter.</p>
                                </div>
                            ) : (
                                filteredOrders.map((order) => (
                                    <div
                                        key={order.work_order_id}
                                        className={`order-card status-border-${order.status}`}
                                        onClick={() => navigate(`/staff/work-orders/${order.work_order_id}`)}
                                    >
                                        <div className="card-top-row">
                                            <div className="order-id-group">
                                                <span className="wo-id-badge">{order.work_order_id}</span>
                                                <span className={`status-pill pill-${order.status}`}>
                                                    {order.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="bay-badge">
                                                {order.bay_assigned ? `📍 ${order.bay_assigned}` : '⚠️ No Bay Assigned'}
                                            </div>
                                        </div>

                                        <div className="vehicle-info-block">
                                            <div className="vehicle-title">
                                                {order.year} {order.make} {order.model}
                                            </div>
                                            <div className="vehicle-plate-vin">
                                                <span className="plate-tag">{order.license_plate}</span>
                                                <span className="vin-tag font-mono">VIN: {order.vin}</span>
                                            </div>
                                        </div>

                                        <div className="owner-row">
                                            <span className="owner-name-label">
                                                {order.owner_name} {order.owner_is_vip && <StarIcon className="vip-icon" fontSize="inherit" />}
                                            </span>
                                            <span className="owner-phone font-mono">{order.owner_phone}</span>
                                        </div>

                                        {order.initial_observations && (
                                            <div className="observations-box">
                                                <span className="obs-label">OBSERVATIONS:</span>
                                                <p className="obs-text">{order.initial_observations}</p>
                                            </div>
                                        )}

                                        <div className="card-footer-meta">
                                            <div className="meta-cost-group">
                                                <span className="cost-label">TOTAL COST</span>
                                                <span className="cost-val font-mono">
                                                    ${parseFloat(order.total_cost || 0).toFixed(2)}
                                                </span>
                                            </div>

                                            <div className="meta-assignee">
                                                <span className="assignee-label">TECH ASSIGNED</span>
                                                <span className="assignee-val">
                                                    {order.assigned_staff_name || 'Unassigned'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="card-actions-row">
                                            {order.status === 'received' && (
                                                <button
                                                    type="button"
                                                    className="quick-action-btn btn-diagnose"
                                                    onClick={(e) => handleQuickAdvance(e, order.work_order_id, 'diagnosed')}
                                                >
                                                    <HandymanIcon fontSize="small" />
                                                    <span>Start Diagnosis</span>
                                                </button>
                                            )}

                                            {order.status === 'diagnosed' && (
                                                <button
                                                    type="button"
                                                    className="quick-action-btn btn-start-work"
                                                    onClick={(e) => handleQuickAdvance(e, order.work_order_id, 'in_progress')}
                                                >
                                                    <PlayArrowIcon fontSize="small" />
                                                    <span>Start Repair</span>
                                                </button>
                                            )}

                                            {order.status === 'in_progress' && (
                                                <button
                                                    type="button"
                                                    className="quick-action-btn btn-complete-job"
                                                    onClick={(e) => handleQuickAdvance(e, order.work_order_id, 'completed')}
                                                >
                                                    <CheckCircleIcon fontSize="small" />
                                                    <span>Mark Complete</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                className="open-details-btn"
                                                onClick={() => navigate(`/staff/work-orders/${order.work_order_id}`)}
                                            >
                                                <span>EXECUTION HUB</span>
                                                <ArrowForwardIcon fontSize="small" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
