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
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import './css/Scheduling.css';
import { API_BASE_URL } from '../config/api';
import { useCurrency } from '../context/CurrencyContext';

const DEFAULT_BAYS = [
    { id: 'B1', bay_id: 'B1', name: 'B1', bay_name: 'Bay 1 - Heavy Repair', bay_type: 'heavy_repair', opening_time: '08:00', closing_time: '18:00', slot_duration_minutes: 60, loadPercent: '60%', loadType: 'pending' },
    { id: 'B2', bay_id: 'B2', name: 'B2', bay_name: 'Bay 2 - Diagnostics & Elect.', bay_type: 'diagnostics', opening_time: '08:00', closing_time: '18:00', slot_duration_minutes: 60, loadPercent: '40%', loadType: 'success' },
    { id: 'B3', bay_id: 'B3', name: 'B3', bay_name: 'Bay 3 - Express Lube & Tires', bay_type: 'express', opening_time: '08:00', closing_time: '18:00', slot_duration_minutes: 30, loadPercent: '20%', loadType: 'success' },
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

export default function Scheduling() {
    const { openSettingsModal } = useCurrency();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const weekDays = getWeekDays(currentDate);

    const todayStr = getLocalDateString(new Date());
    const [selectedDate, setSelectedDate] = useState(todayStr);

    const [sidebarTab, setSidebarTab] = useState('selected_day'); // 'selected_day' | 'unscheduled'
    const [bays, setBays] = useState(DEFAULT_BAYS);
    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [unscheduledWorkOrders, setUnscheduledWorkOrders] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [workOrdersList, setWorkOrdersList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // ==========================================
    // APPOINT CAR TO BAY MODAL STATE
    // ==========================================
    const [isAppointModalOpen, setIsAppointModalOpen] = useState(false);
    const [eligibleWorkOrders, setEligibleWorkOrders] = useState([]);
    const [appointForm, setAppointForm] = useState({
        work_order_id: '',
        bay_id: 'B1',
        appointment_date: todayStr,
        start_time: '',
        end_time: '',
        assigned_staff_id: '',
        service_type: 'Diagnostics & Intake Service',
        customer_notes: '',
    });
    const [availableSlots, setAvailableSlots] = useState([]);
    const [isSlotsLoading, setIsSlotsLoading] = useState(false);
    const [isAppointing, setIsAppointing] = useState(false);

    // ==========================================
    // BAY CONFIGURATION MODAL STATE
    // ==========================================
    const [isBayConfigOpen, setIsBayConfigOpen] = useState(false);
    const [newBayForm, setNewBayForm] = useState({
        bay_id: '',
        bay_name: '',
        bay_type: 'general',
        opening_time: '08:00',
        closing_time: '18:00',
        slot_duration_minutes: 60,
    });
    const [isCreatingBay, setIsCreatingBay] = useState(false);

    // ==========================================
    // QUICK TASK MODAL STATE
    // ==========================================
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

    // ==========================================
    // EDIT TASK / SCHEDULE MODAL STATE
    // ==========================================
    const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
    const [editTaskForm, setEditTaskForm] = useState({
        task_id: '',
        work_order_id: '',
        bay_assigned: 'B1',
        scheduled_date: todayStr,
        start_time: '09:00',
        end_time: '11:00',
        assigned_staff_id: '',
        task_title: '',
        priority: 'standard',
        task_description: '',
    });
    const [editSlots, setEditSlots] = useState([]);
    const [isEditSlotsLoading, setIsEditSlotsLoading] = useState(false);
    const [isSavingEditTask, setIsSavingEditTask] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Fetch Bays from API
    const fetchBays = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/bays`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                    setBays(
                        json.data.map((b) => ({
                            ...b,
                            id: b.bay_id,
                            name: b.bay_id,
                            label: b.bay_name,
                        }))
                    );
                }
            }
        } catch (err) {
            console.warn('Using default bays fallback:', err.message);
        }
    };

    // Fetch Eligible Work Orders strictly in 'received' or 'diagnosed' phase
    const fetchEligibleWorkOrders = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/appointments/eligible-work-orders`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setEligibleWorkOrders(json.data);
                }
            }
        } catch (err) {
            console.error('Error fetching eligible work orders:', err);
        }
    };

    // Fetch Real-Time Slots for Appoint Modal
    const fetchSlotsForAppoint = async (bayId, date) => {
        if (!bayId || !date) return;
        setIsSlotsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/bays/${encodeURIComponent(bayId)}/available-slots?date=${date}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.slots)) {
                    setAvailableSlots(json.slots);
                }
            }
        } catch (err) {
            console.error('Error fetching slots:', err);
        } finally {
            setIsSlotsLoading(false);
        }
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
        fetchBays();
        fetchSchedules();
        fetchEligibleWorkOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update form date when selectedDate changes
    useEffect(() => {
        setTaskForm((prev) => ({ ...prev, scheduled_date: selectedDate }));
        setAppointForm((prev) => ({ ...prev, appointment_date: selectedDate }));
    }, [selectedDate]);

    // When Appoint Modal opens or bay/date changes, refresh slots
    useEffect(() => {
        if (isAppointModalOpen && appointForm.bay_id && appointForm.appointment_date) {
            fetchSlotsForAppoint(appointForm.bay_id, appointForm.appointment_date);
        }
    }, [isAppointModalOpen, appointForm.bay_id, appointForm.appointment_date]);

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

    // Handle Quick Task Form Change
    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setTaskForm((prev) => {
            const updated = { ...prev, [name]: value };
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

    // Submit Quick Task
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
                bay_assigned: bays[0]?.bay_id || 'B1',
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

    // Submit Admin Appoint Car to Bay
    const handleAdminAppoint = async (e) => {
        e.preventDefault();
        if (isAppointing) return;

        if (!appointForm.work_order_id) {
            showNotification('Please select a car / work order in received or diagnosed phase.', 'error');
            return;
        }
        if (!appointForm.start_time || !appointForm.end_time) {
            showNotification('Please select an available time slot for the bay.', 'error');
            return;
        }

        setIsAppointing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/appointments/admin-appoint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appointForm),
            });
            const json = await res.json();

            if (!res.ok) {
                showNotification(json.error || 'Failed to appoint car to bay', 'error');
                return;
            }

            showNotification(json.message || '🎉 Vehicle appointed to bay successfully!', 'success');
            setIsAppointModalOpen(false);
            setAppointForm({
                work_order_id: '',
                bay_id: bays[0]?.bay_id || 'B1',
                appointment_date: selectedDate,
                start_time: '',
                end_time: '',
                assigned_staff_id: '',
                service_type: 'Diagnostics & Intake Service',
                customer_notes: '',
            });
            fetchSchedules();
            fetchEligibleWorkOrders();
            fetchBays();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsAppointing(false);
        }
    };

    // Create New Workshop Bay (Admin)
    const handleCreateBay = async (e) => {
        e.preventDefault();
        if (isCreatingBay) return;
        if (!newBayForm.bay_name.trim()) {
            showNotification('Bay Name is required.', 'error');
            return;
        }

        setIsCreatingBay(true);
        try {
            const res = await fetch(`${API_BASE_URL}/bays`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBayForm),
            });
            const json = await res.json();

            if (!res.ok) {
                showNotification(json.error || 'Failed to create workshop bay', 'error');
                return;
            }

            showNotification(`🎉 Workshop Bay '${json.data.bay_name}' configured!`, 'success');
            setNewBayForm({
                bay_id: '',
                bay_name: '',
                bay_type: 'general',
                opening_time: '08:00',
                closing_time: '18:00',
                slot_duration_minutes: 60,
            });
            fetchBays();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsCreatingBay(false);
        }
    };

    // Toggle Bay Active State
    const handleToggleBayStatus = async (bay) => {
        try {
            const res = await fetch(`${API_BASE_URL}/bays/${bay.bay_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !bay.is_active }),
            });
            if (res.ok) {
                showNotification(`Bay '${bay.bay_name}' status updated`, 'success');
                fetchBays();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
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
                fetchEligibleWorkOrders();
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // Edit Task / Reschedule Handlers
    const fetchSlotsForEditTask = async (bayId, date) => {
        if (!bayId || !date) return;
        setIsEditSlotsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/bays/${encodeURIComponent(bayId)}/available-slots?date=${date}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.slots)) {
                    setEditSlots(json.slots);
                }
            }
        } catch (err) {
            console.error('Error fetching edit slots:', err);
        } finally {
            setIsEditSlotsLoading(false);
        }
    };

    const handleOpenEditTask = (task, e) => {
        if (e) e.stopPropagation();
        const initialBay = task.bay_assigned || bays[0]?.bay_id || 'B1';
        const initialDate = task.scheduled_date || selectedDate;
        setEditTaskForm({
            task_id: task.task_id,
            work_order_id: task.work_order_id || '',
            bay_assigned: initialBay,
            scheduled_date: initialDate,
            start_time: task.start_time || '09:00',
            end_time: task.end_time || '10:00',
            assigned_staff_id: task.assigned_staff_id || '',
            task_title: task.task_title || '',
            priority: task.priority || 'standard',
            task_description: task.task_description || '',
        });
        setIsEditTaskModalOpen(true);
        fetchSlotsForEditTask(initialBay, initialDate);
    };

    const handleSaveEditTask = async (e) => {
        e.preventDefault();
        if (isSavingEditTask) return;
        if (!editTaskForm.bay_assigned || !editTaskForm.scheduled_date || !editTaskForm.start_time || !editTaskForm.end_time) {
            showNotification('Bay, date, and time slot are required.', 'error');
            return;
        }

        setIsSavingEditTask(true);
        try {
            const res = await fetch(`${API_BASE_URL}/schedules/${editTaskForm.task_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editTaskForm),
            });
            const json = await res.json();
            if (!res.ok) {
                showNotification(json.error || 'Failed to update scheduled task', 'error');
                return;
            }

            showNotification('🎉 Scheduled task updated successfully!', 'success');
            setIsEditTaskModalOpen(false);
            fetchSchedules();
            fetchEligibleWorkOrders();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsSavingEditTask(false);
        }
    };

    // Filter tasks for the currently selected day
    const tasksForSelectedDay = scheduledTasks.filter((t) => t.scheduled_date === selectedDate);

    // Selected day formatted label
    const selectedDayObj = weekDays.find((d) => d.fullDate === selectedDate);
    const selectedDayTitle = selectedDayObj
        ? `${selectedDayObj.name}, ${selectedDayObj.monthName} ${selectedDayObj.dateNumber}`
        : selectedDate;

    // 7-day week header title
    const weekHeaderTitle = `${weekDays[0].monthName} ${weekDays[0].dateNumber} - ${weekDays[6].monthName} ${weekDays[6].dateNumber}, ${weekDays[0].rawDate.getFullYear()}`;

    // Find currently selected WO details for Appoint Modal
    const selectedWoObj = eligibleWorkOrders.find((w) => w.work_order_id === appointForm.work_order_id);

    return (
        <div className="scheduling-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

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
                        {/* Manage Bays Button */}
                        <button
                            type="button"
                            className="btn-manage-bays"
                            onClick={() => setIsBayConfigOpen(true)}
                            title="Configure Workshop Bays, Timings & Capacity"
                        >
                            <SettingsIcon fontSize="small" />
                            <span>Bays ({bays.length})</span>
                        </button>

                        {/* Appoint Car to Bay Button */}
                        <button
                            type="button"
                            className="btn-appoint-cta"
                            onClick={() => {
                                fetchEligibleWorkOrders();
                                setIsAppointModalOpen(true);
                            }}
                            title="Appoint a received or diagnosed vehicle to a bay slot"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>car_repair</span>
                            <span>Appoint Car to Bay</span>
                        </button>

                        <button className="icon-btn" onClick={() => { fetchSchedules(); fetchBays(); fetchEligibleWorkOrders(); }} disabled={isLoading} title="Refresh Schedules">
                            <RefreshIcon className={isLoading ? 'spinning-icon' : ''} fontSize="small" />
                        </button>
                    </div>
                </header>

                {/* Toast Notification Banner */}
                {notification && (
                    <div style={{
                        margin: '12px 24px 0 24px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                        color: notification.type === 'error' ? '#f87171' : '#34d399',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '600'
                    }}>
                        <span>{notification.msg}</span>
                    </div>
                )}

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
                                                    setAppointForm((prev) => ({ ...prev, appointment_date: selectedDate }));
                                                    setIsAppointModalOpen(true);
                                                }}
                                            >
                                                <AddIcon fontSize="small" />
                                                <span>Appoint Car to Bay</span>
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
                                                            title="Edit / Reschedule task"
                                                            style={{ color: '#10b981' }}
                                                            onClick={(e) => handleOpenEditTask(task, e)}
                                                        >
                                                            <EditIcon fontSize="inherit" />
                                                        </button>
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
                                                    setAppointForm((prev) => ({
                                                        ...prev,
                                                        work_order_id: item.work_order_id,
                                                        appointment_date: selectedDate,
                                                    }));
                                                    setIsAppointModalOpen(true);
                                                }}
                                            >
                                                <div className="card-top">
                                                    <span className="wo-code font-mono">{item.work_order_id}</span>
                                                    <span className={`priority-badge ${item.status === 'diagnosed' ? 'car-badge-diagnosed' : 'car-badge-received'}`}>
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
                                                        <span>+ Appoint to Bay</span>
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
                                        <span>Bay Slot Free</span>
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
                                    <span>Quick Task</span>
                                </button>
                            </div>
                        </div>

                        {/* Calendar Grid Container */}
                        <div className="calendar-scroll-grid">
                            {/* Days Header */}
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
                                {bays.map((bay) => (
                                    <div key={bay.id || bay.bay_id} className="bay-row">
                                        <div className="bay-header-cell">
                                            <div className="bay-badge font-mono">{bay.name || bay.bay_id}</div>
                                            <span className="bay-label">{bay.bay_name || bay.label}</span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                ⏰ {bay.opening_time || '08:00'} - {bay.closing_time || '18:00'}
                                            </span>
                                            <div className="bay-load-bar" style={{ marginTop: '4px' }}>
                                                <div
                                                    className={`load-fill ${bay.loadType || 'success'}`}
                                                    style={{ width: bay.loadPercent || '30%' }}
                                                ></div>
                                            </div>
                                        </div>

                                        <div className="bay-days-group">
                                            {weekDays.map((day) => {
                                                const isSelected = selectedDate === day.fullDate;
                                                const dayBayTasks = scheduledTasks.filter(
                                                    (t) => t.scheduled_date === day.fullDate && (t.bay_assigned === bay.bay_id || t.bay_assigned === bay.id)
                                                );

                                                return (
                                                    <div
                                                        key={`${bay.bay_id || bay.id}-${day.fullDate}`}
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
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleOpenEditTask(task, e);
                                                                    }}
                                                                    title="Click to Edit / Reschedule"
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    {isSelected && <span className="live-dot animate-pulse"></span>}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span className="slot-time highlight font-mono">
                                                                            {task.work_order_id || task.task_id} • {task.start_time || '09:00'} - {task.end_time || '11:00'}
                                                                        </span>
                                                                        <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#10b981', opacity: 0.85 }}>edit</span>
                                                                    </div>
                                                                    <h5 className="slot-title">{task.task_title}</h5>
                                                                    <p className="slot-tech">
                                                                        <span className="material-symbols-outlined">person</span>{' '}
                                                                        {task.assigned_staff_name || 'Assigned'}
                                                                    </p>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="empty-slot-placeholder" onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAppointForm((prev) => ({
                                                                    ...prev,
                                                                    bay_id: bay.bay_id || bay.id,
                                                                    appointment_date: day.fullDate,
                                                                }));
                                                                setSelectedDate(day.fullDate);
                                                                setIsAppointModalOpen(true);
                                                            }}>
                                                                <span className="hover-add-icon material-symbols-outlined" title="Appoint Car to this Bay">
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

            {/* ==================================================== */}
            {/* MODAL 1: APPOINT CAR TO BAY */}
            {/* ==================================================== */}
            {isAppointModalOpen && (
                <div className="schedule-modal-overlay">
                    <div className="schedule-modal-content" style={{ maxWidth: '640px' }}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-icon" style={{ color: '#10b981' }}>car_repair</span>
                                <div>
                                    <h3 className="modal-title">Appoint Car to Bay</h3>
                                    <p className="modal-subtitle">Reserve or re-schedule a workshop bay slot for vehicles in Received, Diagnosed, or Scheduled phase</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsAppointModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleAdminAppoint} className="schedule-modal-form">
                            {/* Step 1: Select Eligible Car */}
                            <div className="form-group grid-full">
                                <label>1. SELECT CAR (RECEIVED, DIAGNOSED, OR SCHEDULED) *</label>
                                {eligibleWorkOrders.length === 0 ? (
                                    <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '13px' }}>
                                        ⚠️ No cars currently eligible for appointment booking. Cars must be in intake before booking a bay appointment.
                                    </div>
                                ) : (
                                    <div className="eligible-cars-list">
                                        {eligibleWorkOrders.map((wo) => {
                                            const isSelected = appointForm.work_order_id === wo.work_order_id;
                                            const isScheduled = wo.status === 'scheduled' || wo.is_scheduled;
                                            return (
                                                <div
                                                    key={wo.work_order_id}
                                                    className={`eligible-car-card ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => setAppointForm((prev) => ({ ...prev, work_order_id: wo.work_order_id }))}
                                                >
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <strong style={{ color: 'var(--text-main)' }}>{wo.year} {wo.make} {wo.model}</strong>
                                                            <span className="font-mono text-yellow" style={{ fontSize: '12px' }}>({wo.license_plate})</span>
                                                            <span className={isScheduled ? 'car-badge-scheduled' : wo.status === 'diagnosed' ? 'car-badge-diagnosed' : 'car-badge-received'}>
                                                                {isScheduled ? 'SCHEDULED' : wo.status.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            WO: {wo.work_order_id} • Owner: {wo.owner_name} {wo.initial_observations ? `• "${wo.initial_observations.slice(0, 45)}..."` : ''}
                                                        </div>
                                                        {isScheduled && (
                                                            <div style={{ fontSize: '11px', color: '#34d399', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>📅</span>
                                                                <span>
                                                                    <strong>Scheduled:</strong> {wo.appointment_bay_name || wo.bay_assigned || 'Bay'}
                                                                    {wo.appointment_date ? ` • ${wo.appointment_date}` : ''}
                                                                    {wo.appointment_start_time ? ` (${wo.appointment_start_time} - ${wo.appointment_end_time})` : ''}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {isSelected && <CheckCircleIcon style={{ color: '#10b981', fontSize: '20px' }} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {selectedWoObj && (
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '8px 12px',
                                        background: selectedWoObj.is_scheduled || selectedWoObj.status === 'scheduled' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 216, 95, 0.1)',
                                        border: `1px solid ${selectedWoObj.is_scheduled || selectedWoObj.status === 'scheduled' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 216, 95, 0.2)'}`,
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        color: selectedWoObj.is_scheduled || selectedWoObj.status === 'scheduled' ? '#34d399' : 'var(--accent-yellow)'
                                    }}>
                                        <div>
                                            {selectedWoObj.is_scheduled || selectedWoObj.status === 'scheduled' ? 'Re-Appointing / Rescheduling:' : 'Appointing:'} <strong>{selectedWoObj.year} {selectedWoObj.make} {selectedWoObj.model}</strong> (Plate: {selectedWoObj.license_plate}) • Owner: {selectedWoObj.owner_name}
                                        </div>
                                        {(selectedWoObj.is_scheduled || selectedWoObj.status === 'scheduled') && (
                                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)' }}>
                                                ℹ️ Currently scheduled for <strong>{selectedWoObj.appointment_bay_name || selectedWoObj.bay_assigned}</strong> on <strong>{selectedWoObj.appointment_date}</strong> ({selectedWoObj.appointment_start_time} - {selectedWoObj.appointment_end_time}). Selecting a slot below will update its appointment.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Step 2: Select Bay & Date */}
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="appoint_bay">2. TARGET WORKSHOP BAY *</label>
                                    <select
                                        id="appoint_bay"
                                        value={appointForm.bay_id}
                                        onChange={(e) => setAppointForm((prev) => ({ ...prev, bay_id: e.target.value, start_time: '', end_time: '' }))}
                                        required
                                    >
                                        {bays.map((b) => (
                                            <option key={b.bay_id || b.id} value={b.bay_id || b.id}>
                                                {b.bay_name || b.label} ({b.opening_time || '08:00'} - {b.closing_time || '18:00'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="appoint_date">3. APPOINTMENT DATE *</label>
                                    <input
                                        type="date"
                                        id="appoint_date"
                                        value={appointForm.appointment_date}
                                        onChange={(e) => setAppointForm((prev) => ({ ...prev, appointment_date: e.target.value, start_time: '', end_time: '' }))}
                                        className="font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Step 3: Real-Time Interactive Slot Picker */}
                            <div className="form-group grid-full">
                                <div className="slots-container-title">
                                    <span>4. SELECT AVAILABLE BAY TIME SLOT *</span>
                                    {appointForm.start_time && (
                                        <span style={{ color: '#10b981', fontWeight: '700' }}>
                                            Selected: {appointForm.start_time} - {appointForm.end_time}
                                        </span>
                                    )}
                                </div>

                                {isSlotsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                        Loading available bay slots...
                                    </div>
                                ) : availableSlots.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                        No slots available for this bay on this date.
                                    </div>
                                ) : (
                                    <div className="slots-grid">
                                        {availableSlots.map((slot) => {
                                            const isSelected = appointForm.start_time === slot.start_time && appointForm.end_time === slot.end_time;
                                            const statusClass = slot.is_available
                                                ? isSelected ? 'selected' : 'available'
                                                : slot.is_past ? 'disabled' : 'booked';

                                            return (
                                                <button
                                                    type="button"
                                                    key={slot.slot_id}
                                                    disabled={!slot.is_available}
                                                    className={`slot-pill ${statusClass}`}
                                                    onClick={() => {
                                                        if (slot.is_available) {
                                                            setAppointForm((prev) => ({
                                                                ...prev,
                                                                start_time: slot.start_time,
                                                                end_time: slot.end_time,
                                                            }));
                                                        }
                                                    }}
                                                    title={slot.occupant ? `Booked by ${slot.occupant.make || ''} ${slot.occupant.model || ''} (${slot.occupant.license_plate || 'In-Bay'})` : 'Available for appointment'}
                                                >
                                                    <span style={{ fontWeight: '700' }}>{slot.start_time} - {slot.end_time}</span>
                                                    <span className="slot-badge">
                                                        {slot.is_available
                                                            ? isSelected ? '✓ Selected' : 'Available'
                                                            : slot.is_past ? 'Past' : (slot.occupant?.license_plate || 'Booked')}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Step 4: Technician & Observations */}
                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="appoint_tech">ASSIGN TECHNICIAN (OPTIONAL)</label>
                                    <select
                                        id="appoint_tech"
                                        value={appointForm.assigned_staff_id}
                                        onChange={(e) => setAppointForm((prev) => ({ ...prev, assigned_staff_id: e.target.value }))}
                                    >
                                        <option value="">-- No Specific Technician --</option>
                                        {staffList.filter((s) => s.is_active !== false).map((st) => (
                                            <option key={st.staff_id} value={st.staff_id}>
                                                {st.full_name} ({st.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="appoint_service">SERVICE OBJECTIVE</label>
                                    <input
                                        type="text"
                                        id="appoint_service"
                                        value={appointForm.service_type}
                                        onChange={(e) => setAppointForm((prev) => ({ ...prev, service_type: e.target.value }))}
                                        placeholder="e.g. Diagnostic & Repair Intake"
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setIsAppointModalOpen(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-modal-submit"
                                    disabled={isAppointing || !appointForm.work_order_id || !appointForm.start_time}
                                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
                                >
                                    {isAppointing ? 'Confirming Appointment...' : 'Confirm Bay Appointment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* MODAL 2: WORKSHOP BAY CONFIGURATION & TIMINGS (ADMIN) */}
            {/* ==================================================== */}
            {isBayConfigOpen && (
                <div className="schedule-modal-overlay">
                    <div className="schedule-modal-content" style={{ maxWidth: '640px' }}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-icon" style={{ color: 'var(--accent-yellow)' }}>settings</span>
                                <div>
                                    <h3 className="modal-title">Workshop Bays & Capacity</h3>
                                    <p className="modal-subtitle">Configure bays, daily operating hours, and active statuses</p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsBayConfigOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <div className="schedule-modal-form">
                            {/* Workshop Shifts & Breaks Shortcut */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'rgba(255, 216, 95, 0.08)',
                                border: '1px solid rgba(255, 216, 95, 0.25)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '16px',
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#ffd85f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>⏰ Workshop Operating Shifts & Breaks</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                                        Configure morning/evening shift windows and afternoon breaks in Workshop Settings
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-modal-cancel"
                                    style={{
                                        fontSize: '11px',
                                        padding: '6px 14px',
                                        background: '#ffd85f',
                                        color: '#121814',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => {
                                        setIsBayConfigOpen(false);
                                        openSettingsModal();
                                    }}
                                >
                                    Configure Timings
                                </button>
                            </div>

                            {/* Current Bays List */}
                            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                CURRENT WORKSHOP BAYS ({bays.length})
                            </label>
                            <div className="bays-list-admin">
                                {bays.map((b) => (
                                    <div key={b.bay_id || b.id} className="bay-config-card">
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="bay-badge-tag">{b.bay_id || b.id}</span>
                                                <strong style={{ color: 'var(--text-main)', fontSize: '14px' }}>{b.bay_name || b.label}</strong>
                                                <span className={`priority-badge ${b.is_active !== false ? 'badge-success' : 'badge-error'}`}>
                                                    {b.is_active !== false ? 'ACTIVE' : 'MAINTENANCE'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                Hours: ⏰ {b.opening_time || '08:00'} - {b.closing_time || '18:00'} • Slot Duration: {b.slot_duration_minutes || 60}m
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-modal-cancel"
                                            style={{ height: '32px', padding: '0 12px', fontSize: '11px' }}
                                            onClick={() => handleToggleBayStatus(b)}
                                        >
                                            {b.is_active !== false ? 'Set Maintenance' : 'Reactivate'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add New Bay Section */}
                            <form onSubmit={handleCreateBay} style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-yellow)', display: 'block', marginBottom: '12px' }}>
                                    + ADD NEW WORKSHOP BAY
                                </label>
                                <div className="form-grid-2col">
                                    <div className="form-group">
                                        <label htmlFor="new_bay_name">BAY NAME *</label>
                                        <input
                                            type="text"
                                            id="new_bay_name"
                                            placeholder="e.g. Bay 4 - EV & Hybrid"
                                            value={newBayForm.bay_name}
                                            onChange={(e) => setNewBayForm((prev) => ({ ...prev, bay_name: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="new_bay_type">SPECIALTY / TYPE</label>
                                        <select
                                            id="new_bay_type"
                                            value={newBayForm.bay_type}
                                            onChange={(e) => setNewBayForm((prev) => ({ ...prev, bay_type: e.target.value }))}
                                        >
                                            <option value="general">General Repair</option>
                                            <option value="heavy_repair">Heavy Repair & Lift</option>
                                            <option value="diagnostics">Diagnostics & Electrical</option>
                                            <option value="express">Express Lube & Tires</option>
                                            <option value="ev_hybrid">EV & Hybrid Tech</option>
                                            <option value="alignment">Wheel Alignment</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="new_bay_open">OPENING TIME</label>
                                        <input
                                            type="time"
                                            id="new_bay_open"
                                            value={newBayForm.opening_time}
                                            onChange={(e) => setNewBayForm((prev) => ({ ...prev, opening_time: e.target.value }))}
                                            className="font-mono"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="new_bay_close">CLOSING TIME</label>
                                        <input
                                            type="time"
                                            id="new_bay_close"
                                            value={newBayForm.closing_time}
                                            onChange={(e) => setNewBayForm((prev) => ({ ...prev, closing_time: e.target.value }))}
                                            className="font-mono"
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                    <button type="submit" className="btn-modal-submit" disabled={isCreatingBay}>
                                        {isCreatingBay ? 'Saving Bay...' : '+ Add Bay'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* MODAL 3: QUICK TASK / GENERAL TASK MODAL            */}
            {/* ==================================================== */}
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
                                    <label htmlFor="bay_assigned">WORKSHOP BAY *</label>
                                    <select
                                        id="bay_assigned"
                                        name="bay_assigned"
                                        value={taskForm.bay_assigned}
                                        onChange={handleFormChange}
                                    >
                                        {bays.map((bay) => (
                                            <option key={bay.bay_id || bay.id} value={bay.bay_id || bay.id}>
                                                {bay.name || bay.bay_id} - {bay.bay_name || bay.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="assigned_staff_id">ASSIGNED MECHANIC</label>
                                    <select
                                        id="assigned_staff_id"
                                        name="assigned_staff_id"
                                        value={taskForm.assigned_staff_id}
                                        onChange={handleFormChange}
                                    >
                                        <option value="">-- Unassigned --</option>
                                        {staffList
                                            .filter((s) => s.is_active !== false)
                                            .map((staff) => (
                                                <option key={staff.staff_id} value={staff.staff_id}>
                                                    {staff.full_name} ({staff.role})
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <div className="form-group grid-full">
                                    <label htmlFor="task_description">DETAILED INSTRUCTIONS / PARTS NEEDED</label>
                                    <textarea
                                        id="task_description"
                                        name="task_description"
                                        rows="2"
                                        placeholder="Specific diagnostic steps, torque specs, or customer requests..."
                                        value={taskForm.task_description}
                                        onChange={handleFormChange}
                                    ></textarea>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* MODAL 3: EDIT / RESCHEDULE TASK */}
            {/* ==================================================== */}
            {isEditTaskModalOpen && (
                <div className="schedule-modal-overlay">
                    <div className="schedule-modal-content" style={{ maxWidth: '640px' }}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <span className="material-symbols-outlined modal-icon" style={{ color: '#10b981' }}>edit_calendar</span>
                                <div>
                                    <h3 className="modal-title">Edit / Reschedule Task</h3>
                                    <p className="modal-subtitle">
                                        Update bay, operating shift slot, priority, or technician assignment
                                        {editTaskForm.work_order_id ? ` (Work Order: ${editTaskForm.work_order_id})` : ''}
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="modal-close-btn" onClick={() => setIsEditTaskModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditTask} className="schedule-modal-form">
                            <div className="form-group grid-full">
                                <label htmlFor="edit_task_title">TASK TITLE *</label>
                                <input
                                    type="text"
                                    id="edit_task_title"
                                    value={editTaskForm.task_title}
                                    onChange={(e) => setEditTaskForm((prev) => ({ ...prev, task_title: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="edit_bay_assigned">WORKSHOP BAY *</label>
                                    <select
                                        id="edit_bay_assigned"
                                        value={editTaskForm.bay_assigned}
                                        onChange={(e) => {
                                            const bay = e.target.value;
                                            setEditTaskForm((prev) => ({ ...prev, bay_assigned: bay }));
                                            fetchSlotsForEditTask(bay, editTaskForm.scheduled_date);
                                        }}
                                        required
                                    >
                                        {bays.map((bay) => (
                                            <option key={bay.bay_id || bay.id} value={bay.bay_id || bay.id}>
                                                {bay.name || bay.bay_id} - {bay.bay_name || bay.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_scheduled_date">SCHEDULED DATE *</label>
                                    <input
                                        type="date"
                                        id="edit_scheduled_date"
                                        value={editTaskForm.scheduled_date}
                                        onChange={(e) => {
                                            const d = e.target.value;
                                            setEditTaskForm((prev) => ({ ...prev, scheduled_date: d }));
                                            fetchSlotsForEditTask(editTaskForm.bay_assigned, d);
                                        }}
                                        className="font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Slot Picker based on operating shift hours */}
                            <div className="form-group grid-full">
                                <div className="slots-container-title">
                                    <span>OPERATING SHIFTS / BAY SLOTS</span>
                                    {editTaskForm.start_time && (
                                        <span style={{ color: '#10b981', fontWeight: '700' }}>
                                            Current: {editTaskForm.start_time} - {editTaskForm.end_time}
                                        </span>
                                    )}
                                </div>

                                {isEditSlotsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                        Loading bay shift slots...
                                    </div>
                                ) : editSlots.length > 0 ? (
                                    <div className="slots-grid">
                                        {editSlots.map((slot, idx) => {
                                            const isSelected =
                                                editTaskForm.start_time === slot.start &&
                                                editTaskForm.end_time === slot.end;
                                            const canSelect = slot.available || isSelected;

                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    disabled={!canSelect}
                                                    className={`bay-slot-chip ${isSelected ? 'selected' : ''} ${!canSelect ? 'disabled' : ''}`}
                                                    onClick={() => {
                                                        if (canSelect) {
                                                            setEditTaskForm((prev) => ({
                                                                ...prev,
                                                                start_time: slot.start,
                                                                end_time: slot.end,
                                                            }));
                                                        }
                                                    }}
                                                >
                                                    <span className="slot-chip-time">{slot.label}</span>
                                                    <span className="slot-chip-status">
                                                        {isSelected ? '✓ Selected' : slot.available ? 'Available' : 'Booked'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        No predefined slots available for this bay. Use manual times below.
                                    </div>
                                )}
                            </div>

                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="edit_start_time">START TIME *</label>
                                    <input
                                        type="time"
                                        id="edit_start_time"
                                        value={editTaskForm.start_time}
                                        onChange={(e) => setEditTaskForm((prev) => ({ ...prev, start_time: e.target.value }))}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_end_time">END TIME *</label>
                                    <input
                                        type="time"
                                        id="edit_end_time"
                                        value={editTaskForm.end_time}
                                        onChange={(e) => setEditTaskForm((prev) => ({ ...prev, end_time: e.target.value }))}
                                        className="font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-grid-2col">
                                <div className="form-group">
                                    <label htmlFor="edit_priority">PRIORITY</label>
                                    <select
                                        id="edit_priority"
                                        value={editTaskForm.priority}
                                        onChange={(e) => setEditTaskForm((prev) => ({ ...prev, priority: e.target.value }))}
                                    >
                                        {PRIORITY_OPTIONS.map((p) => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit_assigned_staff_id">ASSIGNED MECHANIC</label>
                                    <select
                                        id="edit_assigned_staff_id"
                                        value={editTaskForm.assigned_staff_id}
                                        onChange={(e) => setEditTaskForm((prev) => ({ ...prev, assigned_staff_id: e.target.value }))}
                                    >
                                        <option value="">-- Unassigned --</option>
                                        {staffList
                                            .filter((s) => s.is_active !== false)
                                            .map((staff) => (
                                                <option key={staff.staff_id} value={staff.staff_id}>
                                                    {staff.full_name} ({staff.role})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group grid-full">
                                <label htmlFor="edit_task_description">NOTES / INSTRUCTIONS</label>
                                <textarea
                                    id="edit_task_description"
                                    rows="2"
                                    value={editTaskForm.task_description}
                                    onChange={(e) => setEditTaskForm((prev) => ({ ...prev, task_description: e.target.value }))}
                                    placeholder="Add any specific technician instructions or part notes..."
                                ></textarea>
                            </div>

                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn-modal-cancel"
                                    style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                    onClick={(e) => {
                                        if (window.confirm('Are you sure you want to remove this scheduled appointment/task?')) {
                                            handleDeleteTask(editTaskForm.task_id, e);
                                            setIsEditTaskModalOpen(false);
                                        }
                                    }}
                                >
                                    Delete Task / Free Bay
                                </button>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" className="btn-modal-cancel" onClick={() => setIsEditTaskModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-modal-submit" disabled={isSavingEditTask}>
                                        {isSavingEditTask ? 'Saving Changes...' : 'Save Schedule'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}