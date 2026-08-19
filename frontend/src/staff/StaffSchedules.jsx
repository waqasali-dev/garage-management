import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ConstructionIcon from '@mui/icons-material/Construction';
import './StaffSchedules.css';

const API_BASE_URL = 'http://localhost:5000/api';

const BAYS = [
    { id: 'B1', name: 'Bay 1', label: 'Heavy Repair & Engine', loadPercent: '80%', loadType: 'high' },
    { id: 'B2', name: 'Bay 2', label: 'Diagnostics & Elect.', loadPercent: '50%', loadType: 'optimal' },
    { id: 'B3', name: 'Lift 3', label: 'Express Lube & Tires', loadPercent: '25%', loadType: 'light' },
    { id: 'B4', name: 'Lift 4', label: 'Brakes & Suspension', loadPercent: '60%', loadType: 'optimal' },
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
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
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

export default function StaffSchedules() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const weekDays = getWeekDays(currentDate);

    // Automatically select today's local date
    const todayStr = getLocalDateString(new Date());
    const [selectedDate, setSelectedDate] = useState(todayStr);

    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState('all');
    const [isLoading, setIsLoading] = useState(true);

    const fetchSchedules = async () => {
        setIsLoading(true);
        try {
            const [schedRes, staffRes] = await Promise.all([
                fetch(`${API_BASE_URL}/schedules`),
                fetch(`${API_BASE_URL}/staff/list`),
            ]);

            if (schedRes.ok) {
                const sJson = await schedRes.json();
                if (sJson.success && Array.isArray(sJson.data)) {
                    setScheduledTasks(sJson.data);
                }
            }

            if (staffRes.ok) {
                const stJson = await staffRes.json();
                if (stJson.success && Array.isArray(stJson.data)) {
                    setStaffList(stJson.data);
                }
            }
        } catch (err) {
            console.error('Error loading schedules:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedules();
    }, []);

    // Filter tasks for the selected date and staff
    const dayTasks = scheduledTasks.filter((task) => {
        const matchesDate = task.scheduled_date === selectedDate;
        const matchesStaff =
            selectedStaffId === 'all' ||
            String(task.assigned_staff_id) === String(selectedStaffId);
        return matchesDate && matchesStaff;
    });

    // Compute task counts per date in current week
    const getTaskCountForDate = (dateStr) => {
        return scheduledTasks.filter((t) => t.scheduled_date === dateStr).length;
    };

    const handlePrevWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
    };

    const handleNextWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
    };

    const handleTodayClick = () => {
        const now = new Date();
        setCurrentDate(now);
        setSelectedDate(getLocalDateString(now));
    };

    const selectedDayObj = weekDays.find((d) => d.fullDate === selectedDate) || {
        name: 'Selected Day',
        monthName: '',
        dateNumber: '',
        fullDate: selectedDate,
    };

    return (
        <div className="staff-sched-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="staff-sched-wrapper">
                {/* Header */}
                <header className="staff-sched-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>
                        <div className="header-title-badge">
                            <CalendarMonthIcon fontSize="small" />
                            <span>WORKSHOP SCHEDULES</span>
                        </div>
                        <span className="read-only-pill">
                            <VisibilityIcon style={{ fontSize: '12px' }} />
                            READ-ONLY (ADMIN CONTROLLED)
                        </span>
                    </div>

                    <div className="header-right">
                        <button
                            className="icon-btn"
                            onClick={fetchSchedules}
                            title="Refresh Schedules"
                        >
                            <RefreshIcon fontSize="small" />
                        </button>

                        <button
                            className="nav-link-btn"
                            onClick={() => navigate('/staff/dashboard')}
                        >
                            <ArrowBackIcon fontSize="small" />
                            <span>Staff Dashboard</span>
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="staff-sched-main">
                    <div className="staff-sched-container">
                        {/* 7-Day Interactive Week Calendar Bar */}
                        <section className="week-calendar-bar">
                            <div className="week-nav-row">
                                <div className="calendar-month-title">
                                    <CalendarMonthIcon fontSize="small" style={{ color: 'var(--accent-yellow)' }} />
                                    <span>
                                        {weekDays[0]?.monthName} {weekDays[0]?.dateNumber} – {weekDays[6]?.monthName} {weekDays[6]?.dateNumber}, {currentDate.getFullYear()}
                                    </span>
                                </div>

                                <div className="week-nav-controls">
                                    <button className="nav-arrow-btn" onClick={handlePrevWeek} title="Previous Week">
                                        ← Prev Week
                                    </button>
                                    <button className="nav-arrow-btn btn-today" onClick={handleTodayClick} title="Jump to Today">
                                        Today
                                    </button>
                                    <button className="nav-arrow-btn" onClick={handleNextWeek} title="Next Week">
                                        Next Week →
                                    </button>
                                </div>
                            </div>

                            <div className="week-days-grid">
                                {weekDays.map((day) => {
                                    const isSelected = day.fullDate === selectedDate;
                                    const isToday = day.fullDate === todayStr;
                                    const taskCount = getTaskCountForDate(day.fullDate);

                                    return (
                                        <button
                                            key={day.fullDate}
                                            type="button"
                                            className={`day-card-btn ${isSelected ? 'day-active' : ''} ${isToday ? 'day-is-today' : ''}`}
                                            onClick={() => setSelectedDate(day.fullDate)}
                                        >
                                            <span className="day-name">{day.name}</span>
                                            <span className="day-number font-mono">{day.dateNumber}</span>
                                            <span className="day-task-count-badge">
                                                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* 2 Column Main Schedule Content */}
                        <div className="sched-grid-2col">
                            {/* Left: Tasks List for Selected Day */}
                            <div className="sched-card">
                                <div className="sched-card-header">
                                    <div className="sched-card-title-group">
                                        <ConstructionIcon fontSize="small" style={{ color: 'var(--accent-yellow)' }} />
                                        <h3>
                                            Scheduled Tasks for {selectedDayObj.name}, {selectedDayObj.monthName} {selectedDayObj.dateNumber}
                                        </h3>
                                    </div>

                                    <div>
                                        <select
                                            className="sched-filter-select"
                                            value={selectedStaffId}
                                            onChange={(e) => setSelectedStaffId(e.target.value)}
                                        >
                                            <option value="all">-- All Technicians --</option>
                                            {staffList.map((st) => (
                                                <option key={st.staff_id} value={st.staff_id}>
                                                    {st.full_name} ({st.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="daily-tasks-list">
                                    {isLoading ? (
                                        <div className="empty-sched-state">
                                            <p>Loading scheduled appointments from database...</p>
                                        </div>
                                    ) : dayTasks.length === 0 ? (
                                        <div className="empty-sched-state">
                                            <CalendarMonthIcon style={{ fontSize: '48px', color: 'var(--text-muted)' }} />
                                            <p>No tasks scheduled for {selectedDayObj.name} ({selectedDate}).</p>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                New assignments and bay schedules will appear here automatically when created by admin.
                                            </span>
                                        </div>
                                    ) : (
                                        dayTasks.map((task) => (
                                            <div key={task.task_id} className="sched-task-card">
                                                <div className="task-card-header-row">
                                                    <div className="task-title-stack">
                                                        <span className={`priority-tag priority-${task.priority || 'standard'}`}>
                                                            {task.priority || 'STANDARD'}
                                                        </span>
                                                        <h4 className="sched-task-title">{task.task_title}</h4>
                                                    </div>

                                                    {task.bay_assigned && (
                                                        <span className="bay-badge-pill font-mono">
                                                            📍 {task.bay_assigned}
                                                        </span>
                                                    )}
                                                </div>

                                                {task.task_description && (
                                                    <p className="sched-task-desc">{task.task_description}</p>
                                                )}

                                                {/* Vehicle Details Box if linked */}
                                                {(task.make || task.license_plate || task.work_order_id) && (
                                                    <div className="task-vehicle-box">
                                                        <div>
                                                            <span className="vehicle-desc-text">
                                                                🚗 {task.year} {task.make} {task.model}
                                                            </span>
                                                            <span className="vehicle-meta-tags" style={{ marginLeft: '8px' }}>
                                                                {task.license_plate && `[${task.license_plate}]`}
                                                                {task.owner_name && ` • 👤 ${task.owner_name}`}
                                                            </span>
                                                        </div>

                                                        {task.work_order_id && (
                                                            <Link
                                                                to={`/staff/work-orders/${task.work_order_id}`}
                                                                className="workorder-link font-mono"
                                                                title="Open Work Order Execution"
                                                            >
                                                                {task.work_order_id} →
                                                            </Link>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="task-footer-meta">
                                                    <div className="meta-item">
                                                        <AccessTimeIcon fontSize="inherit" />
                                                        <span>
                                                            {task.start_time || '09:00'} - {task.end_time || '11:00'} ({task.duration_hours || '2.0'}h)
                                                        </span>
                                                    </div>

                                                    <div className="meta-item">
                                                        <PersonIcon fontSize="inherit" />
                                                        <span className="tech-highlight">
                                                            Tech: {task.assigned_staff_name || 'Unassigned'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right: Bay Utilization Summary */}
                            <div className="sched-col-sidebar">
                                <div className="bay-util-card">
                                    <div className="sched-card-title-group">
                                        <ConstructionIcon fontSize="small" style={{ color: 'var(--accent-yellow)' }} />
                                        <h3>Workshop Bay Status</h3>
                                    </div>

                                    <div className="bay-util-list">
                                        {BAYS.map((bay) => (
                                            <div key={bay.id} className="bay-util-row">
                                                <div>
                                                    <div className="bay-name-title">{bay.name}</div>
                                                    <div className="bay-sub">{bay.label}</div>
                                                </div>
                                                <span className={`bay-load-badge load-${bay.loadType}`}>
                                                    {bay.loadPercent}
                                                </span>
                                            </div>
                                        ))}
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
