import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './css/Scheduling.css';

const INITIAL_UNSCHEDULED = [
    {
        id: 'wo-1042',
        code: '#WO-1042',
        title: 'Brake Pad Replacement',
        vehicle: '2019 Honda Civic - John D.',
        duration: '2.0 hrs',
        role: 'Mechanic',
        priority: 'High Priority',
        priorityType: 'error',
    },
    {
        id: 'wo-1045',
        code: '#WO-1045',
        title: 'Full Synthetic Oil Change',
        vehicle: '2021 Toyota RAV4 - Sarah M.',
        duration: '0.5 hrs',
        role: 'Lube Tech',
        priority: 'Standard',
        priorityType: 'pending',
    },
];

export default function Scheduling() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [unscheduledItems, setUnscheduledItems] = useState(INITIAL_UNSCHEDULED);
    const [draggedItem, setDraggedItem] = useState(null);
    const [droppedSlots, setDroppedSlots] = useState({});
    const [dragOverZone, setDragOverZone] = useState(null);

    // Drag and drop event handlers
    const handleDragStart = (item) => {
        setDraggedItem(item);
    };

    const handleDragOver = (e, zoneId) => {
        e.preventDefault();
        setDragOverZone(zoneId);
    };

    const handleDragLeave = () => {
        setDragOverZone(null);
    };

    const handleDrop = (e, zoneId) => {
        e.preventDefault();
        setDragOverZone(null);

        if (draggedItem) {
            setDroppedSlots((prev) => ({
                ...prev,
                [zoneId]: draggedItem,
            }));

            setUnscheduledItems((prev) =>
                prev.filter((item) => item.id !== draggedItem.id)
            );

            setDraggedItem(null);
        }
    };

    return (
        <div className="scheduling-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="scheduling-wrapper">
                {/* Mobile Header Bar */}
                <header className="scheduling-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">Scheduling Terminal</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Main Interactive Workspace Area */}
                <main className="scheduling-main">
                    {/* Unscheduled Orders Panel */}
                    <aside className="unscheduled-sidebar">
                        <div className="unscheduled-card">
                            <div className="unscheduled-header">
                                <div className="title-group">
                                    <span className="material-symbols-outlined text-warning">
                                        pending_actions
                                    </span>
                                    <h3>Unscheduled</h3>
                                </div>
                                <span className="count-pill">{unscheduledItems.length} Items</span>
                            </div>

                            <div className="unscheduled-list">
                                {unscheduledItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="draggable-card"
                                        draggable
                                        onDragStart={() => handleDragStart(item)}
                                    >
                                        <div className="card-top">
                                            <span className="wo-code font-mono">{item.code}</span>
                                            <span className={`priority-badge badge-${item.priorityType}`}>
                                                {item.priority}
                                            </span>
                                        </div>

                                        <h4 className="wo-title">{item.title}</h4>
                                        <p className="wo-vehicle">{item.vehicle}</p>

                                        <div className="card-bottom">
                                            <div className="meta-tag">
                                                <span className="material-symbols-outlined">schedule</span>
                                                <span>{item.duration}</span>
                                            </div>
                                            <div className="meta-tag">
                                                <span className="material-symbols-outlined">build_circle</span>
                                                <span>{item.role}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {unscheduledItems.length === 0 && (
                                    <div className="empty-unscheduled">
                                        <span>All work orders scheduled</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>

                    {/* Calendar Workspace */}
                    <section className="calendar-panel">
                        {/* Calendar Toolbar */}
                        <div className="calendar-toolbar">
                            <div className="toolbar-left">
                                <h2 className="calendar-date-heading">Oct 23 - 29, 2026</h2>
                                <div className="date-nav-group">
                                    <button className="nav-arrow-btn" aria-label="Previous week">
                                        <span className="material-symbols-outlined">chevron_left</span>
                                    </button>
                                    <span className="current-week-label">This Week</span>
                                    <button className="nav-arrow-btn" aria-label="Next week">
                                        <span className="material-symbols-outlined">chevron_right</span>
                                    </button>
                                </div>
                            </div>

                            <div className="toolbar-right">
                                <div className="bay-status-legend">
                                    <span className="legend-item">
                                        <span className="legend-dot dot-success"></span>
                                        <span>Bay Open</span>
                                    </span>
                                    <span className="legend-item">
                                        <span className="legend-dot dot-error"></span>
                                        <span>Bay Full</span>
                                    </span>
                                </div>

                                <button className="primary-btn">
                                    <span className="material-symbols-outlined">add</span>
                                    <span>New Appt</span>
                                </button>
                            </div>
                        </div>

                        {/* Calendar Grid Container */}
                        <div className="calendar-scroll-grid">
                            {/* Days Header */}
                            <div className="grid-header-row">
                                <div className="resource-header-cell">
                                    <span>Resource</span>
                                </div>
                                <div className="days-header-group">
                                    <div className="day-cell">
                                        <span className="day-name">Mon</span>
                                        <span className="day-number">23</span>
                                    </div>
                                    <div className="day-cell active-day">
                                        <span className="day-name">Tue (Today)</span>
                                        <span className="day-number">24</span>
                                    </div>
                                    <div className="day-cell">
                                        <span className="day-name">Wed</span>
                                        <span className="day-number">25</span>
                                    </div>
                                    <div className="day-cell">
                                        <span className="day-name">Thu</span>
                                        <span className="day-number">26</span>
                                    </div>
                                    <div className="day-cell">
                                        <span className="day-name">Fri</span>
                                        <span className="day-number">27</span>
                                    </div>
                                </div>
                            </div>

                            {/* Resource Rows / Bays */}
                            <div className="grid-body">
                                {/* Bay 1 Row */}
                                <div className="bay-row">
                                    <div className="bay-header-cell">
                                        <div className="bay-badge">B1</div>
                                        <span className="bay-label">Heavy Repair</span>
                                        <div className="bay-load-bar">
                                            <div className="load-fill error" style={{ width: '80%' }}></div>
                                        </div>
                                    </div>

                                    <div className="bay-days-group">
                                        {/* Monday Slot */}
                                        <div className="day-drop-zone">
                                            <div className="scheduled-card status-success-border">
                                                <span className="slot-time">#WO-1038 • 08:00-14:00</span>
                                                <h5 className="slot-title">Engine Diagnostics</h5>
                                                <p className="slot-tech">
                                                    <span className="material-symbols-outlined">person</span> Mike R.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tuesday Slot (Today) */}
                                        <div className="day-drop-zone active-day-bg">
                                            <div className="scheduled-card status-yellow-border">
                                                <span className="live-dot animate-pulse"></span>
                                                <span className="slot-time highlight">#WO-1040 • 09:00-17:00</span>
                                                <h5 className="slot-title">Transmission Rebuild</h5>
                                                <p className="slot-tech">
                                                    <span className="material-symbols-outlined">person</span> Dave T.
                                                </p>
                                                <div className="slot-progress">
                                                    <div className="progress-fill" style={{ width: '65%' }}></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Wednesday Slot (Interactive Drop Target 1) */}
                                        <div
                                            className={`day-drop-zone drop-target ${dragOverZone === 'b1-wed' ? 'drag-over' : ''
                                                }`}
                                            onDragOver={(e) => handleDragOver(e, 'b1-wed')}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, 'b1-wed')}
                                        >
                                            {droppedSlots['b1-wed'] ? (
                                                <div className="scheduled-card status-yellow-border animate-fade">
                                                    <span className="slot-time highlight">
                                                        {droppedSlots['b1-wed'].code} • Scheduled
                                                    </span>
                                                    <h5 className="slot-title">{droppedSlots['b1-wed'].title}</h5>
                                                    <p className="slot-tech">
                                                        <span className="material-symbols-outlined">person</span> Assigned
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="hover-add-icon material-symbols-outlined">
                                                    add_circle
                                                </span>
                                            )}
                                        </div>

                                        {/* Thursday Slot (Interactive Drop Target 2) */}
                                        <div
                                            className={`day-drop-zone drop-target ${dragOverZone === 'b1-thu' ? 'drag-over' : ''
                                                }`}
                                            onDragOver={(e) => handleDragOver(e, 'b1-thu')}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, 'b1-thu')}
                                        >
                                            {droppedSlots['b1-thu'] ? (
                                                <div className="scheduled-card status-yellow-border animate-fade">
                                                    <span className="slot-time highlight">
                                                        {droppedSlots['b1-thu'].code} • Scheduled
                                                    </span>
                                                    <h5 className="slot-title">{droppedSlots['b1-thu'].title}</h5>
                                                    <p className="slot-tech">
                                                        <span className="material-symbols-outlined">person</span> Assigned
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="hover-add-icon material-symbols-outlined">
                                                    add_circle
                                                </span>
                                            )}
                                        </div>

                                        {/* Friday Slot */}
                                        <div className="day-drop-zone"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}