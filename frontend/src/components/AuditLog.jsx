import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GppBadIcon from '@mui/icons-material/GppBad';
// import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Inventory2Icon from '@mui/icons-material/Inventory2';
// import SettingsIcon from '@mui/icons-material/Settings';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import './css/AuditLog.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'
const PAGE_LIMIT = 10;

export default function AuditLog() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [timeRange, setTimeRange] = useState('ALL');
    const [eventTypeFilter, setEventTypeFilter] = useState('all');
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

    // Live state
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [stats, setStats] = useState({ events24h: 0, criticalAlerts: 0, topActors: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const fetchLogs = useCallback(
        async (currentOffset = 0, append = false) => {
            if (append) setIsLoadingMore(true);
            else setIsLoading(true);

            try {
                const params = new URLSearchParams({
                    limit: PAGE_LIMIT,
                    offset: currentOffset,
                    range: timeRange,
                    event_type: eventTypeFilter,
                    search: searchTerm.trim(),
                });

                const res = await fetch(`${API_BASE_URL}/audit-logs?${params.toString()}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json.success) {
                        if (append) {
                            setLogs((prev) => [...prev, ...(json.data || [])]);
                        } else {
                            setLogs(json.data || []);
                        }
                        setTotal(json.total || 0);
                        setHasMore(Boolean(json.hasMore));
                        setOffset(currentOffset);
                        if (json.stats) setStats(json.stats);
                    }
                }
            } catch (err) {
                console.error('Error fetching audit logs:', err);
            } finally {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        },
        [timeRange, eventTypeFilter, searchTerm]
    );

    // Initial load and filter change
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs(0, false);
        }, 200);
        return () => clearTimeout(timer);
    }, [fetchLogs]);

    // Load More Handler
    const handleLoadMore = () => {
        if (!hasMore || isLoadingMore) return;
        const nextOffset = offset + PAGE_LIMIT;
        fetchLogs(nextOffset, true);
    };

    // Export Logs Handler
    const handleExportLogs = () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', `audit_logs_export_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    return (
        <div className="audit-layout">
            {/* Sidebar Component */}
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
                            placeholder="Search event stream, action, or work order ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="search-clear-btn"
                                onClick={() => setSearchTerm('')}
                            >
                                <CloseIcon fontSize="inherit" />
                            </button>
                        )}
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={() => fetchLogs(0, false)} title="Refresh Stream">
                            <RefreshIcon fontSize="small" />
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
                    <h1 className="mobile-title">Audit Log</h1>
                    <div className="header-actions">
                        <button className="icon-btn" onClick={() => fetchLogs(0, false)}>
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="audit-main">
                    <div className="content-container">
                        {/* Header Title & Filter Actions */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Audit Trail & Event Stream</h2>
                                <p className="page-subtitle">
                                    Real-time tracking of work order state transitions, inventory allocations, and system events.
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

                                <div className="filter-dropdown-wrap">
                                    <button
                                        type="button"
                                        className={`action-btn ${eventTypeFilter !== 'all' ? 'active-filter' : ''}`}
                                        onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                                    >
                                        <FilterListIcon fontSize="small" />
                                        <span>
                                            {eventTypeFilter === 'all'
                                                ? 'Filter Events'
                                                : eventTypeFilter.toUpperCase()}
                                        </span>
                                    </button>

                                    {isFilterDropdownOpen && (
                                        <div className="audit-filter-menu">
                                            <button
                                                type="button"
                                                className={eventTypeFilter === 'all' ? 'active' : ''}
                                                onClick={() => {
                                                    setEventTypeFilter('all');
                                                    setIsFilterDropdownOpen(false);
                                                }}
                                            >
                                                All Events
                                            </button>
                                            <button
                                                type="button"
                                                className={eventTypeFilter === 'status_change' ? 'active' : ''}
                                                onClick={() => {
                                                    setEventTypeFilter('status_change');
                                                    setIsFilterDropdownOpen(false);
                                                }}
                                            >
                                                Status Transitions
                                            </button>
                                            <button
                                                type="button"
                                                className={eventTypeFilter === 'inventory' ? 'active' : ''}
                                                onClick={() => {
                                                    setEventTypeFilter('inventory');
                                                    setIsFilterDropdownOpen(false);
                                                }}
                                            >
                                                Inventory Allocations
                                            </button>
                                            <button
                                                type="button"
                                                className={eventTypeFilter === 'critical' ? 'active' : ''}
                                                onClick={() => {
                                                    setEventTypeFilter('critical');
                                                    setIsFilterDropdownOpen(false);
                                                }}
                                            >
                                                Critical & Auth Failures
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    className="action-btn outline"
                                    onClick={handleExportLogs}
                                    title="Download event stream JSON"
                                >
                                    <DownloadIcon fontSize="small" />
                                    <span>Export</span>
                                </button>
                            </div>
                        </div>

                        {/* KPI Stats Bento Row */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <span className="kpi-title font-mono">EVENTS (24H)</span>
                                <span className="kpi-value font-mono">
                                    {stats.events24h.toLocaleString()}
                                </span>
                                <div className="kpi-trend text-success">
                                    <TrendingUpIcon fontSize="small" />
                                    <span>Live stream continuous</span>
                                </div>
                            </div>

                            <div className="kpi-card error-glow">
                                <span className="kpi-title font-mono">CRITICAL ALERTS</span>
                                <span className="kpi-value text-error font-mono">
                                    {stats.criticalAlerts}
                                </span>
                                <span className="kpi-subtext">
                                    {stats.criticalAlerts > 0 ? 'Requires immediate review' : 'No critical alerts'}
                                </span>
                            </div>

                            <div className="kpi-card">
                                <span className="kpi-title font-mono">ACTIVE OPERATORS</span>
                                <div className="actors-stack">
                                    {stats.topActors.length === 0 ? (
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Automated System</span>
                                    ) : (
                                        stats.topActors.map((actor, idx) => (
                                            <div
                                                key={idx}
                                                className="actor-circle"
                                                title={`${actor.name} (${actor.count} events)`}
                                            >
                                                {actor.initials}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Event Stream Timeline */}
                        <div className="stream-card">
                            <div className="stream-header">
                                <div>
                                    <h3>Event Stream ({total} Total Logs)</h3>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                        Showing {logs.length} of {total} recorded events
                                    </p>
                                </div>
                                <div className="live-status">
                                    <span className="pulse-dot"></span>
                                    <span>Live Event Stream</span>
                                </div>
                            </div>

                            <div className="timeline-container">
                                {isLoading && logs.length === 0 ? (
                                    <div className="empty-stream-box">
                                        Loading audit activity trail...
                                    </div>
                                ) : logs.length === 0 ? (
                                    <div className="empty-stream-box">
                                        No audit events found matching the filter criteria.
                                    </div>
                                ) : (
                                    logs.map((event) => (
                                        <div key={event.id} className="timeline-item">
                                            {/* Icon Column */}
                                            <div className={`timeline-icon-box type-${event.type}`}>
                                                {event.type === 'critical' && <GppBadIcon fontSize="small" />}
                                                {event.type === 'status_change' && (
                                                    <span className="icon-text">{event.initials}</span>
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
                                                            <span className={`badge badge-${event.badgeType}`}>
                                                                {event.badge}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {event.description && (
                                                        <p className="event-desc">{event.description}</p>
                                                    )}

                                                    {event.payload && (
                                                        <pre className="code-block font-mono">
                                                            <code>{event.payload}</code>
                                                        </pre>
                                                    )}
                                                </div>

                                                <div className="content-right font-mono">
                                                    <span className="time-text">{event.time}</span>
                                                    <span className="date-text">{event.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Load More Button */}
                            <div className="stream-footer">
                                {hasMore ? (
                                    <button
                                        type="button"
                                        className="load-more-btn"
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                    >
                                        {isLoadingMore ? 'Loading Next Batch...' : `Load More Events (${total - logs.length} remaining)`}
                                    </button>
                                ) : (
                                    logs.length > 0 && (
                                        <span className="end-stream-text font-mono">
                                            ✓ Reached beginning of event stream ({logs.length} events loaded)
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}