import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import './css/Scheduling.css';
import { API_BASE_URL } from '../config/api';
// Local API URL fallback: 'http://localhost:5000/api'

const BAYS = [
    { id: 'B1', name: 'B1', label: 'Heavy Repair', loadPercent: '80%', loadType: 'error' },
    { id: 'B2', name: 'B2', label: 'Diagnostics & Elect.', loadPercent: '50%', loadType: 'success' },
    { id: 'B3', name: 'B3', label: 'Express Lube & Tires', loadPercent: '25%', loadType: 'success' },
];

const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Low Priority', colorClass: 'badge-success' },
    { value: 'standard', label: 'Standard', colorClass: 'badge-pending' },
    { value: 'high', label: 'High Priority', colorClass: 'badge-error' },
    { value: 'urgent', label: 'Urgent Priority', colorClass: 'badge-urgent' },
];

// Helper to format local date YYYY-MM-DD
const getLocalDateString = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// Helper to get complete 7 week days starting from Monday
const getWeekDays = (baseDate) => {
    const curr = new Date(baseDate);
    const day = curr.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday to get Monday
    const monday = new Date(curr.setDate(diff));

    const days = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = getLocalDateString(d);

        days.push({
            name: dayNames[i],
            dateNumber: d.getDate(),
            fullDate: dateStr,
            monthName: d.toLocaleString('en-US', { month: 'short' }),
            rawDate: d,
        });
    }
    return days;
};

export default function Scheduling() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const weekDays = getWeekDays(currentDate);

    // Automatically select today's local date
    const todayStr = getLocalDateString(new Date());
    const [selectedDate, setSelectedDate] = useState(todayStr);

    const [sidebarTab, setSidebarTab] = useState('selected_day'); // 'selected_day' | 'unscheduled'
    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [unscheduledWorkOrders, setUnscheduledWorkOrders] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [workOrdersList, setWorkOrdersList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // Modal state for Add Task
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskForm, setTaskForm] = useState({
        task_title: '',
        task_description: '',
        priority: 'standard',
        bay_assigned: 'B1',
        scheduled_date: todayStr,
        start_time: '09:00',
        end_time: '11:00',
        duration_hours: '2.0',
        assigned_staff_id: '',
        vehicle_id: '',
        work_order_id: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Fetch Tasks, Staff, and Work Orders
    const fetchSchedules = async () => {
        setIsLoading(true);
        try {
            const [schedRes, staffRes, woRes] = await Promise.all([
                fetch(`${API_BASE_URL}/schedules`),
                fetch(`${API_BASE_URL}/staff/list`),
                fetch(`${API_BASE_URL}/work-orders`),
            ]);

            if (schedRes.ok) {
                const schedJson = await schedRes.json();
                if (schedJson.success && Array.isArray(schedJson.data)) {
                    setScheduledTasks(schedJson.data);
                }
            }

            if (staffRes.ok) {
                const staffJson = await staffRes.json();
                if (staffJson.success) setStaffList(staffJson.data || []);
            }

            if (woRes.ok) {
                const woJson = await woRes.json();
                if (woJson.success && Array.isArray(woJson.data)) {
                    setWorkOrdersList(woJson.data);
                    // Filter unscheduled work orders
                    const unscheduled = woJson.data.filter(
                        (wo) => !wo.scheduled_start && wo.status !== 'completed' && wo.status !== 'cancelled'
                    );
                    setUnscheduledWorkOrders(unscheduled);
                }
            }
        } catch (err) {
            console.error('Error fetching schedules:', err);
            showNotification(`Notice: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedules();
    }, []);

    // Update form date when selectedDate changes
    useEffect(() => {
        setTaskForm((prev) => ({ ...prev, scheduled_date: selectedDate }));
    }, [selectedDate]);

    // Week Navigation
    const handlePrevWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
        const prevDays = getWeekDays(d);
        const hasToday = prevDays.some((p) => p.fullDate === todayStr);
        setSelectedDate(hasToday ? todayStr : prevDays[0].fullDate);
    };

    const handleNextWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
        const nextDays = getWeekDays(d);
        const hasToday = nextDays.some((n) => n.fullDate === todayStr);
        setSelectedDate(hasToday ? todayStr : nextDays[0].fullDate);
    };

    const handleThisWeek = () => {
        const now = new Date();
        setCurrentDate(now);
        setSelectedDate(todayStr);
    };

    // Handle Task Form Change
    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setTaskForm((prev) => {
            const updated = { ...prev, [name]: value };

            // When work order is chosen, auto-fill vehicle
            if (name === 'work_order_id' && value) {
                const matchedWO = workOrdersList.find((w) => w.work_order_id === value);
                if (matchedWO) {
                    updated.vehicle_id = matchedWO.vehicle_id || '';
                    if (!updated.task_title) {
                        updated.task_title = `WO ${matchedWO.work_order_id} - ${matchedWO.make} ${matchedWO.model}`;
                    }
                }
            }
            return updated;
        });
    };

    // Submit New Task
    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!taskForm.task_title.trim() || !taskForm.scheduled_date) {
            showNotification('Task Title and Date are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/schedules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskForm),
            });

            const json = await res.json();

            if (!res.ok) {
                showNotification(json.error || 'Failed to create task', 'error');
                return;
            }

            showNotification('🎉 Scheduled task added successfully!', 'success');
            setIsModalOpen(false);
            setTaskForm({
                task_title: '',
                task_description: '',
                priority: 'standard',
                bay_assigned: 'B1',
                scheduled_date: selectedDate,
                start_time: '09:00',
                end_time: '11:00',
                duration_hours: '2.0',
                assigned_staff_id: '',
                vehicle_id: '',
                work_order_id: '',
            });
            fetchSchedules();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete Task
    const handleDeleteTask = async (taskId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm('Are you sure you want to remove this scheduled task?')) return;

        try {
            const res = await fetch(`${API_BASE_URL}/schedules/${taskId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                showNotification('Task deleted from schedule', 'info');
                fetchSchedules();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Filter tasks for the currently selected day
    const tasksForSelectedDay = scheduledTasks.filter((t) => t.scheduled_date === selectedDate);

    // Selected day formatted label
    const selectedDayObj = weekDays.find((d) => d.fullDate === selectedDate);
    const selectedDayTitle = selectedDayObj
        ? `${selectedDayObj.name}, ${selectedDayObj.monthName} ${selectedDayObj.dateNumber}`
        : selectedDate;

    // 7-day week header title e.g. "Oct 23 - Oct 29, 2026"
    const weekHeaderTitle = `${weekDays[0].monthName} ${weekDays[0].dateNumber} - ${weekDays[6].monthName} ${weekDays[6].dateNumber}, ${weekDays[0].rawDate.getFullYear()}`;

    return (
        <div className="scheduling-layout">
            {/* Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="scheduling-wrapper">
                {/* Header Bar */}
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
                        <button className="icon-btn" onClick={fetchSchedules} title="Refresh Schedules">
                            <RefreshIcon fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Main Interactive Workspace Area */}
                <main className="scheduling-main">
                    {/* Left Schedule / Tasks Panel */}
                    <aside className="unscheduled-sidebar">
                        <div className="unscheduled-card">
                            {/* Side Panel Tabs: Selected Day vs Unscheduled */}
                            <div className="side-panel-tabs">
                                <button
                                    type="button"
                                    className={`side-tab-btn ${sidebarTab === 'selected_day' ? 'active' : ''}`}
                                    onClick={() => setSidebarTab('selected_day')}
                                >
                                    <CalendarMonthIcon fontSize="inherit" />
                                    <span>{selectedDayObj?.name || 'Day'} Tasks</span>
                                </button>
                                <button
                                    type="button"
                                    className={`side-tab-btn ${sidebarTab === 'unscheduled' ? 'active' : ''}`}
                                    onClick={() => setSidebarTab('unscheduled')}
                                >
                                    <span>Backlog ({unscheduledWorkOrders.length})</span>
                                </button>
                            </div>

                            {/* Panel Header */}
                            <div className="unscheduled-header">
                                <div className="title-group">
                                    <span className="material-symbols-outlined text-warning">
                                        {sidebarTab === 'selected_day' ? 'event_available' : 'pending_actions'}
                                    </span>
                                    <h3 style={{ fontSize: '14px' }}>
                                        {sidebarTab === 'selected_day' ? selectedDayTitle : 'Unscheduled Work Orders'}
                                    </h3>
                                </div>
                                <span className="count-pill">
                                    {sidebarTab === 'selected_day'
                                        ? `${tasksForSelectedDay.length} Tasks`
                                        : `${unscheduledWorkOrders.length} Items`}
                                </span>
                            </div>

                            {/* Task / Orders List */}
                            <div className="unscheduled-list">
                                {sidebarTab === 'selected_day' ? (
                                    tasksForSelectedDay.length === 0 ? (
                                        <div className="empty-unscheduled">
                                            <CalendarMonthIcon style={{ fontSize: '36px', opacity: 0.4 }} />
                                            <p style={{ marginTop: '8px' }}>No tasks scheduled for {selectedDayTitle}.</p>
                                            <button
                                                type="button"
                                                className="quick-add-task-btn"
                                                onClick={() => {
                                                    setTaskForm((prev) => ({ ...prev, scheduled_date: selectedDate }));
                                                    setIsModalOpen(true);
                                                }}
                                            >
                                                <AddIcon fontSize="small" />
                                                <span>Add Task for this Day</span>
                                            </button>
                                        </div>
                                    ) : (
                                        tasksForSelectedDay.map((task) => (
                                            <div key={task.task_id} className="draggable-card active-card-border">
                                                <div className="card-top">
                                                    <span className="wo-code font-mono">
                                                        {task.work_order_id || task.task_id}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span
                                                            className={`priority-badge badge-${task.priority === 'urgent' || task.priority === 'high'
                                                                    ? 'error'
                                                                    : task.priority === 'low'
                                                                        ? 'success'
                                                                        : 'pending'
                                                                }`}
                                                        >
                                                            {task.priority.toUpperCase()}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn-card-del"
                                                            title="Delete task"
                                                            onClick={(e) => handleDeleteTask(task.task_id, e)}
                                                        >
                                                            <DeleteIcon fontSize="inherit" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <h4 className="wo-title">{task.task_title}</h4>
                                                {task.make && (
                                                    <p className="wo-vehicle">
                                                        🚗 {task.year} {task.make} {task.model}
                                                        {task.license_plate ? ` (${task.license_plate})` : ''}
                                                    </p>
                                                )}

                                                <div className="card-bottom">
                                                    <div className="meta-tag">
                                                        <AccessTimeIcon fontSize="inherit" />
                                                        <span>
                                                            {task.start_time || '09:00'} - {task.end_time || '11:00'}
                                                        </span>
                                                    </div>
                                                    <div className="meta-tag">
                                                        <PersonIcon fontSize="inherit" />
                                                        <span>{task.assigned_staff_name || 'Unassigned'}</span>
                                                    </div>
                                                    {task.bay_assigned && (
                                                        <div className="meta-tag font-mono text-yellow">
                                                            <span>📍 {task.bay_assigned}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )
                                ) : (
                                    /* Unscheduled Work Orders Tab */
                                    unscheduledWorkOrders.length === 0 ? (
                                        <div className="empty-unscheduled">
                                            <span>All active work orders have been scheduled!</span>
                                        </div>
                                    ) : (
                                        unscheduledWorkOrders.map((item) => (
                                            <div
                                                key={item.work_order_id}
                                                className="draggable-card"
                                                onClick={() => {
                                                    setTaskForm((prev) => ({
                                                        ...prev,
                                                        work_order_id: item.work_order_id,
                                                        vehicle_id: item.vehicle_id,
                                                        task_title: `WO ${item.work_order_id} - ${item.make} ${item.model}`,
                                                        scheduled_date: selectedDate,
                                                    }));
                                                    setIsModalOpen(true);
                                                }}
                                            >
                                                <div className="card-top">
                                                    <span className="wo-code font-mono">{item.work_order_id}</span>
                                                    <span className="priority-badge badge-pending">
                                                        {item.status.toUpperCase()}
                                                    </span>
                                                </div>

                                                <h4 className="wo-title">
                                                    {item.initial_observations || 'Vehicle Intake Scheduled'}
                                                </h4>
                                                <p className="wo-vehicle">
                                                    {item.year} {item.make} {item.model} - {item.owner_name}
                                                </p>

                                                <div className="card-bottom">
                                                    <div className="meta-tag">
                                                        <DirectionsCarIcon fontSize="inherit" />
                                                        <span>{item.license_plate || item.vin}</span>
                                                    </div>
                                                    <div className="meta-tag text-yellow font-mono">
                                                        <span>+ Schedule</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )
                                )}
                            </div>
                        </div>
                    </aside>

                    {/* Calendar Workspace */}
                    <section className="calendar-panel">
                        {/* Calendar Toolbar */}
                        <div className="calendar-toolbar">
                            <div className="toolbar-left">
                                <h2 className="calendar-date-heading">{weekHeaderTitle}</h2>
                                <div className="date-nav-group">
                                    <button className="nav-arrow-btn" onClick={handlePrevWeek} aria-label="Previous week">
                                        <span className="material-symbols-outlined">chevron_left</span>
                                    </button>
                                    <button className="current-week-label-btn" onClick={handleThisWeek}>
                                        This Week
                                    </button>
                                    <button className="nav-arrow-btn" onClick={handleNextWeek} aria-label="Next week">
                                        <span className="material-symbols-outlined">chevron_right</span>
                                    </button>
                                </div>
                            </div>

                            <div className="toolbar-right">
                                <div className="bay-status-legend">
                                    <span className="legend-item">
                                        <span className="legend-dot dot-success"></span>
                                        <span>Bay Available</span>
                                    </span>
                                    <span className="legend-item">
                                        <span className="legend-dot dot-error"></span>
                                        <span>Bay Booked</span>
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="primary-btn"
                                    onClick={() => {
                                        setTaskForm((prev) => ({ ...prev, scheduled_date: selectedDate }));
                                        setIsModalOpen(true);
                                    }}
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    <span>Add Task</span>
                                </button>
                            </div>
                        </div>

                        {/* Calendar Grid Container */}
                        <div className="calendar-scroll-grid">
                            {/* Days Header (Complete 7 Days) */}
                            <div className="grid-header-row">
                                <div className="resource-header-cell">
                                    <span>Resource / Bay</span>
                                </div>
                                <div className="days-header-group">
                                    {weekDays.map((day) => {
                                        const isSelected = selectedDate === day.fullDate;
                                        const isToday = day.fullDate === todayStr;

                                        return (
                                            <div
                                                key={day.fullDate}
                                                className={`day-cell ${isSelected ? 'active-day' : ''} ${isToday ? 'today-day' : ''}`}
                                                onClick={() => setSelectedDate(day.fullDate)}
                                                style={{ cursor: 'pointer' }}
                                                title={`Click to view tasks for ${day.name} ${day.monthName} ${day.dateNumber}`}
                                            >
                                                <span className="day-name">
                                                    {day.name} {isToday ? '(Today)' : ''}
                                                </span>
                                                <span className="day-number">{day.dateNumber}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Resource Rows / Bays */}
                            <div className="grid-body">
                                {BAYS.map((bay) => (
                                    <div key={bay.id} className="bay-row">
                                        <div className="bay-header-cell">
                                            <div className="bay-badge font-mono">{bay.name}</div>
                                            <span className="bay-label">{bay.label}</span>
                                            <div className="bay-load-bar">
                                                <div
                                                    className={`load-fill ${bay.loadType}`}
                                                    style={{ width: bay.loadPercent }}
                                                ></div>
                                            </div>
                                        </div>

                                        <div className="bay-days-group">
                                            {weekDays.map((day) => {
                                                const isSelected = selectedDate === day.fullDate;
                                                const dayBayTasks = scheduledTasks.filter(
                                                    (t) => t.scheduled_date === day.fullDate && (t.bay_assigned === bay.id || t.bay_assigned?.startsWith(bay.id))
                                                );

                                                return (
                                                    <div
                                                        key={`${bay.id}-${day.fullDate}`}
                                                        className={`day-drop-zone ${isSelected ? 'active-day-bg' : ''}`}
                                                        onClick={() => setSelectedDate(day.fullDate)}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {dayBayTasks.length > 0 ? (
                                                            dayBayTasks.map((task) => (
                                                                <div
                                                                    key={task.task_id}
                                                                    className={`scheduled-card ${task.priority === 'urgent' || task.priority === 'high'
                                                                            ? 'status-yellow-border'
                                                                            : 'status-success-border'
                                                                        }`}
                                                                >
                                                                    {isSelected && <span className="live-dot animate-pulse"></span>}
                                                                    <span className="slot-time highlight font-mono">
                                                                        {task.work_order_id || task.task_id} • {task.start_time || '09:00'} - {task.end_time || '11:00'}
                                                                    </span>
                                                                    <h5 className="slot-title">{task.task_title}</h5>
                                                                    <p className="slot-tech">
                                                                        <span className="material-symbols-outlined">person</span>{' '}
                                                                        {task.assigned_staff_name || 'Assigned'}
                                                                    </p>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="empty-slot-placeholder">
                                                                <span className="hover-add-icon material-symbols-outlined">
                                                                    add_circle
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </main>
            </div>

            {/* Modal Overlay: Add Task */}
            {isModalOpen && (
                <div className="schedule-modal-overlay">
                    <div className="schedule-modal-content">
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-icon">event_note</span>
                                <div>
                                    <h3 className="modal-title">Schedule New Task</h3>
                                    <p className="modal-subtitle">Assign bay, mechanic, and time slot for vehicle service</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTask} className="schedule-modal-form">
                            <div className="form-grid-2col">
                                <div className="form-group grid-full">
                                    <label htmlFor="task_title">TASK TITLE / SHORT DESCRIPTION *</label>
                                    <input
                                        type="text"
                                        id="task_title"
                                        name="task_title"
                                        placeholder="e.g. Transmission Rebuild & Fluid Flush"
                                        value={taskForm.task_title}
                                        onChange={handleFormChange}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="scheduled_date">SCHEDULED DATE *</label>
                                    <input
                                        type="date"
                                        id="scheduled_date"
                                        name="scheduled_date"
                                        value={taskForm.scheduled_date}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="priority">PRIORITY LEVEL *</label>
                                    <select
                                        id="priority"
                                        name="priority"
                                        value={taskForm.priority}
                                        onChange={handleFormChange}
                                    >
                                        {PRIORITY_OPTIONS.map((p) => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="start_time">START TIME</label>
                                    <input
                                        type="time"
                                        id="start_time"
                                        name="start_time"
                                        value={taskForm.start_time}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="end_time">END TIME</label>
                                    <input
                                        type="time"
                                        id="end_time"
                                        name="end_time"
                                        value={taskForm.end_time}
                                        onChange={handleFormChange}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="bay_assigned">WORKSHOP BAY / RESOURCE</label>
                                    <select
                                        id="bay_assigned"
                                        name="bay_assigned"
                                        value={taskForm.bay_assigned}
                                        onChange={handleFormChange}
                                    >
                                        <option value="B1">B1 - Heavy Repair</option>
                                        <option value="B2">B2 - Diagnostics & Electrical</option>
                                        <option value="B3">B3 - Express Lube & Tires</option>
                                        <option value="Lift 1">Lift 1 - General Repair</option>
                                        <option value="Bay 4">Bay 4 - Detailing & Inspection</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="assigned_staff_id">ASSIGN MECHANIC / STAFF</label>
                                    <select
                                        id="assigned_staff_id"
                                        name="assigned_staff_id"
                                        value={taskForm.assigned_staff_id}
                                        onChange={handleFormChange}
                                    >
                                        <option value="">-- Unassigned --</option>
                                        {staffList.map((st) => (
                                            <option key={st.staff_id} value={st.staff_id}>
                                                {st.full_name} ({st.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="work_order_id">LINK ACTIVE WORK ORDER (OPTIONAL)</label>
                                    <select
                                        id="work_order_id"
                                        name="work_order_id"
                                        value={taskForm.work_order_id}
                                        onChange={handleFormChange}
                                    >
                                        <option value="">-- Standalone Task / No Work Order --</option>
                                        {workOrdersList.map((wo) => (
                                            <option key={wo.work_order_id} value={wo.work_order_id}>
                                                {wo.work_order_id} • {wo.year} {wo.make} {wo.model} ({wo.owner_name})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="task_description">TASK NOTES / INSTRUCTIONS</label>
                                    <input
                                        type="text"
                                        id="task_description"
                                        name="task_description"
                                        placeholder="Special technician tools required or parts to inspect..."
                                        value={taskForm.task_description}
                                        onChange={handleFormChange}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Scheduling...' : 'Save Scheduled Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}