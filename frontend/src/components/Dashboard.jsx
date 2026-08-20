import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ConstructionIcon from '@mui/icons-material/Construction';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';
import './css/Dashboard.css';

const API_BASE_URL = 'http://localhost:5000/api';

const getStatusBadge = (status) => {
    switch (status) {
        case 'received':
            return { label: 'RECEIVED QUEUE', class: 'badge-info', step: 1 };
        case 'diagnosed':
            return { label: 'DIAGNOSED', class: 'badge-neutral', step: 2 };
        case 'in_progress':
            return { label: 'IN PROGRESS', class: 'badge-warning', step: 3 };
        case 'ready':
            return { label: 'READY FOR PICKUP', class: 'badge-cyan', step: 4 };
        case 'completed':
            return { label: 'COMPLETED / PICKED UP', class: 'badge-success', step: 5 };
        case 'cancelled':
            return { label: 'CANCELLED', class: 'badge-error', step: 0 };
        default:
            return { label: (status || 'UNKNOWN').toUpperCase(), class: 'badge-neutral', step: 1 };
    }
};

export default function Dashboard() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Live data states
    const [workOrders, setWorkOrders] = useState([]);
    const [todayTasks, setTodayTasks] = useState([]);
    const [lowStockParts, setLowStockParts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const getLocalDateString = (d = new Date()) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const todayStr = getLocalDateString(new Date());

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const [woRes, invRes, schedRes] = await Promise.all([
                fetch(`${API_BASE_URL}/work-orders`),
                fetch(`${API_BASE_URL}/inventory`),
                fetch(`${API_BASE_URL}/schedules`),
            ]);

            if (woRes.ok) {
                const woJson = await woRes.json();
                if (woJson.success && Array.isArray(woJson.data)) {
                    setWorkOrders(woJson.data);
                }
            }

            if (invRes.ok) {
                const invJson = await invRes.json();
                if (invJson.success && Array.isArray(invJson.data)) {
                    const lowStock = invJson.data.filter((item) => {
                        const currentStock = item.stock_quantity !== undefined ? item.stock_quantity : (item.stock !== undefined ? item.stock : 0);
                        const threshold = item.reorder_threshold !== undefined ? item.reorder_threshold : 5;
                        return currentStock <= threshold || item.statusType === 'warning' || item.statusType === 'error';
                    });
                    setLowStockParts(lowStock);
                }
            }

            if (schedRes.ok) {
                const schedJson = await schedRes.json();
                if (schedJson.success && Array.isArray(schedJson.data)) {
                    // Strictly filter tasks scheduled for today only
                    const todaySched = schedJson.data.filter((t) => {
                        const taskDate = (t.scheduled_date || '').split('T')[0];
                        return taskDate === todayStr;
                    });
                    // Sort today's tasks chronologically by start time
                    todaySched.sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'));
                    setTodayTasks(todaySched);
                }
            }
        } catch (err) {
            console.error('Error fetching dashboard live data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Filter only active in-workshop work orders (excluding completed/cancelled)
    const activeWorkOrders = workOrders.filter(
        (wo) => wo.status !== 'completed' && wo.status !== 'cancelled'
    );

    const filteredOrders = activeWorkOrders.filter((wo) => {
        const query = searchTerm.toLowerCase();
        const matchesSearch =
            (wo.work_order_id || '').toLowerCase().includes(query) ||
            (wo.make || '').toLowerCase().includes(query) ||
            (wo.model || '').toLowerCase().includes(query) ||
            (wo.license_plate || '').toLowerCase().includes(query) ||
            (wo.vin || '').toLowerCase().includes(query) ||
            (wo.owner_name || '').toLowerCase().includes(query) ||
            (wo.assigned_staff_name || '').toLowerCase().includes(query);

        const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // KPI Metrics calculation
    const inProgressCount = workOrders.filter((w) => w.status === 'in_progress').length;
    const receivedCount = workOrders.filter((w) => w.status === 'received').length;
    const diagnosedCount = workOrders.filter((w) => w.status === 'diagnosed').length;
    const readyCount = workOrders.filter((w) => w.status === 'ready').length;
    const completedCount = workOrders.filter((w) => w.status === 'completed').length;
    const totalRevenue = workOrders.reduce(
        (sum, w) => sum + (parseFloat(w.total_cost) || parseFloat(w.estimated_cost) || 0),
        0
    );

    return (
        <div className="dashboard-layout">
            {/* Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main View Area */}
            <div className="dashboard-wrapper">
                {/* Top Header Bar */}
                <header className="top-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>

                        <div className="search-bar">
                            <SearchIcon className="search-icon" fontSize="small" />
                            <input
                                type="text"
                                placeholder="Search VIN, Owner, Plate, or Work Order..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-right">
                        <button className="icon-btn" onClick={fetchDashboardData} title="Refresh Live Feeds">
                            <RefreshIcon fontSize="small" />
                        </button>

                        <Link to="/intake" className="primary-action-btn" style={{ textDecoration: 'none' }}>
                            <AddIcon fontSize="small" />
                            <span className="btn-text">New Intake Order</span>
                        </Link>
                    </div>
                </header>

                {/* Dashboard Content */}
                <main className="dashboard-main">
                    {/* Title Area */}
                    <section className="dashboard-title-bar">
                        <div>
                            <h2 className="page-title">Workshop Control Terminal</h2>
                            <p className="page-subtitle">Real-time status of active repairs, vehicle queue, and shop floor activity.</p>
                        </div>
                        <div className="status-pill">
                            <span className="pulse-dot"></span>
                            <span>PostgreSQL & Redis Online</span>
                        </div>
                    </section>

                    {/* Top Micro-KPI Stats Row */}
                    <div className="dashboard-kpi-grid">
                        <div
                            className={`kpi-card ${statusFilter === 'in_progress' ? 'kpi-active' : ''}`}
                            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
                        >
                            <span className="kpi-label">In Active Repair</span>
                            <span className="kpi-val text-warning">{inProgressCount}</span>
                        </div>
                        <div
                            className={`kpi-card ${statusFilter === 'received' ? 'kpi-active' : ''}`}
                            onClick={() => setStatusFilter(statusFilter === 'received' ? 'all' : 'received')}
                        >
                            <span className="kpi-label">Received Queue</span>
                            <span className="kpi-val" style={{ color: '#38bdf8' }}>{receivedCount}</span>
                        </div>
                        <div
                            className={`kpi-card ${statusFilter === 'ready' ? 'kpi-active' : ''}`}
                            onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
                        >
                            <span className="kpi-label">Ready for Pickup</span>
                            <span className="kpi-val" style={{ color: '#2dd4bf' }}>{readyCount}</span>
                        </div>
                        <div
                            className={`kpi-card ${statusFilter === 'completed' ? 'kpi-active' : ''}`}
                            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
                        >
                            <span className="kpi-label">Picked Up / Done</span>
                            <span className="kpi-val text-success">{completedCount}</span>
                        </div>
                        <div className="kpi-card" onClick={() => navigate('/inventory')}>
                            <span className="kpi-label">Low Stock Alerts</span>
                            <span className={`kpi-val ${lowStockParts.length > 0 ? 'text-error' : 'text-success'}`}>
                                {lowStockParts.length}
                            </span>
                        </div>
                        <div className="kpi-card">
                            <span className="kpi-label">Est. Revenue</span>
                            <span className="kpi-val font-mono text-yellow">
                                ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Bento Grid Layout */}
                    <div className="bento-grid">
                        {/* Complete Work Orders Panel (Full Width col-span-12) */}
                        <article className="bento-card col-span-12">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon yellow-glow">
                                        <ConstructionIcon fontSize="small" />
                                    </div>
                                    <div>
                                        <h3 className="card-heading-title">Live Work Orders Hub</h3>
                                        <p className="card-heading-sub">Active repairs & live vehicle queue currently inside workshop bays</p>
                                    </div>
                                </div>

                                <div className="card-header-actions">
                                    <div className="wo-filter-pills">
                                        <button
                                            className={`filter-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
                                            onClick={() => setStatusFilter('all')}
                                        >
                                            All In-Shop ({activeWorkOrders.length})
                                        </button>
                                        <button
                                            className={`filter-pill-btn ${statusFilter === 'in_progress' ? 'active' : ''}`}
                                            onClick={() => setStatusFilter('in_progress')}
                                        >
                                            In Progress ({inProgressCount})
                                        </button>
                                        <button
                                            className={`filter-pill-btn ${statusFilter === 'received' ? 'active' : ''}`}
                                            onClick={() => setStatusFilter('received')}
                                        >
                                            Received ({receivedCount})
                                        </button>
                                        <button
                                            className={`filter-pill-btn ${statusFilter === 'diagnosed' ? 'active' : ''}`}
                                            onClick={() => setStatusFilter('diagnosed')}
                                        >
                                            Diagnosed ({diagnosedCount})
                                        </button>
                                        <button
                                            className={`filter-pill-btn ${statusFilter === 'ready' ? 'active' : ''}`}
                                            onClick={() => setStatusFilter('ready')}
                                        >
                                            Ready ({readyCount})
                                        </button>
                                    </div>

                                    <button
                                        className="view-all-orders-link"
                                        onClick={() => navigate('/work-orders')}
                                    >
                                        <span>View Full Table</span>
                                        <ArrowForwardIcon fontSize="small" />
                                    </button>
                                </div>
                            </div>

                            {/* Work Orders List */}
                            <div className="dashboard-orders-list">
                                {isLoading ? (
                                    <div className="empty-dashboard-state">
                                        Loading active work orders from PostgreSQL...
                                    </div>
                                ) : filteredOrders.length === 0 ? (
                                    <div className="empty-dashboard-state">
                                        No active vehicles currently in the workshop queue. Click <Link to="/intake" style={{ color: 'var(--accent-yellow)', fontWeight: 700 }}>"New Intake Order"</Link> to intake a vehicle.
                                    </div>
                                ) : (
                                    filteredOrders.map((wo) => {
                                        const badge = getStatusBadge(wo.status);
                                        const dateStr = wo.created_at
                                            ? new Date(wo.created_at).toLocaleDateString('en-US', {
                                                  month: 'short',
                                                  day: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                              })
                                            : '--';

                                        return (
                                            <div
                                                key={wo.work_order_id}
                                                className="dashboard-order-row"
                                                onClick={() => navigate(`/work-orders/${wo.work_order_id}`)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="order-left-info">
                                                    <span className="order-id-badge font-mono">{wo.work_order_id}</span>
                                                    <div className="order-vehicle-box">
                                                        <div className="order-vehicle-title">
                                                            {wo.year} {wo.make} {wo.model}
                                                        </div>
                                                        <div className="order-vehicle-meta font-mono">
                                                            <span>👤 {wo.owner_name}</span>
                                                            <span>•</span>
                                                            <span>🚗 {wo.license_plate || wo.vin}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="order-middle-info">
                                                    <div className="stepper-visual">
                                                        <span className={`step-dot ${badge.step >= 1 ? 'fill' : ''}`}></span>
                                                        <span className={`step-dot ${badge.step >= 2 ? 'fill' : ''}`}></span>
                                                        <span className={`step-dot ${badge.step >= 3 ? 'fill' : ''}`}></span>
                                                        <span className={`step-dot ${badge.step >= 4 ? 'fill' : ''}`}></span>
                                                        <span className={`step-dot ${badge.step >= 5 ? 'fill' : ''}`}></span>
                                                    </div>
                                                    <span className={`badge ${badge.class}`}>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div className="order-right-info">
                                                    <div className="tech-tag">
                                                        <PersonIcon fontSize="inherit" />
                                                        <span>{wo.assigned_staff_name || 'Unassigned'}</span>
                                                    </div>
                                                    {wo.bay_assigned && (
                                                        <span className="bay-pill font-mono">📍 {wo.bay_assigned}</span>
                                                    )}
                                                    <span className="cost-val font-mono">
                                                        ${parseFloat(wo.total_cost || wo.estimated_cost || 0).toFixed(2)}
                                                    </span>
                                                    <span className="date-sub font-mono">{dateStr}</span>
                                                    <button
                                                        type="button"
                                                        className="arrow-nav-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/work-orders/${wo.work_order_id}`);
                                                        }}
                                                    >
                                                        <ArrowForwardIcon fontSize="inherit" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </article>

                        {/* Today's Schedule Widget */}
                        <article className="bento-card col-span-6">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon">
                                        <CalendarMonthIcon fontSize="small" />
                                    </div>
                                    <div>
                                        <h3 className="card-heading-title">Today's Scheduled Tasks</h3>
                                        <p className="card-heading-sub">
                                            {todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'} scheduled for today ({new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                        </p>
                                    </div>
                                </div>
                                <button
                                    className="header-link-btn font-mono"
                                    onClick={() => navigate('/scheduling')}
                                >
                                    Open Schedule →
                                </button>
                            </div>

                            <div className="timeline-list">
                                {todayTasks.length === 0 ? (
                                    <div className="empty-widget-state">
                                        No tasks scheduled for today. Click to schedule jobs.
                                    </div>
                                ) : (
                                    todayTasks.map((t, idx) => (
                                        <div
                                            key={t.task_id || idx}
                                            className={`timeline-item ${idx === 0 ? 'active' : ''}`}
                                            onClick={() => navigate('/scheduling')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <span className="timeline-node"></span>
                                            <div className="timeline-content-stack">
                                                <div className="timeline-time-row">
                                                    <span className="timeline-time font-mono">
                                                        {t.start_time || '09:00'} - {t.end_time || '11:00'}
                                                    </span>
                                                    {t.bay_assigned && (
                                                        <span className="bay-tag font-mono">📍 {t.bay_assigned}</span>
                                                    )}
                                                </div>
                                                <h5 className="timeline-title-text">{t.task_title}</h5>
                                                <p className="timeline-sub-text font-mono">
                                                    {t.assigned_staff_name ? `Tech: ${t.assigned_staff_name}` : 'Unassigned'}
                                                    {t.make ? ` • ${t.year} ${t.make} ${t.model}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </article>

                        {/* Low Stock Alerts Widget */}
                        <article className="bento-card col-span-6 alert-card">
                            <div className="card-header">
                                <div className="card-title-group">
                                    <div className="card-icon error-glow">
                                        <WarningAmberIcon fontSize="small" />
                                    </div>
                                    <div>
                                        <h3 className="card-heading-title text-error">Low Stock Inventory Alerts</h3>
                                        <p className="card-heading-sub">Parts at or below reorder threshold</p>
                                    </div>
                                </div>
                                <span className="badge badge-error font-mono">
                                    {lowStockParts.length} Items
                                </span>
                            </div>

                            <div className="stock-list">
                                {lowStockParts.length === 0 ? (
                                    <div className="empty-widget-state" style={{ color: 'var(--status-success)' }}>
                                        ✓ All spare parts stock levels are optimal.
                                    </div>
                                ) : (
                                    lowStockParts.slice(0, 5).map((part) => {
                                        const currentStock = part.stock_quantity !== undefined ? part.stock_quantity : (part.stock !== undefined ? part.stock : 0);
                                        const partName = part.part_name || part.name || 'Part';
                                        const threshold = part.reorder_threshold !== undefined ? part.reorder_threshold : 5;

                                        return (
                                            <div
                                                key={part.part_id}
                                                className="stock-row"
                                                onClick={() => navigate('/inventory')}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div>
                                                    <span className="sku-tag font-mono">SKU: {part.sku}</span>
                                                    <p className="stock-name">{partName}</p>
                                                </div>
                                                <div className="stock-count text-error font-mono">
                                                    <strong>{currentStock} left</strong>
                                                    <span className="reorder-sub">Reorder at {threshold}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <button className="card-footer-btn outline-error" onClick={() => navigate('/inventory')}>
                                Open Inventory & Restock
                            </button>
                        </article>
                    </div>
                </main>
            </div>
        </div>
    );
}