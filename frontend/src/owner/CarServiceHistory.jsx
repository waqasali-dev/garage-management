import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryIcon from '@mui/icons-material/History';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PrintIcon from '@mui/icons-material/Print';
import './CarServiceHistory.css';

const API_BASE_URL = 'http://localhost:5000/api';

export default function CarServiceHistory() {
    const { vin: paramVin } = useParams();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [vinInput, setVinInput] = useState(paramVin ? decodeURIComponent(paramVin).toUpperCase() : '');
    const [historyData, setHistoryData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    const fetchHistoryForVin = async (targetVin) => {
        if (!targetVin || !targetVin.trim()) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/vehicles/vin/${encodeURIComponent(targetVin.trim())}/history`);
            if (!res.ok) {
                const errJson = await res.json();
                setErrorMsg(errJson.error || `Vehicle with VIN ${targetVin} was not found.`);
                setHistoryData(null);
                return;
            }
            const json = await res.json();
            if (json.success && json.data) {
                setHistoryData(json.data);
            }
        } catch (err) {
            console.error('Error fetching VIN history:', err);
            setErrorMsg(`Server connection error: ${err.message}`);
            setHistoryData(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (paramVin) {
            const cleanVin = decodeURIComponent(paramVin).toUpperCase();
            setVinInput(cleanVin);
            fetchHistoryForVin(cleanVin);
        } else {
            // If no VIN in route, redirect to owner cars panel
            navigate('/owner/cars', { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramVin]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (vinInput.trim()) {
            navigate(`/owner/history/${encodeURIComponent(vinInput.trim())}`);
            fetchHistoryForVin(vinInput.trim());
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="vin-history-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="vin-history-wrapper">
                {/* Header */}
                <header className="vin-history-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>

                        <Link to="/owner/cars" className="nav-link-btn">
                            <ArrowBackIcon fontSize="small" />
                            <span>Owner's Cars</span>
                        </Link>

                        <div className="header-title-badge">
                            <HistoryIcon fontSize="small" />
                            <span>CAR SERVICE HISTORY</span>
                        </div>

                        {/* Search by VIN Form */}
                        <form onSubmit={handleSearchSubmit} className="vin-search-form">
                            <SearchIcon fontSize="small" style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="LOOKUP ANOTHER VIN..."
                                value={vinInput}
                                onChange={(e) => setVinInput(e.target.value.toUpperCase())}
                            />
                            <button type="submit" className="vin-search-submit-btn">
                                SEARCH
                            </button>
                        </form>
                    </div>

                    <div className="header-right">
                        {historyData && (
                            <button
                                type="button"
                                className="nav-link-btn"
                                onClick={handlePrint}
                                title="Print Service History Report"
                            >
                                <PrintIcon fontSize="small" />
                                <span>Print Report</span>
                            </button>
                        )}

                        <button
                            type="button"
                            className="icon-btn"
                            onClick={() => fetchHistoryForVin(vinInput)}
                            title="Refresh History Data"
                        >
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="vin-history-main">
                    <div className="vin-history-container">
                        {/* Loading State */}
                        {isLoading && (
                            <div className="empty-history-box">
                                <DirectionsCarIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                <h3>Loading Vehicle Service Records...</h3>
                                <p>Querying maintenance records, itemized parts, labor hours, and inspection photos for VIN {vinInput}.</p>
                            </div>
                        )}

                        {/* Error / Not Found State */}
                        {!isLoading && errorMsg && (
                            <div className="empty-history-box" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                                <DirectionsCarIcon style={{ fontSize: '48px', color: '#ef4444' }} />
                                <h3 style={{ color: '#fca5a5' }}>Vehicle Records Not Found</h3>
                                <p>{errorMsg}</p>
                                <Link to="/owner/cars" className="nav-link-btn" style={{ marginTop: '8px' }}>
                                    ← Return to Owner's Cars
                                </Link>
                            </div>
                        )}

                        {/* Vehicle History Presentation (Only Selected Car) */}
                        {!isLoading && historyData && (
                            <>
                                {/* Hero Vehicle Profile Card */}
                                <section className="vehicle-hero-card">
                                    <div className="hero-top-row">
                                        <div className="hero-title-group">
                                            <h1 className="hero-main-title">
                                                {historyData.vehicle.year} {historyData.vehicle.make} {historyData.vehicle.model}
                                            </h1>
                                            <div className="hero-meta-pills">
                                                <span className="hero-vin-badge">
                                                    VIN: {historyData.vehicle.vin}
                                                </span>
                                                <span className="hero-plate-badge">
                                                    🚗 {historyData.vehicle.license_plate}
                                                </span>
                                                <span className="hero-plate-badge">
                                                    ID: {historyData.vehicle.vehicle_id}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="hero-owner-box">
                                            <span className="owner-title">REGISTERED OWNER</span>
                                            <span className="owner-name-val">
                                                {historyData.vehicle.owner_name} {historyData.vehicle.is_vip ? '★ VIP' : ''}
                                            </span>
                                            <span className="owner-contact-sub">
                                                📞 {historyData.vehicle.owner_phone || '--'}
                                            </span>
                                            <span className="owner-contact-sub">
                                                ✉️ {historyData.vehicle.owner_email || '--'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* High-Level Stats Bar */}
                                    <div className="hero-stats-grid">
                                        <div className="hero-stat-item">
                                            <span className="hero-stat-lbl">Total Service Visits</span>
                                            <span className="hero-stat-val font-mono">{historyData.totalVisits}</span>
                                        </div>
                                        <div className="hero-stat-item">
                                            <span className="hero-stat-lbl">Lifetime Maintenance Spend</span>
                                            <span className="hero-stat-val font-mono" style={{ color: 'var(--accent-yellow)' }}>
                                                ${historyData.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="hero-stat-item">
                                            <span className="hero-stat-lbl">Total Parts Replaced</span>
                                            <span className="hero-stat-val font-mono">{historyData.totalPartsReplaced}</span>
                                        </div>
                                        <div className="hero-stat-item">
                                            <span className="hero-stat-lbl">Current Garage Status</span>
                                            <span className="hero-stat-val font-mono" style={{ color: historyData.hasActiveOrder ? '#fbbf24' : '#10b981', fontSize: '15px' }}>
                                                {historyData.hasActiveOrder ? `IN REPAIR (${historyData.activeStatus.toUpperCase()})` : 'ALL JOBS COMPLETE'}
                                            </span>
                                        </div>
                                    </div>
                                </section>

                                {/* Chronological Service Timeline Section */}
                                <section className="timeline-section">
                                    <div className="timeline-section-title">
                                        <h2>Chronological Maintenance & Repair Timeline</h2>
                                        <span className="events-count-tag">
                                            {historyData.workOrders.length} {historyData.workOrders.length === 1 ? 'Service Event' : 'Service Events'}
                                        </span>
                                    </div>

                                    {historyData.workOrders.length === 0 ? (
                                        <div className="empty-history-box">
                                            <CalendarMonthIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                            <h3>No Work Orders Recorded Yet</h3>
                                            <p>This vehicle is registered in the precision fleet system, but has not completed any maintenance orders yet.</p>
                                        </div>
                                    ) : (
                                        <div className="timeline-cards-list">
                                            {historyData.workOrders.map((wo) => {
                                                const dateStr = wo.created_at
                                                    ? new Date(wo.created_at).toLocaleDateString('en-US', {
                                                          month: 'long',
                                                          day: 'numeric',
                                                          year: 'numeric',
                                                      })
                                                    : 'Recorded Intake';

                                                return (
                                                    <article key={wo.work_order_id} className="timeline-card">
                                                        <div className="timeline-marker-dot"></div>

                                                        {/* Header: WO #, Date, Status */}
                                                        <div className="t-card-header">
                                                            <div className="t-header-title-group">
                                                                <Link
                                                                    to={`/work-orders/${wo.work_order_id}`}
                                                                    className="t-wo-id font-mono"
                                                                    title="View Work Order details"
                                                                >
                                                                    {wo.work_order_id}
                                                                </Link>
                                                                <span className="t-date-tag">📅 {dateStr}</span>
                                                                {wo.bay_assigned && (
                                                                    <span className="hero-plate-badge" style={{ fontSize: '10px' }}>
                                                                        📍 {wo.bay_assigned}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <span className={`t-status-pill status-${wo.status === 'in_progress' ? 'in-progress' : wo.status === 'ready' ? 'ready' : wo.status === 'completed' ? 'completed' : 'received'}`}>
                                                                {(wo.status || 'RECEIVED').replace('_', ' ')}
                                                            </span>
                                                        </div>

                                                        {/* Customer Observations / Diagnostics Notes */}
                                                        {wo.notes && (
                                                            <div className="t-complaint-box">
                                                                <span className="t-complaint-lbl">CUSTOMER CONCERN / OBSERVATIONS:</span>
                                                                <p className="t-complaint-txt">{wo.notes}</p>
                                                            </div>
                                                        )}

                                                        {/* Itemized Parts & Labor Table */}
                                                        {wo.items && wo.items.length > 0 && (
                                                            <div className="t-items-table-wrap">
                                                                <table className="t-items-table font-mono">
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={{ width: '80px' }}>Type</th>
                                                                            <th>Description / Part</th>
                                                                            <th style={{ width: '90px' }}>Qty / Hrs</th>
                                                                            <th style={{ width: '100px' }}>Rate</th>
                                                                            <th style={{ width: '110px', textAlign: 'right' }}>Total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {wo.items.map((item) => (
                                                                            <tr key={item.item_id}>
                                                                                <td>
                                                                                    <span className={`t-item-type-tag ${item.item_type === 'part' ? 'tag-part' : 'tag-labor'}`}>
                                                                                        {item.item_type}
                                                                                    </span>
                                                                                </td>
                                                                                <td>
                                                                                    {item.item_type === 'part'
                                                                                        ? `${item.part_name || item.description || 'Replacement Part'} (${item.sku || 'N/A'})`
                                                                                        : (item.description || 'Mechanic Labor Service')}
                                                                                </td>
                                                                                <td>{parseFloat(item.quantity || 1).toFixed(item.item_type === 'part' ? 0 : 1)}</td>
                                                                                <td>${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                                                                                <td style={{ textAlign: 'right', fontWeight: '700' }}>
                                                                                    ${parseFloat(item.total_price || 0).toFixed(2)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {/* Attached Photos if available */}
                                                        {wo.media && wo.media.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                {wo.media.map((m) => (
                                                                    <img
                                                                        key={m.media_id}
                                                                        src={m.file_url}
                                                                        alt="Service inspection"
                                                                        style={{ width: '90px', height: '65px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-glass)' }}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Footer: Tech & Total Billing Cost */}
                                                        <div className="t-card-footer">
                                                            <div className="t-footer-tech">
                                                                <span>Lead Technician: <strong>{wo.assigned_staff_name || 'Assigned Lead Mechanic'}</strong></span>
                                                                {wo.service_advisor_name && <span> • Advisor: {wo.service_advisor_name}</span>}
                                                            </div>

                                                            <div className="t-cost-total">
                                                                <span>TOTAL SERVICE INVOICE: </span>
                                                                <span>${parseFloat(wo.total_cost || wo.estimated_cost || 0).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
