import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import StarIcon from '@mui/icons-material/Star';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import './OwnerCars.css';

const API_BASE_URL = 'http://localhost:5000/api';

export default function OwnerCars() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [owners, setOwners] = useState([]);
    const [selectedOwnerId, setSelectedOwnerId] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchVehiclesAndOwners = async () => {
        setIsLoading(true);
        try {
            const [vehRes, ownRes] = await Promise.all([
                fetch(`${API_BASE_URL}/owner/vehicles`),
                fetch(`${API_BASE_URL}/owners`),
            ]);

            if (vehRes.ok) {
                const vJson = await vehRes.json();
                if (vJson.success && Array.isArray(vJson.data)) {
                    setVehicles(vJson.data);
                }
            }

            if (ownRes.ok) {
                const oJson = await ownRes.json();
                if (oJson.success && Array.isArray(oJson.data)) {
                    setOwners(oJson.data);
                }
            }
        } catch (err) {
            console.error('Error loading vehicles:', err);
            showNotification('Failed to fetch vehicle fleet data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchVehiclesAndOwners();
    }, []);

    // Filter vehicles
    const filteredVehicles = vehicles.filter((v) => {
        const query = searchTerm.toLowerCase();
        const matchesSearch =
            (v.vin || '').toLowerCase().includes(query) ||
            (v.make || '').toLowerCase().includes(query) ||
            (v.model || '').toLowerCase().includes(query) ||
            (v.license_plate || '').toLowerCase().includes(query) ||
            (v.owner_name || '').toLowerCase().includes(query);

        const matchesOwner =
            selectedOwnerId === 'all' || v.owner_id === selectedOwnerId;

        return matchesSearch && matchesOwner;
    });

    // Metrics calculations
    const totalVehicles = vehicles.length;
    const inShopVehicles = vehicles.filter((v) => v.has_active_order).length;
    const totalServices = vehicles.reduce((sum, v) => sum + (v.total_services_count || 0), 0);
    const totalFleetSpent = vehicles.reduce((sum, v) => sum + (parseFloat(v.total_spent) || 0), 0);

    return (
        <div className="owner-cars-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="owner-cars-wrapper">
                {/* Header */}
                <header className="owner-cars-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>
                        <div className="header-title-badge">
                            <DirectionsCarIcon fontSize="small" />
                            <span>GARAGE FLEET & OWNER CARS</span>
                        </div>

                        <div className="header-search-wrap">
                            <SearchIcon className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search VIN, Plate, Make/Model, Owner..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-right">
                        <button
                            className="icon-btn"
                            onClick={fetchVehiclesAndOwners}
                            title="Refresh Fleet"
                        >
                            <RefreshIcon fontSize="small" />
                        </button>

                        <Link to="/owner/history" className="header-action-btn">
                            <HistoryIcon fontSize="small" />
                            <span>VIN Service History</span>
                        </Link>
                    </div>
                </header>

                {/* Main Content */}
                <main className="owner-cars-main">
                    <div className="owner-cars-container">
                        {/* Toast */}
                        {notification && (
                            <div className={`cars-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Page Intro & Owner Selector */}
                        <div className="intro-bar">
                            <div>
                                <h1 className="page-main-title">Owner Vehicles Directory</h1>
                                <p className="page-sub-title">
                                    Browse registered customer vehicles, inspect active work order status, and review complete maintenance histories matched by VIN.
                                </p>
                            </div>

                            <div className="filter-controls-group">
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                    FILTER BY OWNER:
                                </label>
                                <select
                                    className="owner-select-dropdown"
                                    value={selectedOwnerId}
                                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                                >
                                    <option value="all">-- All Customers ({owners.length}) --</option>
                                    {owners.map((o) => (
                                        <option key={o.owner_id} value={o.owner_id}>
                                            {o.name} {o.is_vip ? '★ VIP' : ''} ({o.phone})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Micro-KPI Grid */}
                        <section className="cars-kpi-grid">
                            <div className="cars-kpi-card">
                                <div className="kpi-icon-wrap">
                                    <DirectionsCarIcon />
                                </div>
                                <div className="kpi-info-stack">
                                    <span className="kpi-title">Registered Fleet</span>
                                    <span className="kpi-number font-mono">{totalVehicles}</span>
                                </div>
                            </div>

                            <div className="cars-kpi-card">
                                <div className="kpi-icon-wrap" style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)', backgroundColor: 'rgba(251, 191, 36, 0.1)' }}>
                                    <BuildIcon />
                                </div>
                                <div className="kpi-info-stack">
                                    <span className="kpi-title">In Active Repair</span>
                                    <span className="kpi-number font-mono" style={{ color: '#fbbf24' }}>{inShopVehicles}</span>
                                </div>
                            </div>

                            <div className="cars-kpi-card">
                                <div className="kpi-icon-wrap" style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                    <CheckCircleIcon />
                                </div>
                                <div className="kpi-info-stack">
                                    <span className="kpi-title">Completed Services</span>
                                    <span className="kpi-number font-mono" style={{ color: '#10b981' }}>{totalServices}</span>
                                </div>
                            </div>

                            <div className="cars-kpi-card">
                                <div className="kpi-icon-wrap" style={{ color: '#ffd85f', borderColor: 'rgba(255, 216, 95, 0.3)', backgroundColor: 'rgba(255, 216, 95, 0.1)' }}>
                                    <AttachMoneyIcon />
                                </div>
                                <div className="kpi-info-stack">
                                    <span className="kpi-title">Total Maintenance Spend</span>
                                    <span className="kpi-number font-mono" style={{ color: '#ffd85f' }}>
                                        ${totalFleetSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Vehicles Cards Grid */}
                        <div className="vehicles-grid">
                            {isLoading ? (
                                <div className="empty-vehicles-box">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>Loading garage vehicles...</h3>
                                    <p>Connecting with PostgreSQL & Redis cache to retrieve customer fleet data.</p>
                                </div>
                            ) : filteredVehicles.length === 0 ? (
                                <div className="empty-vehicles-box">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>No Vehicles Found</h3>
                                    <p>No customer vehicles matched your search or owner filter. Try changing your search query or reset the owner filter.</p>
                                    <button
                                        type="button"
                                        className="header-action-btn"
                                        onClick={() => { setSearchTerm(''); setSelectedOwnerId('all'); }}
                                    >
                                        Clear All Filters
                                    </button>
                                </div>
                            ) : (
                                filteredVehicles.map((vehicle) => {
                                    const isPending = vehicle.has_active_order;
                                    const isReady = vehicle.active_status === 'ready';

                                    return (
                                        <article key={vehicle.vehicle_id} className="vehicle-card">
                                            {/* Top Row: Make/Model & Status */}
                                            <div className="v-card-top-row">
                                                <div className="v-title-stack">
                                                    <h3 className="v-make-model">
                                                        {vehicle.year} {vehicle.make} {vehicle.model}
                                                    </h3>
                                                    <span className="v-plate-pill">
                                                        🚗 {vehicle.license_plate}
                                                    </span>
                                                </div>

                                                {isPending ? (
                                                    <span className={`v-status-badge ${isReady ? 'v-status-ready' : 'v-status-in-shop'}`}>
                                                        <span className="v-pulse-dot"></span>
                                                        {isReady ? 'READY FOR PICKUP' : (vehicle.active_status || 'IN SHOP').replace('_', ' ').toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="v-status-badge v-status-completed">
                                                        <CheckCircleIcon fontSize="inherit" />
                                                        READY / COMPLETED
                                                    </span>
                                                )}
                                            </div>

                                            {/* Owner Reference */}
                                            <div className="v-owner-tag font-mono">
                                                <span>👤 Owner: <strong>{vehicle.owner_name}</strong></span>
                                                {vehicle.owner_phone && <span> ({vehicle.owner_phone})</span>}
                                                {vehicle.is_vip && <span style={{ color: '#ffd85f', marginLeft: '6px' }}>★ VIP</span>}
                                            </div>

                                            {/* VIN Code Banner */}
                                            <div className="v-vin-bar">
                                                <span className="v-vin-label">VIN:</span>
                                                <span className="v-vin-code">{vehicle.vin}</span>
                                            </div>

                                            {/* Micro Metrics */}
                                            <div className="v-metrics-row">
                                                <div className="v-metric-item">
                                                    <span className="v-metric-lbl">Services</span>
                                                    <span className="v-metric-val">{vehicle.total_services_count}</span>
                                                </div>
                                                <div className="v-metric-item">
                                                    <span className="v-metric-lbl">Total Spent</span>
                                                    <span className="v-metric-val" style={{ color: '#ffd85f' }}>
                                                        ${vehicle.total_spent.toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="v-metric-item">
                                                    <span className="v-metric-lbl">Last Service</span>
                                                    <span className="v-metric-val" style={{ fontSize: '11px' }}>
                                                        {vehicle.last_service_date || 'New Intake'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="v-card-actions">
                                                <Link
                                                    to={`/owner/history/${encodeURIComponent(vehicle.vin)}`}
                                                    className="btn-history-primary"
                                                >
                                                    <HistoryIcon fontSize="small" />
                                                    <span>View VIN History</span>
                                                </Link>

                                                {vehicle.active_work_order_id && (
                                                    <Link
                                                        to={`/work-orders/${vehicle.active_work_order_id}`}
                                                        className="btn-order-secondary"
                                                        title="Open active repair order"
                                                    >
                                                        <span>{vehicle.active_work_order_id}</span>
                                                        <ArrowForwardIcon fontSize="inherit" />
                                                    </Link>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
