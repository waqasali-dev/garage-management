import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import StyledLoading from '../components/StyledLoading';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuIcon from '@mui/icons-material/Menu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import VehicleVisual from '../components/VehicleVisual';
import './OwnerCars.css';
import { API_BASE_URL } from '../config/api';

// Helper to format local date YYYY-MM-DD
const getLocalDateString = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// If current time is after 17:00, default to tomorrow so daytime slots are available
const getInitialBookingDate = () => {
    const now = new Date();
    if (now.getHours() >= 17) {
        now.setDate(now.getDate() + 1);
    }
    return getLocalDateString(now);
};

const DEFAULT_BAYS = [
    { bay_id: 'B1', bay_name: 'Bay 1 - Heavy Repair', opening_time: '08:00', closing_time: '18:00', is_active: true },
    { bay_id: 'B2', bay_name: 'Bay 2 - Diagnostics & Electrical', opening_time: '08:00', closing_time: '18:00', is_active: true },
    { bay_id: 'B3', bay_name: 'Bay 3 - Express Lube & Tires', opening_time: '08:00', closing_time: '18:00', is_active: true },
];

export default function OwnerCars() {
    const { user } = useAuth();
    const { formatCurrency } = useCurrency();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [bays, setBays] = useState(DEFAULT_BAYS);
    const [customerAppointments, setCustomerAppointments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // ==========================================
    // CUSTOMER APPOINTMENT BOOKING STATE
    // ==========================================
    const todayStr = getLocalDateString(new Date());
    const initialBookingDate = getInitialBookingDate();
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [bookingForm, setBookingForm] = useState({
        vehicle_id: '',
        bay_id: 'B1',
        appointment_date: initialBookingDate,
        start_time: '',
        end_time: '',
        service_type: 'Routine Service & Inspection',
        customer_notes: '',
    });
    const [availableSlots, setAvailableSlots] = useState([]);
    const [slotMeta, setSlotMeta] = useState({ shifts: [], breaks: [], isOpen: true, reason: '' });
    const [isSlotsLoading, setIsSlotsLoading] = useState(false);
    const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const fetchCustomerAppointments = async () => {
        try {
            const ownerId = user?.owner_id;
            const url = ownerId
                ? `${API_BASE_URL}/appointments?owner_id=${encodeURIComponent(ownerId)}`
                : `${API_BASE_URL}/appointments`;
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    // Filter out cancelled bookings so user sees active confirmed/pending ones
                    setCustomerAppointments(json.data.filter((a) => a.status !== 'cancelled'));
                }
            }
        } catch (err) {
            console.error('Error fetching customer appointments:', err);
        }
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Are you sure you want to cancel this workshop appointment? The reserved bay slot will be released.')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cancellation_reason: 'Cancelled by customer from portal' }),
            });
            const json = await res.json();
            if (res.ok) {
                showNotification('Appointment cancelled and bay slot released.', 'info');
                fetchOwnerVehicles();
                fetchCustomerAppointments();
            } else {
                showNotification(json.error || 'Failed to cancel appointment', 'error');
            }
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
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
                    const myVehicles = ownerId
                        ? vJson.data.filter((v) => String(v.owner_id) === String(ownerId))
                        : vJson.data;
                    setVehicles(myVehicles);
                    if (myVehicles.length > 0 && !bookingForm.vehicle_id) {
                        const firstAvailable = myVehicles.find((v) => !v.has_active_booking) || myVehicles[0];
                        setBookingForm((prev) => ({ ...prev, vehicle_id: firstAvailable.vehicle_id }));
                    }
                }
            }
            fetchCustomerAppointments();
        } catch (err) {
            console.error('Error loading owner vehicles:', err);
            showNotification('Failed to fetch vehicle data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBays = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/bays`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                    const activeBays = json.data.filter((b) => b.is_active !== false);
                    if (activeBays.length > 0) {
                        setBays(activeBays);
                        setBookingForm((prev) => ({
                            ...prev,
                            bay_id: prev.bay_id || activeBays[0].bay_id,
                        }));
                    }
                }
            }
        } catch (err) {
            console.warn('Could not load bays from API, retaining default bays:', err.message);
        }
    };

    // Load available slots whenever bay or date changes in booking modal
    const fetchAvailableSlots = async (bayId, date) => {
        const targetBayId = bayId || bookingForm.bay_id || bays[0]?.bay_id || 'B1';
        const targetDate = date || bookingForm.appointment_date || initialBookingDate;
        setIsSlotsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/bays/${encodeURIComponent(targetBayId)}/available-slots?date=${targetDate}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setSlotMeta({
                        shifts: json.operating_shifts || [],
                        breaks: json.breaks || [],
                        isOpen: json.isOpen !== false,
                        reason: json.reason || '',
                    });
                    if (json.isOpen === false) {
                        setAvailableSlots([]);
                        return;
                    }
                    if (Array.isArray(json.slots)) {
                        setAvailableSlots(json.slots);
                        return;
                    }
                }
            }
            // Fallback generated slots if API offline
            const fallbackSlots = [
                { slot_id: `${targetBayId}_0800`, start_time: '08:00', end_time: '09:00', is_available: true },
                { slot_id: `${targetBayId}_0900`, start_time: '09:00', end_time: '10:00', is_available: true },
                { slot_id: `${targetBayId}_1000`, start_time: '10:00', end_time: '11:00', is_available: true },
                { slot_id: `${targetBayId}_1100`, start_time: '11:00', end_time: '12:00', is_available: true },
                { slot_id: `${targetBayId}_1600`, start_time: '16:00', end_time: '17:00', is_available: true },
                { slot_id: `${targetBayId}_1700`, start_time: '17:00', end_time: '18:00', is_available: true },
                { slot_id: `${targetBayId}_1800`, start_time: '18:00', end_time: '19:00', is_available: true },
                { slot_id: `${targetBayId}_1900`, start_time: '19:00', end_time: '20:00', is_available: true },
            ];
            setAvailableSlots(fallbackSlots);
        } catch (err) {
            console.error('Error loading available slots:', err);
        } finally {
            setIsSlotsLoading(false);
        }
    };

    // Load bays on component mount
    useEffect(() => {
        fetchBays();
    }, []);

    // Load vehicles when user auth resolves
    useEffect(() => {
        fetchOwnerVehicles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.owner_id]);

    useEffect(() => {
        if (isBookingModalOpen) {
            fetchAvailableSlots(bookingForm.bay_id, bookingForm.appointment_date);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBookingModalOpen, bookingForm.bay_id, bookingForm.appointment_date]);

    useEffect(() => {
        if (location.search.includes('book=true')) {
            setIsBookingModalOpen(true);
        }
    }, [location.search]);

    // Open booking modal for a specific vehicle
    const handleOpenBooking = (vehicleId = null) => {
        if (vehicleId) {
            const targetV = vehicles.find((v) => v.vehicle_id === vehicleId);
            if (targetV?.has_active_booking) {
                showNotification(
                    `This vehicle already has an active confirmed appointment booked on ${targetV.upcoming_appointment?.appointment_date || 'scheduled date'} at ${targetV.upcoming_appointment?.start_time || ''}! You cannot book another schedule until that date and time has passed.`,
                    'error'
                );
                return;
            }
        }

        const unbookedVeh = vehicleId
            ? vehicles.find((v) => v.vehicle_id === vehicleId)
            : vehicles.find((v) => !v.has_active_booking) || vehicles[0];

        if (!unbookedVeh) {
            showNotification('No vehicles available to book.', 'error');
            return;
        }

        if (unbookedVeh.has_active_booking && !vehicleId) {
            showNotification(
                'All your vehicles already have confirmed appointments that have not passed yet.',
                'error'
            );
            return;
        }

        const targetVehicleId = unbookedVeh.vehicle_id;
        const targetBayId = bays[0]?.bay_id || 'B1';
        const targetDate = getInitialBookingDate();
        setBookingForm({
            vehicle_id: targetVehicleId,
            bay_id: targetBayId,
            appointment_date: targetDate,
            start_time: '',
            end_time: '',
            service_type: 'Routine Service & Inspection',
            customer_notes: '',
        });
        setIsBookingModalOpen(true);
        fetchAvailableSlots(targetBayId, targetDate);
    };

    // Handle Customer Booking Submit
    const handleCustomerBookingSubmit = async (e) => {
        e.preventDefault();
        if (isBookingSubmitting) return;

        if (!bookingForm.vehicle_id) {
            showNotification('Please select a vehicle to book.', 'error');
            return;
        }

        const targetVehicleObj = vehicles.find((v) => v.vehicle_id === bookingForm.vehicle_id);
        if (targetVehicleObj?.has_active_booking) {
            showNotification(
                `This vehicle already has a scheduled appointment booked on ${targetVehicleObj.upcoming_appointment?.appointment_date} at ${targetVehicleObj.upcoming_appointment?.start_time}. Another appointment cannot be booked until that time passes.`,
                'error'
            );
            return;
        }

        if (!bookingForm.start_time || !bookingForm.end_time) {
            showNotification('Please select an available time slot for your appointment.', 'error');
            return;
        }

        setIsBookingSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/appointments/customer-book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...bookingForm,
                    owner_id: user?.owner_id || undefined,
                }),
            });
            const json = await res.json();

            if (!res.ok) {
                showNotification(json.error || 'Failed to book appointment', 'error');
                return;
            }

            showNotification(json.message || '🎉 Your service appointment has been booked!', 'success');
            setIsBookingModalOpen(false);
            fetchOwnerVehicles();
            fetchCustomerAppointments();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setIsBookingSubmitting(false);
        }
    };

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

    const selectedVehicleObj = vehicles.find((v) => v.vehicle_id === bookingForm.vehicle_id);

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

                    <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Book Service Appointment CTA */}
                        <button
                            type="button"
                            className="btn-book-appointment-header"
                            onClick={() => handleOpenBooking()}
                            disabled={vehicles.length === 0}
                            title="Book a workshop bay appointment for your car"
                        >
                            <CalendarMonthIcon fontSize="small" />
                            <span>Book Appointment</span>
                        </button>

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

                        {/* Confirmed Customer Bay Bookings Section */}
                        {customerAppointments.length > 0 && (
                            <section className="customer-bookings-section">
                                <div className="bookings-section-header">
                                    <div className="section-title-wrap">
                                        <CalendarMonthIcon style={{ color: '#10b981', fontSize: '22px' }} />
                                        <h2 className="section-title">My Confirmed Workshop Appointments</h2>
                                        <span className="bookings-count-pill font-mono">{customerAppointments.length} Active</span>
                                    </div>
                                    <p className="section-desc">
                                        Reserved workshop bay slots and scheduled maintenance appointments for your vehicles.
                                    </p>
                                </div>

                                <div className="bookings-cards-grid">
                                    {customerAppointments.map((apt) => {
                                        const isToday = apt.appointment_date === todayStr;
                                        return (
                                            <div key={apt.appointment_id} className="booking-ticket-card">
                                                <div className="ticket-top">
                                                    <div className="ticket-time-badge">
                                                        <span className="ticket-date font-mono">📅 {apt.appointment_date}</span>
                                                        <span className="ticket-time font-mono">⏰ {apt.start_time} - {apt.end_time}</span>
                                                        {isToday && <span className="today-badge font-mono">TODAY</span>}
                                                    </div>
                                                    <span className={`apt-status-badge ${apt.status === 'confirmed' ? 'status-confirmed' : 'status-pending'}`}>
                                                        {apt.status.toUpperCase()}
                                                    </span>
                                                </div>

                                                <div className="ticket-car">
                                                    <VehicleVisual
                                                        vehicleType={apt.vehicle_type}
                                                        make={apt.make}
                                                        model={apt.model}
                                                        size="xs"
                                                        showBadge={false}
                                                    />
                                                    <div className="ticket-car-details">
                                                        <div className="ticket-car-name">
                                                            {apt.year} {apt.make} {apt.model}
                                                        </div>
                                                        <div className="ticket-plate font-mono">
                                                            PLATE: {apt.license_plate || 'N/A'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="ticket-meta-row">
                                                    <div className="ticket-bay">
                                                        <span className="lbl">BAY:</span>
                                                        <span className="val font-mono">{apt.bay_name || apt.bay_id}</span>
                                                    </div>
                                                    <div className="ticket-service">
                                                        <span className="lbl">SERVICE:</span>
                                                        <span className="val">{apt.service_type || 'Routine Service'}</span>
                                                    </div>
                                                </div>

                                                {apt.customer_notes && (
                                                    <div className="ticket-notes">
                                                        <span className="lbl">Notes:</span> "{apt.customer_notes}"
                                                    </div>
                                                )}

                                                <div className="ticket-footer">
                                                    {apt.work_order_id ? (
                                                        <Link to={`/work-orders/${apt.work_order_id}`} className="ticket-wo-link font-mono">
                                                            📋 {apt.work_order_id} →
                                                        </Link>
                                                    ) : <span></span>}
                                                    <button
                                                        type="button"
                                                        className="btn-cancel-booking"
                                                        onClick={() => handleCancelAppointment(apt.appointment_id)}
                                                        title="Cancel this appointment and free the bay slot"
                                                    >
                                                        Cancel Booking
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

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

                                            {/* Car Visual Showcase */}
                                            <div className="v-card-hero-showcase">
                                                <VehicleVisual
                                                    vehicleType={vehicle.vehicle_type}
                                                    make={vehicle.make}
                                                    model={vehicle.model}
                                                    size="md"
                                                    showBadge={true}
                                                />
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

                                            {/* Active Scheduled Appointment Banner Strip */}
                                            {vehicle.has_active_booking && vehicle.upcoming_appointment && (
                                                <div className="v-active-schedule-strip">
                                                    <div className="schedule-strip-left">
                                                        <span className="schedule-dot animate-pulse"></span>
                                                        <span className="font-mono">
                                                            📅 {vehicle.upcoming_appointment.appointment_date} • {vehicle.upcoming_appointment.start_time}-{vehicle.upcoming_appointment.end_time}
                                                        </span>
                                                    </div>
                                                    <span className="schedule-bay-pill font-mono">
                                                        {vehicle.upcoming_appointment.bay_name || vehicle.upcoming_appointment.bay_id}
                                                    </span>
                                                </div>
                                            )}

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
                                                {/* Direct Book Service Button or Disabled Already Scheduled */}
                                                {vehicle.has_active_booking ? (
                                                    <button
                                                        type="button"
                                                        className="btn-book-card-secondary is-already-booked"
                                                        disabled
                                                        title={`This vehicle already has an active appointment booked on ${vehicle.upcoming_appointment?.appointment_date} at ${vehicle.upcoming_appointment?.start_time}. Another appointment cannot be booked until that time passes.`}
                                                    >
                                                        <CalendarMonthIcon fontSize="inherit" />
                                                        <span>Already Scheduled</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn-book-card-secondary"
                                                        onClick={() => handleOpenBooking(vehicle.vehicle_id)}
                                                        title="Book service slot for this car"
                                                    >
                                                        <CalendarMonthIcon fontSize="inherit" />
                                                        <span>Book Service</span>
                                                    </button>
                                                )}

                                                <Link
                                                    to={`/owner/history/${encodeURIComponent(vehicle.vin)}`}
                                                    className="btn-history-primary"
                                                >
                                                    <HistoryIcon fontSize="small" />
                                                    <span>History</span>
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

            {/* ==================================================== */}
            {/* CUSTOMER SERVICE APPOINTMENT BOOKING MODAL           */}
            {/* ==================================================== */}
            {isBookingModalOpen && (
                <div className="customer-modal-overlay">
                    <div className="customer-modal-box">
                        <div className="customer-modal-header">
                            <div>
                                <h3>
                                    <CalendarMonthIcon style={{ color: '#10b981' }} />
                                    <span>Book Service Appointment</span>
                                </h3>
                                <p>Select your vehicle, service request, and an open workshop bay time slot</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setIsBookingModalOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleCustomerBookingSubmit} className="customer-modal-form">
                            {/* 1. Vehicle Selection */}
                            <div className="customer-form-group">
                                <label htmlFor="booking_vehicle">1. SELECT VEHICLE *</label>
                                <select
                                    id="booking_vehicle"
                                    value={bookingForm.vehicle_id}
                                    onChange={(e) => setBookingForm((prev) => ({ ...prev, vehicle_id: e.target.value }))}
                                    required
                                >
                                    {vehicles.map((v) => (
                                        <option key={v.vehicle_id} value={v.vehicle_id} disabled={v.has_active_booking}>
                                            {v.year} {v.make} {v.model} (Plate: {v.license_plate}) {v.has_active_booking ? '— 🔒 [Active Schedule Booked]' : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedVehicleObj?.has_active_booking && (
                                    <div className="active-booking-warning-banner">
                                        <div className="warning-title">
                                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock_clock</span>
                                            <strong>Active Appointment Already Booked</strong>
                                        </div>
                                        <p>
                                            This {selectedVehicleObj.year} {selectedVehicleObj.make} {selectedVehicleObj.model} (Plate: {selectedVehicleObj.license_plate}) already has a confirmed appointment on <strong>{selectedVehicleObj.upcoming_appointment?.appointment_date}</strong> from <strong>{selectedVehicleObj.upcoming_appointment?.start_time} to {selectedVehicleObj.upcoming_appointment?.end_time}</strong> in <strong>{selectedVehicleObj.upcoming_appointment?.bay_name || selectedVehicleObj.upcoming_appointment?.bay_id}</strong>.
                                        </p>
                                        <p className="warning-sub">
                                            You cannot book another schedule for this car until the existing appointment date and time has passed.
                                        </p>
                                    </div>
                                )}
                                {selectedVehicleObj && !selectedVehicleObj.has_active_booking && (
                                    <div className="booking-vehicle-preview">
                                        <VehicleVisual
                                            vehicleType={selectedVehicleObj.vehicle_type}
                                            make={selectedVehicleObj.make}
                                            model={selectedVehicleObj.model}
                                            size="sm"
                                            showBadge={true}
                                        />
                                        <div style={{ fontSize: '12px', color: '#10b981' }}>
                                            Vehicle: <strong>{selectedVehicleObj.year} {selectedVehicleObj.make} {selectedVehicleObj.model}</strong> • Plate: <span className="font-mono">{selectedVehicleObj.license_plate}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 2. Service Category */}
                            <div className="customer-form-row">
                                <div className="customer-form-group">
                                    <label htmlFor="booking_service">2. SERVICE NEEDED *</label>
                                    <select
                                        id="booking_service"
                                        value={bookingForm.service_type}
                                        onChange={(e) => setBookingForm((prev) => ({ ...prev, service_type: e.target.value }))}
                                    >
                                        <option value="Routine Service & Inspection">Routine Service & Inspection</option>
                                        <option value="Diagnostic Inspection">Diagnostic & Electrical Inspection</option>
                                        <option value="Brake Service & Pads">Brake Service & Pad Replacement</option>
                                        <option value="Oil & Filter Change">Express Oil & Filter Change</option>
                                        <option value="Tire Rotation & Balance">Tire Rotation & Wheel Alignment</option>
                                        <option value="AC & Climate Control">Air Conditioning & Climate System</option>
                                        <option value="Transmission & Drivetrain">Transmission & Drivetrain Check</option>
                                        <option value="Other / Custom Request">Other / Custom Repair Request</option>
                                    </select>
                                </div>

                                <div className="customer-form-group">
                                    <label htmlFor="booking_bay">3. WORKSHOP BAY *</label>
                                    <select
                                        id="booking_bay"
                                        value={bookingForm.bay_id}
                                        onChange={(e) => {
                                            const newBay = e.target.value;
                                            setBookingForm((prev) => ({ ...prev, bay_id: newBay, start_time: '', end_time: '' }));
                                            fetchAvailableSlots(newBay, bookingForm.appointment_date);
                                        }}
                                        required
                                    >
                                        {bays.map((b) => (
                                            <option key={b.bay_id} value={b.bay_id}>
                                                {b.bay_name || b.bay_id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* 3. Appointment Date */}
                            <div className="customer-form-group">
                                <label htmlFor="booking_date">4. PREFERRED DATE *</label>
                                <input
                                    type="date"
                                    id="booking_date"
                                    min={todayStr}
                                    value={bookingForm.appointment_date}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        setBookingForm((prev) => ({ ...prev, appointment_date: newDate, start_time: '', end_time: '' }));
                                        fetchAvailableSlots(bookingForm.bay_id, newDate);
                                    }}
                                    required
                                    className="font-mono"
                                />
                            </div>

                            {/* 4. Slot Selection */}
                            <div className="customer-form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label>5. AVAILABLE TIME SLOTS *</label>
                                    {bookingForm.start_time && (
                                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700' }}>
                                            Selected: {bookingForm.start_time} - {bookingForm.end_time}
                                        </span>
                                    )}
                                </div>

                                {/* Shift and Break indicators */}
                                {slotMeta.shifts.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                        {slotMeta.shifts.map((s, idx) => (
                                            <span key={idx} style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '2px 8px', borderRadius: '12px' }}>
                                                ⏰ {s.label || `Shift ${idx + 1}`}: {s.start} - {s.end}
                                            </span>
                                        ))}
                                        {slotMeta.breaks.map((b, idx) => (
                                            <span key={idx} style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '12px' }}>
                                                ☕ Break: {b.time_label}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {isSlotsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                        Checking workshop slot availability...
                                    </div>
                                ) : !slotMeta.isOpen ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: '#f87171', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                        {slotMeta.reason || 'Workshop is closed on this date. Please choose another operating day.'}
                                    </div>
                                ) : availableSlots.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                        No open slots available on this date.
                                    </div>
                                ) : (
                                    <div className="customer-slots-grid">
                                        {availableSlots.map((slot) => {
                                            const isSelected = bookingForm.start_time === slot.start_time && bookingForm.end_time === slot.end_time;
                                            const statusClass = slot.is_available
                                                ? isSelected ? 'selected' : 'available'
                                                : 'booked';

                                            return (
                                                <button
                                                    type="button"
                                                    key={slot.slot_id}
                                                    disabled={!slot.is_available}
                                                    className={`customer-slot-btn ${statusClass}`}
                                                    onClick={() => {
                                                        if (slot.is_available) {
                                                            setBookingForm((prev) => ({
                                                                ...prev,
                                                                start_time: slot.start_time,
                                                                end_time: slot.end_time,
                                                            }));
                                                        }
                                                    }}
                                                    title={slot.is_available ? 'Click to select this time' : 'Reserved / Unavailable'}
                                                >
                                                    <div>{slot.start_time} - {slot.end_time}</div>
                                                    <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>
                                                        {slot.is_available ? (isSelected ? '✓ Picked' : 'Available') : 'Booked'}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 5. Additional Notes */}
                            <div className="customer-form-group">
                                <label htmlFor="booking_notes">6. VEHICLE OBSERVATIONS / SYMPTOMS (OPTIONAL)</label>
                                <textarea
                                    id="booking_notes"
                                    rows="2"
                                    placeholder="Describe any issues you have noticed (e.g. unusual noise, vibrations, warning lights)..."
                                    value={bookingForm.customer_notes}
                                    onChange={(e) => setBookingForm((prev) => ({ ...prev, customer_notes: e.target.value }))}
                                />
                            </div>

                            <div className="customer-modal-footer">
                                <button
                                    type="button"
                                    className="btn-modal-cancel"
                                    onClick={() => setIsBookingModalOpen(false)}
                                    style={{ height: '38px', padding: '0 16px', background: 'none', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-book-appointment-header"
                                    disabled={
                                        isBookingSubmitting ||
                                        !bookingForm.start_time ||
                                        !bookingForm.vehicle_id ||
                                        Boolean(selectedVehicleObj?.has_active_booking)
                                    }
                                >
                                    {isBookingSubmitting
                                        ? 'Confirming...'
                                        : selectedVehicleObj?.has_active_booking
                                        ? '🔒 Vehicle Already Scheduled'
                                        : 'Book My Appointment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
