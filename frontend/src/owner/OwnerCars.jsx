import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuth } from '../context/AuthContext';
import './OwnerCars.css';

const API_BASE_URL = 'http://localhost:5000/api';

export default function OwnerCars() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [vehicles, setVehicles] = useState([]);
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
                        ? vJson.data.filter((v) => v.owner_id === ownerId)
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
                                <h1 className="page-main-title">My Registered Vehicles</h1>
                                <p className="page-sub-title">
                                    Review your registered vehicles, live workshop service status, and complete maintenance histories.
                                </p>
                            </div>
                        </div>

                        {/* Vehicles Cards Grid */}
                        <div className="vehicles-grid">
                            {isLoading ? (
                                <div className="empty-vehicles-box">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>Loading your vehicles...</h3>
                                    <p>Retrieving your registered vehicle profile and service records.</p>
                                </div>
                            ) : vehicles.length === 0 ? (
                                <div className="empty-vehicles-box">
                                    <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                    <h3>No Registered Vehicles Found</h3>
                                    <p>There are currently no vehicles registered under your owner profile.</p>
                                </div>
                            ) : (
                                vehicles.map((vehicle) => {
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
                                                        ${parseFloat(vehicle.total_spent || 0).toFixed(2)}
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
