import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import StarIcon from '@mui/icons-material/Star';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import './css/OwnerDetail.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

export default function OwnerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [owner, setOwner] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchOwnerDetails = async () => {
        setIsLoading(true);
        try {
            const cleanId = id ? id.replace('#', '') : '';
            const res = await fetch(`${API_BASE_URL}/owners/${cleanId}`);
            if (!res.ok) {
                showNotification('Car owner not found', 'error');
                return;
            }
            const json = await res.json();
            if (json.success && json.data) {
                setOwner(json.data);
            }
        } catch (err) {
            console.error('Error fetching owner details:', err);
            showNotification(`Server error: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            fetchOwnerDetails();
        }
    }, [id]);

    if (isLoading) {
        return (
            <div className="owner-detail-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="owner-detail-wrapper loading-center">
                    <span className="material-symbols-outlined spinning-icon" style={{ fontSize: '48px', color: 'var(--accent-yellow)' }}>
                        group
                    </span>
                    <p style={{ fontFamily: 'JetBrains Mono', marginTop: '14px', color: 'var(--text-muted)' }}>
                        Loading Client profile and vehicle history...
                    </p>
                </div>
            </div>
        );
    }

    if (!owner) {
        return (
            <div className="owner-detail-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="owner-detail-wrapper loading-center">
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>Client profile not found.</p>
                    <button className="primary-btn" onClick={() => navigate('/owners')}>
                        Back to Owners Directory
                    </button>
                </div>
            </div>
        );
    }

    const vehicles = owner.vehicles || [];
    const workOrders = owner.workOrders || [];

    return (
        <div className="owner-detail-layout">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Area */}
            <div className="owner-detail-wrapper">
                {/* Header */}
                <header className="detail-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>
                        <h2 className="header-title">Client & Vehicle Portfolio</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={fetchOwnerDetails} title="Refresh Live Data">
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="detail-main">
                    <div className="content-container">
                        {/* Toast Alert */}
                        {notification && (
                            <div className={`owner-detail-toast toast-${notification.type}`}>
                                <span>{notification.msg}</span>
                            </div>
                        )}

                        {/* Context Navigation Bar */}
                        <div className="desktop-context-bar">
                            <Link to="/owners" className="back-link">
                                <ArrowBackIcon fontSize="small" />
                                <span>Back to Owners Directory</span>
                            </Link>

                            <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                                <AddIcon fontSize="small" />
                                <span>New Vehicle Intake</span>
                            </Link>
                        </div>

                        {/* Profile Hero Panel */}
                        <section className="profile-card">
                            <div className="profile-avatar-box">
                                <span className="avatar-initials">{owner.initials}</span>
                                {owner.is_vip && <span className="vip-badge-dot" title="VIP Status">★</span>}
                            </div>

                            <div className="profile-info-stack">
                                <div className="profile-title-row">
                                    <div>
                                        <div className="client-id-tag font-mono">{owner.owner_id}</div>
                                        <h2 className="client-name">
                                            {owner.full_name} {owner.is_vip && <StarIcon className="vip-gold-star" fontSize="inherit" />}
                                        </h2>
                                        <p className="client-meta">
                                            <span className="badge-tier">{owner.tier}</span>
                                            <span>• Member Since {owner.joinedDate}</span>
                                            {owner.has_user_account ? (
                                                <span className="account-tag tag-active">Portal Account Active</span>
                                            ) : (
                                                <span className="account-tag tag-none">No Portal Login</span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="contact-details-grid">
                                    <div className="contact-detail-item">
                                        <div className="icon-box">
                                            <PhoneIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="item-label">PHONE:</span>
                                            <span className="item-value font-mono">{owner.phone_number || 'None'}</span>
                                        </div>
                                    </div>

                                    <div className="contact-detail-item">
                                        <div className="icon-box">
                                            <EmailIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="item-label">EMAIL ADDRESS:</span>
                                            <span className="item-value font-mono">{owner.email_address || 'None'}</span>
                                        </div>
                                    </div>

                                    <div className="contact-detail-item grid-span-2">
                                        <div className="icon-box">
                                            <LocationOnIcon fontSize="small" />
                                        </div>
                                        <div className="contact-text-stack">
                                            <span className="item-label">BILLING ADDRESS:</span>
                                            <span className="item-value">{owner.billing_address || 'No billing address on file'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Summary Metric */}
                            <div className="profile-lifetime-box">
                                <span className="lifetime-label">LIFETIME SERVICE SPENT</span>
                                <span className="lifetime-value font-mono text-yellow">{owner.lifetimeValue}</span>
                                <span className="lifetime-sub">Across {workOrders.length} service orders</span>
                            </div>
                        </section>

                        {/* Two Columns: Registered Vehicles & Work Orders History */}
                        <div className="owner-sub-grid">
                            {/* Left Column: Registered Vehicles */}
                            <div className="owner-sub-col">
                                <div className="section-card">
                                    <div className="section-header">
                                        <div className="section-title-wrap">
                                            <DirectionsCarIcon className="section-icon" />
                                            <h3>Registered Vehicles ({vehicles.length})</h3>
                                        </div>
                                        <Link to="/intake" className="small-action-link">
                                            + Intake New Vehicle
                                        </Link>
                                    </div>

                                    <div className="vehicles-list">
                                        {vehicles.length === 0 ? (
                                            <div className="empty-sub-state">
                                                <DirectionsCarIcon style={{ fontSize: '36px', opacity: 0.4 }} />
                                                <p>No vehicles registered yet for this client.</p>
                                            </div>
                                        ) : (
                                            vehicles.map((v) => (
                                                <div key={v.vehicle_id} className="vehicle-item-card">
                                                    <div className="vehicle-card-top">
                                                        <span className="vehicle-name-bold">
                                                            {v.year} {v.make} {v.model}
                                                        </span>
                                                        <span className="vehicle-plate-pill font-mono">
                                                            {v.license_plate}
                                                        </span>
                                                    </div>
                                                    <div className="vehicle-vin-sub font-mono">
                                                        VIN: {v.vin}
                                                    </div>
                                                    <div className="vehicle-card-footer">
                                                        <span className="vehicle-id-sub font-mono">{v.vehicle_id}</span>
                                                        <button
                                                            type="button"
                                                            className="quick-wo-btn"
                                                            onClick={() => navigate('/intake')}
                                                        >
                                                            <span>Start Intake</span>
                                                            <AddIcon fontSize="inherit" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Work Orders & Service History */}
                            <div className="owner-sub-col">
                                <div className="section-card">
                                    <div className="section-header">
                                        <div className="section-title-wrap">
                                            <BuildIcon className="section-icon" />
                                            <h3>Work Order History ({workOrders.length})</h3>
                                        </div>
                                    </div>

                                    <div className="orders-list">
                                        {workOrders.length === 0 ? (
                                            <div className="empty-sub-state">
                                                <BuildIcon style={{ fontSize: '36px', opacity: 0.4 }} />
                                                <p>No repair orders recorded for this customer.</p>
                                            </div>
                                        ) : (
                                            workOrders.map((wo) => {
                                                const dateFormatted = wo.created_at
                                                    ? new Date(wo.created_at).toLocaleDateString('en-US', {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          year: 'numeric',
                                                      })
                                                    : '--';

                                                return (
                                                    <div
                                                        key={wo.work_order_id}
                                                        className="owner-wo-item"
                                                        onClick={() => navigate(`/work-orders/${wo.work_order_id}`)}
                                                    >
                                                        <div className="wo-item-left">
                                                            <span className="wo-item-id font-mono">{wo.work_order_id}</span>
                                                            <span className="wo-item-vehicle">
                                                                {wo.year} {wo.make} {wo.model} ({wo.license_plate})
                                                            </span>
                                                            <span className="wo-item-date font-mono">{dateFormatted}</span>
                                                        </div>

                                                        <div className="wo-item-right">
                                                            <span className={`status-pill pill-${wo.status}`}>
                                                                {wo.status.replace('_', ' ').toUpperCase()}
                                                            </span>
                                                            <span className="wo-item-cost font-mono text-yellow">
                                                                ${parseFloat(wo.total_cost || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}