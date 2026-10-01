import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import StyledLoading from '../components/StyledLoading';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import './OwnerCars.css';
import { API_BASE_URL } from '../config/api';

export default function OwnerCars() {
    const { user } = useAuth();
    const { formatCurrency } = useCurrency();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchOwnerVehicles = async () => {
        setIsLoading(true);
        try {
            const ownerId = user?.owner_id;
            const url = ownerId
                ? `${API_BASE_URL}/owner/vehicles?owner_id=${encodeURIComponent(ownerId)}`
                : `${API_BASE_URL}/owner/vehicles`;

            const vehRes = await fetch(url);

            if (vehRes.ok) {
                const vJson = await vehRes.json();
                if (vJson.success && Array.isArray(vJson.data)) {
                    // Strictly isolate to the logged-in owner's vehicles
                    const myVehicles = ownerId
                        ? vJson.data.filter((v) => String(v.owner_id) === String(ownerId))
                        : vJson.data;
                    setVehicles(myVehicles);
                }
            }
        } catch (err) {
            console.error('Error loading owner vehicles:', err);
            showNotification('Failed to fetch vehicle data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOwnerVehicles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.owner_id]);

    // Search filter across Owner Name, License Plate, VIN, and Vehicle details
    const filteredVehicles = vehicles.filter((v) => {
        const q = (searchTerm || '').trim().toLowerCase();
        if (!q) return true;
        const vin = (v.vin || '').toLowerCase();
        const plate = (v.license_plate || '').toLowerCase();
        const owner = (v.owner_name || '').toLowerCase();
        const make = (v.make || '').toLowerCase();
        const model = (v.model || '').toLowerCase();
        const year = String(v.year || '').toLowerCase();
        return (
            plate.includes(q) ||
            vin.includes(q) ||
            owner.includes(q) ||
            make.includes(q) ||
            model.includes(q) ||
            year.includes(q)
        );
    });

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
                            <span>MY GARAGE / VEHICLES</span>
                        </div>
                    </div>

                    {/* Global Vehicle & Owner Search Bar */}
                    <div className="header-search-wrap">
                        <SearchIcon className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by Owner, Plate #, or VIN..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="search-clear-btn"
                                onClick={() => setSearchTerm('')}
                                title="Clear Search"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div className="header-right">
                        <button
                            className="icon-btn"
                            onClick={fetchOwnerVehicles}
                            title="Refresh Vehicles"
                        >
                            <RefreshIcon fontSize="small" />
                        </button>
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

                        {/* Page Intro */}
                        <div className="intro-bar">
                            <div>
                                <h1 className="page-main-title">
                                    {user?.role === 'admin' ? "Workshop Fleet & Owner's Cars" : "My Registered Vehicles"}
                                </h1>
                                <p className="page-sub-title">
                                    Review registered vehicles, live workshop service status, and complete maintenance histories.
                                </p>
                            </div>
                            <div className="intro-meta-box">
                                <span className="vehicles-count-badge font-mono">
                                    Showing {filteredVehicles.length} of {vehicles.length} Vehicles
                                </span>
                            </div>
                        </div>

                        {/* Vehicles Cards Grid */}
                        <div className="vehicles-grid">
                            {isLoading ? (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <StyledLoading
                                        variant="card"
                                        size="md"
                                        message="Loading registered vehicles..."
                                        subtitle="Retrieving vehicle profile, active status & service records"
                                        icon="directions_car"
                                        badge="Owner Garage"
                                    />
                                </div>
                            ) : vehicles.length === 0 ? (
                                <div className="empty-vehicles-box">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>No Registered Vehicles Found</h3>
                                    <p>There are currently no vehicles registered under your owner profile.</p>
                                </div>
                            ) : filteredVehicles.length === 0 ? (
                                <div className="empty-vehicles-box" style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center' }}>
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--accent-yellow)', opacity: 0.6 }} />
                                    <h3 style={{ marginTop: '12px', color: 'var(--text-main)' }}>No matching vehicles found</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                                        No vehicles found matching "{searchTerm}". Try searching by owner name, license plate, or VIN.
                                    </p>
                                    <button
                                        type="button"
                                        className="btn-clear-search-pill"
                                        onClick={() => setSearchTerm('')}
                                        style={{ marginTop: '12px' }}
                                    >
                                        Clear Search Filter
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
                                                    {/* Prominent License Plate Badge */}
                                                    <div className="v-plate-banner">
                                                        <span className="v-plate-icon">🚗</span>
                                                        <span className="v-plate-lbl">PLATE:</span>
                                                        <span className="v-plate-val font-mono">{vehicle.license_plate || 'NO PLATE'}</span>
                                                    </div>
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

                                            {/* Owner & VIN Details Strip */}
                                            <div className="v-identifiers-group">
                                                {vehicle.owner_name && (
                                                    <div className="v-owner-bar">
                                                        <span className="v-id-label">OWNER:</span>
                                                        <span className="v-owner-name font-mono">{vehicle.owner_name}</span>
                                                        {vehicle.is_vip && <span className="vip-star" title="VIP Client">★</span>}
                                                    </div>
                                                )}
                                                <div className="v-vin-bar">
                                                    <span className="v-vin-label">VIN:</span>
                                                    <span className="v-vin-code font-mono">{vehicle.vin}</span>
                                                </div>
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
                                                        {formatCurrency(vehicle.total_spent || 0)}
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
