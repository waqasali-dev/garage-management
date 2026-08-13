import React, { useState } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GppBadIcon from '@mui/icons-material/GppBad';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SettingsIcon from '@mui/icons-material/Settings';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import MenuIcon from '@mui/icons-material/Menu';
import './css/AuditLog.css';

const LOG_EVENTS = [
    {
        id: 1,
        type: 'critical',
        actor: 'System automated',
        action: 'triggered',
        badge: 'Auth Failure',
        badgeType: 'error',
        description: 'Multiple failed login attempts detected for IP 192.168.1.42.',
        payload: '{ "event": "AUTH_REJECT", "target": "admin_portal", "count": 5 }',
        time: '10:42:05 AM',
        date: 'Today',
    },
    {
        id: 2,
        type: 'status_change',
        actor: 'Mike R.',
        action: 'updated status on',
        targetId: 'WO-2042',
        fromStatus: 'In Progress',
        toStatus: 'Quality Check',
        time: '09:15:22 AM',
        date: 'Today',
    },
    {
        id: 3,
        type: 'inventory',
        actor: 'Sarah J.',
        action: 'allocated part to',
        targetId: 'WO-2045',
        description: 'Allocated 1x Brake Pad Set (SKU: BP-9002).',
        partName: 'Brake Pad Set - Ceramic',
        partStock: 'Stock Level: Low (4)',
        time: '08:40:10 AM',
        date: 'Today',
    },
    {
        id: 4,
        type: 'creation',
        actor: 'System API',
        action: 'created new entity',
        targetId: 'INV-8890',
        description: 'Invoice generated automatically upon WO-2030 completion.',
        time: '05:22:01 PM',
        date: 'Yesterday',
    },
];

export default function AuditLog() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [timeRange, setTimeRange] = useState('24H');

    const filteredEvents = LOG_EVENTS.filter((event) => {
        const search = searchTerm.toLowerCase();
        return (
            event.actor.toLowerCase().includes(search) ||
            (event.targetId && event.targetId.toLowerCase().includes(search)) ||
            (event.description && event.description.toLowerCase().includes(search)) ||
            (event.badge && event.badge.toLowerCase().includes(search))
        );
    });

    return (
        <div className="audit-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="audit-wrapper">
                {/* Desktop Header */}
                <header className="audit-header hide-mobile">
                    <div className="header-search">
                        <SearchIcon className="search-icon" fontSize="small" />
                        <input
                            type="text"
                            placeholder="Search event stream..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Notifications">
                            <NotificationsIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Mobile Header */}
                <header className="audit-header-mobile">
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setIsSidebarOpen(true)}
                        aria-label="Open Navigation Menu"
                    >
                        <MenuIcon fontSize="small" />
                    </button>
                    <h1 className="mobile-title">Precision Garage</h1>
                    <div className="user-avatar">
                        <span className="avatar-initials">PG</span>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="audit-main">
                    <div className="content-container">
                        {/* Header Title & Filter Actions */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Audit Log</h2>
                                <p className="page-subtitle">
                                    System event stream and entity state transitions.
                                </p>
                            </div>

                            <div className="filter-actions">
                                <div className="time-range-group">
                                    {['1H', '24H', '7D', 'ALL'].map((range) => (
                                        <button
                                            key={range}
                                            type="button"
                                            className={`time-btn ${timeRange === range ? 'active' : ''}`}
                                            onClick={() => setTimeRange(range)}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>

                                <button type="button" className="action-btn">
                                    <FilterListIcon fontSize="small" />
                                    <span>Filter Events</span>
                                </button>

                                <button type="button" className="action-btn outline">
                                    <DownloadIcon fontSize="small" />
                                    <span>Export</span>
                                </button>
                            </div>
                        </div>

                        {/* KPI Stats Bento Row */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <span className="kpi-title font-mono">EVENTS (24H)</span>
                                <span className="kpi-value">1,248</span>
                                <div className="kpi-trend text-success">
                                    <TrendingUpIcon fontSize="small" />
                                    <span>12% vs yesterday</span>
                                </div>
                            </div>

                            <div className="kpi-card error-glow">
                                <span className="kpi-title font-mono">CRITICAL ALERTS</span>
                                <span className="kpi-value text-error">3</span>
                                <span className="kpi-subtext">Requires immediate review</span>
                            </div>

                            <div className="kpi-card">
                                <span className="kpi-title font-mono">TOP ACTORS</span>
                                <div className="actors-stack">
                                    <div className="actor-circle">MV</div>
                                    <div className="actor-circle">SJ</div>
                                    <div className="actor-circle highlight">+4</div>
                                </div>
                            </div>
                        </div>

                        {/* Event Stream Timeline */}
                        <div className="stream-card">
                            <div className="stream-header">
                                <h3>Event Stream</h3>
                                <div className="live-status">
                                    <span className="pulse-dot"></span>
                                    <span>Live Connection active</span>
                                </div>
                            </div>

                            <div className="timeline-container">
                                {filteredEvents.map((event) => (
                                    <div key={event.id} className="timeline-item">
                                        {/* Icon Column */}
                                        <div className={`timeline-icon-box type-${event.type}`}>
                                            {event.type === 'critical' && <GppBadIcon fontSize="small" />}
                                            {event.type === 'status_change' && (
                                                <span className="icon-text">MR</span>
                                            )}
                                            {event.type === 'inventory' && <Inventory2Icon fontSize="small" />}
                                            {event.type === 'creation' && <AddCircleIcon fontSize="small" />}
                                        </div>

                                        {/* Event Content Column */}
                                        <div className="timeline-content">
                                            <div className="content-left">
                                                <div className="event-title-line">
                                                    <span className="actor-name">{event.actor}</span>
                                                    <span className="action-text">{event.action}</span>
                                                    {event.targetId && (
                                                        <span className="target-id font-mono">{event.targetId}</span>
                                                    )}
                                                    {event.badge && (
                                                        <span className="badge badge-error">{event.badge}</span>
                                                    )}
                                                </div>

                                                {event.description && (
                                                    <p className="event-desc">{event.description}</p>
                                                )}

                                                {event.type === 'status_change' && (
                                                    <div className="status-transition">
                                                        <span>Status changed from</span>
                                                        <span className="pill pill-warning">{event.fromStatus}</span>
                                                        <ArrowForwardIcon className="arrow-icon" />
                                                        <span className="pill pill-success">{event.toStatus}</span>
                                                    </div>
                                                )}

                                                {event.payload && (
                                                    <pre className="code-block font-mono">
                                                        <code>{event.payload}</code>
                                                    </pre>
                                                )}

                                                {event.type === 'inventory' && (
                                                    <div className="part-detail-box">
                                                        <div className="part-icon">
                                                            <SettingsIcon fontSize="small" />
                                                        </div>
                                                        <div>
                                                            <div className="part-name">{event.partName}</div>
                                                            <div className="part-stock font-mono">{event.partStock}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="content-right font-mono">
                                                <span className="time-text">{event.time}</span>
                                                <span className="date-text">{event.date}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="stream-footer">
                                <button type="button" className="load-more-btn">
                                    Load More Events
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}