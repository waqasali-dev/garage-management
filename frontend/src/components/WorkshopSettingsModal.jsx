import React, { useState, useEffect, useMemo } from 'react';
import { useCurrency, CURRENCY_PRESETS } from '../context/CurrencyContext';
import { useNotification } from '../context/NotificationContext';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PercentIcon from '@mui/icons-material/Percent';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import './css/WorkshopSettingsModal.css';

const TAX_PRESETS = [
    { label: '0% (Tax Free)', val: 0 },
    { label: '5% (Standard VAT)', val: 5 },
    { label: '10% (VAT)', val: 10 },
    { label: '15% (VAT)', val: 15 },
];

const DAYS_OF_WEEK = [
    { id: 1, label: 'Mon', full: 'Monday' },
    { id: 2, label: 'Tue', full: 'Tuesday' },
    { id: 3, label: 'Wed', full: 'Wednesday' },
    { id: 4, label: 'Thu', full: 'Thursday' },
    { id: 5, label: 'Fri', full: 'Friday' },
    { id: 6, label: 'Sat', full: 'Saturday' },
    { id: 7, label: 'Sun', full: 'Sunday' },
];

const SCHEDULE_PRESETS = [
    {
        key: 'split_afternoon_3h',
        name: 'Split Shift (3h Afternoon Break)',
        desc: '8:00 AM – 1:00 PM & 4:00 PM – 8:00 PM',
        shifts: [
            { id: 'shift-1', start: '08:00', end: '13:00', label: 'Morning Shift' },
            { id: 'shift-2', start: '16:00', end: '20:00', label: 'Evening Shift' },
        ],
    },
    {
        key: 'full_day_continuous',
        name: 'Full Day Continuous (No Breaks)',
        desc: '8:00 AM – 6:00 PM Continuous',
        shifts: [
            { id: 'shift-1', start: '08:00', end: '18:00', label: 'Full Day Shift' },
        ],
    },
    {
        key: 'lunch_break_1h',
        name: 'Lunch Break (1h Break)',
        desc: '8:00 AM – 1:00 PM & 2:00 PM – 6:00 PM',
        shifts: [
            { id: 'shift-1', start: '08:00', end: '13:00', label: 'Morning Shift' },
            { id: 'shift-2', start: '14:00', end: '18:00', label: 'Afternoon Shift' },
        ],
    },
    {
        key: 'triple_shift_multi_break',
        name: 'Triple Window (2 Breaks)',
        desc: '8 AM – 12 PM, 1 PM – 5 PM, 6 PM – 9 PM',
        shifts: [
            { id: 'shift-1', start: '08:00', end: '12:00', label: 'Morning' },
            { id: 'shift-2', start: '13:00', end: '17:00', label: 'Afternoon' },
            { id: 'shift-3', start: '18:00', end: '21:00', label: 'Night Shift' },
        ],
    },
];

// Helper: Convert "HH:MM" to minutes from midnight
const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = String(timeStr).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Helper: Convert minutes from midnight to "HH:MM"
const minutesToTime = (minutes) => {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Helper: Format duration minutes into "Xh Ym"
const formatDuration = (mins) => {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
};

// Helper: Format "HH:MM" to readable 12-hour format e.g. "8:00 AM"
const format12Hour = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
};

export default function WorkshopSettingsModal({ isOpen, onClose, onSaved }) {
    const { settings, updateSettings } = useCurrency();
    const { showNotification } = useNotification();

    const [activeTab, setActiveTab] = useState('hours'); // 'hours' or 'billing'

    // Billing & Currency State
    const [taxPercentage, setTaxPercentage] = useState(5.0);
    const [currencyCode, setCurrencyCode] = useState('USD');
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [currencyDecimals, setCurrencyDecimals] = useState(2);
    const [recalculatePending, setRecalculatePending] = useState(true);

    // Workshop Working Hours State
    const [operatingDays, setOperatingDays] = useState([1, 2, 3, 4, 5, 6]);
    const [slotDuration, setSlotDuration] = useState(60);
    const [shifts, setShifts] = useState([
        { id: 'shift-1', start: '08:00', end: '13:00', label: 'Morning Shift' },
        { id: 'shift-2', start: '16:00', end: '20:00', label: 'Evening Shift' },
    ]);

    const [isSaving, setIsSaving] = useState(false);

    // Sync from settings on modal open
    useEffect(() => {
        if (isOpen && settings) {
            setTaxPercentage(settings.tax_percentage !== undefined ? settings.tax_percentage : 5.0);
            setCurrencyCode(settings.currency_code || 'USD');
            setCurrencySymbol(settings.currency_symbol || '$');
            setCurrencyDecimals(settings.currency_decimals !== undefined ? settings.currency_decimals : 2);
            setRecalculatePending(true);

            if (settings.working_hours) {
                if (Array.isArray(settings.working_hours.operating_days) && settings.working_hours.operating_days.length > 0) {
                    setOperatingDays(settings.working_hours.operating_days);
                }
                if (Array.isArray(settings.working_hours.shifts) && settings.working_hours.shifts.length > 0) {
                    setShifts(settings.working_hours.shifts);
                }
                if (settings.working_hours.slot_duration_minutes) {
                    setSlotDuration(parseInt(settings.working_hours.slot_duration_minutes, 10) || 60);
                }
            }
        }
    }, [isOpen, settings]);

    // Computed Breaks & Validations
    const { breaks, overlaps, totalWorkMinutes, totalBreakMinutes } = useMemo(() => {
        const sorted = [...shifts].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const calculatedBreaks = [];
        const detectedOverlaps = [];
        let workMins = 0;

        for (let i = 0; i < sorted.length; i++) {
            const cur = sorted[i];
            const startMin = timeToMinutes(cur.start);
            const endMin = timeToMinutes(cur.end);

            if (endMin > startMin) {
                workMins += (endMin - startMin);
            }

            if (i < sorted.length - 1) {
                const next = sorted[i + 1];
                const nextStartMin = timeToMinutes(next.start);

                if (endMin < nextStartMin) {
                    calculatedBreaks.push({
                        afterIndex: i,
                        start: cur.end,
                        end: next.start,
                        durationMinutes: nextStartMin - endMin,
                    });
                } else if (endMin > nextStartMin) {
                    detectedOverlaps.push({
                        shiftIndex: i,
                        shiftName: cur.label || `Shift ${i + 1}`,
                        nextShiftName: next.label || `Shift ${i + 2}`,
                        message: `Shift '${cur.label || i + 1}' (${cur.start} - ${cur.end}) overlaps with Shift '${next.label || i + 2}' (${next.start} - ${next.end})`,
                    });
                }
            }
        }

        const breakMins = calculatedBreaks.reduce((acc, b) => acc + b.durationMinutes, 0);

        return {
            breaks: calculatedBreaks,
            overlaps: detectedOverlaps,
            totalWorkMinutes: workMins,
            totalBreakMinutes: breakMins,
        };
    }, [shifts]);

    if (!isOpen) return null;

    // Shift Handlers
    const handleUpdateShift = (index, field, value) => {
        setShifts((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleAddShift = () => {
        setShifts((prev) => {
            const last = prev[prev.length - 1];
            let nextStart = '16:00';
            let nextEnd = '20:00';

            if (last && last.end) {
                const lastEndMin = timeToMinutes(last.end);
                // Smart default: add 1 hour break then 4 hours shift
                const proposedStartMin = Math.min(21 * 60, lastEndMin + 60);
                const proposedEndMin = Math.min(23 * 60 + 30, proposedStartMin + 240);
                nextStart = minutesToTime(proposedStartMin);
                nextEnd = minutesToTime(proposedEndMin);
            }

            return [
                ...prev,
                {
                    id: `shift-${Date.now()}`,
                    start: nextStart,
                    end: nextEnd,
                    label: `Shift ${prev.length + 1}`,
                },
            ];
        });
    };

    const handleRemoveShift = (index) => {
        if (shifts.length <= 1) {
            showNotification('At least one working shift is required.', 'warning');
            return;
        }
        setShifts((prev) => prev.filter((_, idx) => idx !== index));
    };

    const handleApplySchedulePreset = (preset) => {
        setShifts(preset.shifts);
        showNotification(`Applied preset: ${preset.name}`, 'info');
    };

    const handleToggleOperatingDay = (dayId) => {
        setOperatingDays((prev) => {
            if (prev.includes(dayId)) {
                if (prev.length === 1) {
                    showNotification('Workshop must have at least one operating day.', 'warning');
                    return prev;
                }
                return prev.filter((d) => d !== dayId);
            }
            return [...prev, dayId].sort((a, b) => a - b);
        });
    };

    // Currency Presets
    const handleSelectCurrencyPreset = (preset) => {
        setCurrencyCode(preset.code);
        setCurrencySymbol(preset.symbol);
        setCurrencyDecimals(preset.decimals);
    };

    const handleSelectTaxPreset = (val) => {
        setTaxPercentage(val);
    };

    // Live preview formatted sample for currency
    const sampleAmount = 250;
    const sampleDecimals = parseInt(currencyDecimals, 10) || 2;
    const formattedSample = sampleAmount.toLocaleString('en-US', {
        minimumFractionDigits: sampleDecimals,
        maximumFractionDigits: sampleDecimals,
    });
    const previewDisplay = ['$', '€', '£', '₹', '¥'].includes(currencySymbol)
        ? `${currencySymbol}${formattedSample}`
        : `${currencySymbol} ${formattedSample}`;

    const numTax = parseFloat(taxPercentage) || 0;
    const sampleTaxAmount = (sampleAmount * (numTax / 100.0)).toLocaleString('en-US', {
        minimumFractionDigits: sampleDecimals,
        maximumFractionDigits: sampleDecimals,
    });
    const sampleTotal = (sampleAmount * (1 + (numTax / 100.0))).toLocaleString('en-US', {
        minimumFractionDigits: sampleDecimals,
        maximumFractionDigits: sampleDecimals,
    });

    const handleSave = async (e) => {
        e.preventDefault();

        // 1. Validate shifts
        if (shifts.length === 0) {
            showNotification('Please configure at least one operating shift.', 'error');
            setActiveTab('hours');
            return;
        }

        for (let i = 0; i < shifts.length; i++) {
            const s = shifts[i];
            if (!s.start || !s.end) {
                showNotification(`Shift ${i + 1} must specify both start and end times.`, 'error');
                setActiveTab('hours');
                return;
            }
            if (s.start >= s.end) {
                showNotification(`Shift ${i + 1} (${s.label || 'Shift'}) end time must be after start time.`, 'error');
                setActiveTab('hours');
                return;
            }
        }

        if (overlaps.length > 0) {
            showNotification(overlaps[0].message, 'error');
            setActiveTab('hours');
            return;
        }

        if (operatingDays.length === 0) {
            showNotification('Please select at least one open day of the week.', 'error');
            setActiveTab('hours');
            return;
        }

        // 2. Validate billing
        const parsedTax = parseFloat(taxPercentage);
        if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
            showNotification('Tax percentage must be between 0% and 100%', 'error');
            setActiveTab('billing');
            return;
        }

        if (!currencyCode.trim()) {
            showNotification('Please provide a valid currency code (e.g. OMR, USD)', 'error');
            setActiveTab('billing');
            return;
        }

        try {
            setIsSaving(true);
            const sortedShifts = [...shifts].sort((a, b) => a.start.localeCompare(b.start));

            const payload = {
                tax_percentage: parsedTax,
                currency_code: currencyCode.trim().toUpperCase(),
                currency_symbol: currencySymbol.trim() || currencyCode.trim().toUpperCase(),
                currency_decimals: parseInt(currencyDecimals, 10) || 2,
                recalculate_pending: recalculatePending,
                working_hours: {
                    operating_days: operatingDays,
                    slot_duration_minutes: parseInt(slotDuration, 10) || 60,
                    shifts: sortedShifts.map((s, idx) => ({
                        id: s.id || `shift-${idx + 1}`,
                        start: s.start,
                        end: s.end,
                        label: s.label || `Shift ${idx + 1}`,
                    })),
                },
            };

            const result = await updateSettings(payload);

            const shiftsSummary = sortedShifts.map((s) => `${s.start}-${s.end}`).join(', ');
            showNotification(
                `Workshop settings saved! Shifts: ${shiftsSummary} (${breaks.length} break${breaks.length === 1 ? '' : 's'}). VAT: ${parsedTax}%.`,
                'success'
            );

            if (onSaved) {
                onSaved(result.data);
            }
            onClose();
        } catch (err) {
            showNotification(err.message || 'Failed to save workshop settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="settings-modal-header">
                    <div className="settings-header-left">
                        <div className="settings-header-icon-box">
                            <SettingsIcon />
                        </div>
                        <div>
                            <h3 className="settings-modal-title">Workshop Configuration & Settings</h3>
                            <p className="settings-modal-subtitle">
                                Configure daily operating shifts, workshop breaks, appointment slots, and currency/VAT.
                            </p>
                        </div>
                    </div>
                    <button type="button" className="settings-close-btn" onClick={onClose} aria-label="Close">
                        <CloseIcon fontSize="small" />
                    </button>
                </div>

                {/* Top Navigation Tabs */}
                <div className="settings-tab-nav">
                    <button
                        type="button"
                        className={`settings-tab-btn ${activeTab === 'hours' ? 'active' : ''}`}
                        onClick={() => setActiveTab('hours')}
                    >
                        <AccessTimeIcon style={{ fontSize: '18px' }} />
                        <span>Operating Hours & Breaks</span>
                        <span className="settings-tab-counter font-mono">{shifts.length} Shifts</span>
                    </button>
                    <button
                        type="button"
                        className={`settings-tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
                        onClick={() => setActiveTab('billing')}
                    >
                        <MonetizationOnIcon style={{ fontSize: '18px' }} />
                        <span>Currency & Tax (VAT)</span>
                        <span className="settings-tab-counter font-mono">{currencyCode}</span>
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSave} className="settings-modal-body">
                    {activeTab === 'hours' && (
                        <div className="settings-tab-content">
                            {/* Section: Operating Days */}
                            <div className="settings-section-card">
                                <div className="settings-section-head">
                                    <div className="settings-section-title-wrap">
                                        <CalendarTodayIcon className="settings-section-icon" />
                                        <h4 className="settings-section-title">Weekly Operating Days</h4>
                                    </div>
                                    <span className="settings-section-badge font-mono">
                                        Open {operatingDays.length} / 7 Days
                                    </span>
                                </div>

                                <p className="settings-section-description">
                                    Select which days of the week the workshop is open for car intake, diagnostics, and appointments:
                                </p>

                                <div className="settings-days-grid">
                                    {DAYS_OF_WEEK.map((d) => {
                                        const isOpenDay = operatingDays.includes(d.id);
                                        return (
                                            <button
                                                type="button"
                                                key={d.id}
                                                className={`settings-day-pill ${isOpenDay ? 'active' : ''}`}
                                                onClick={() => handleToggleOperatingDay(d.id)}
                                                title={d.full}
                                            >
                                                <span className="day-name">{d.label}</span>
                                                <span className="day-status">{isOpenDay ? 'OPEN' : 'CLOSED'}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="settings-quick-links-row">
                                    <button
                                        type="button"
                                        className="settings-text-btn"
                                        onClick={() => setOperatingDays([1, 2, 3, 4, 5, 6])}
                                    >
                                        Mon – Sat (Standard)
                                    </button>
                                    <span>•</span>
                                    <button
                                        type="button"
                                        className="settings-text-btn"
                                        onClick={() => setOperatingDays([1, 2, 3, 4, 5])}
                                    >
                                        Mon – Fri (Weekdays)
                                    </button>
                                    <span>•</span>
                                    <button
                                        type="button"
                                        className="settings-text-btn"
                                        onClick={() => setOperatingDays([1, 2, 3, 4, 5, 6, 7])}
                                    >
                                        All 7 Days
                                    </button>
                                </div>
                            </div>

                            {/* Section: Working Shift Windows & Breaks */}
                            <div className="settings-section-card">
                                <div className="settings-section-head">
                                    <div className="settings-section-title-wrap">
                                        <AccessTimeIcon className="settings-section-icon" />
                                        <h4 className="settings-section-title">Operating Shifts & Multiple Breaks</h4>
                                    </div>
                                    <div className="settings-badge-group">
                                        <span className="settings-section-badge font-mono">
                                            {shifts.length} Shift Window{shifts.length === 1 ? '' : 's'}
                                        </span>
                                        {breaks.length > 0 && (
                                            <span className="settings-section-badge badge-break font-mono">
                                                ☕ {breaks.length} Break{breaks.length === 1 ? '' : 's'} ({formatDuration(totalBreakMinutes)})
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <p className="settings-section-description">
                                    Define one or multiple operating shifts. Any time between consecutive shifts is automatically treated as a <strong>Workshop Break</strong> (closed for bay booking & customer appointments).
                                </p>

                                {/* Quick Schedule Templates */}
                                <div className="settings-templates-label">Quick Schedule Presets:</div>
                                <div className="settings-preset-chips">
                                    {SCHEDULE_PRESETS.map((preset) => (
                                        <button
                                            type="button"
                                            key={preset.key}
                                            className="settings-chip-btn"
                                            onClick={() => handleApplySchedulePreset(preset)}
                                            title={preset.desc}
                                        >
                                            <span>⚡</span>
                                            <span>{preset.name}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Shift Rows List with Interspersed Breaks */}
                                <div className="shifts-list-container">
                                    {shifts.map((shift, idx) => {
                                        const startMin = timeToMinutes(shift.start);
                                        const endMin = timeToMinutes(shift.end);
                                        const shiftDurationMins = Math.max(0, endMin - startMin);

                                        // Break after this shift if not the last one
                                        const matchingBreak = breaks.find((b) => b.afterIndex === idx);

                                        return (
                                            <React.Fragment key={shift.id || idx}>
                                                <div className="shift-card-row">
                                                    <div className="shift-card-header">
                                                        <div className="shift-card-tag">
                                                            <span className="shift-tag-dot" />
                                                            <span>Shift {idx + 1}</span>
                                                        </div>
                                                        <input
                                                            type="text"
                                                            className="shift-label-input"
                                                            value={shift.label || ''}
                                                            onChange={(e) => handleUpdateShift(idx, 'label', e.target.value)}
                                                            placeholder={`e.g. ${idx === 0 ? 'Morning Shift' : 'Evening Shift'}`}
                                                        />
                                                        <div className="shift-duration-badge font-mono">
                                                            {formatDuration(shiftDurationMins)}
                                                        </div>
                                                        {shifts.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="shift-delete-btn"
                                                                onClick={() => handleRemoveShift(idx)}
                                                                title="Remove shift window"
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="shift-inputs-grid">
                                                        <div className="shift-input-group">
                                                            <label>Start Time (24h)</label>
                                                            <input
                                                                type="time"
                                                                className="settings-input font-mono"
                                                                value={shift.start || ''}
                                                                onChange={(e) => handleUpdateShift(idx, 'start', e.target.value)}
                                                                required
                                                            />
                                                            <span className="shift-subtext font-mono">
                                                                {format12Hour(shift.start)}
                                                            </span>
                                                        </div>

                                                        <div className="shift-input-group">
                                                            <label>End Time (24h)</label>
                                                            <input
                                                                type="time"
                                                                className="settings-input font-mono"
                                                                value={shift.end || ''}
                                                                onChange={(e) => handleUpdateShift(idx, 'end', e.target.value)}
                                                                required
                                                            />
                                                            <span className="shift-subtext font-mono">
                                                                {format12Hour(shift.end)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inter-Shift Break Banner */}
                                                {matchingBreak && (
                                                    <div className="shift-break-banner">
                                                        <div className="break-icon-wrap">☕</div>
                                                        <div className="break-info">
                                                            <div className="break-title font-mono">
                                                                Workshop Break: {format12Hour(matchingBreak.start)} – {format12Hour(matchingBreak.end)} ({formatDuration(matchingBreak.durationMinutes)} break)
                                                            </div>
                                                            <div className="break-sub">
                                                                Workshop closed for customer appointments & bay scheduling during this period.
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Overlap Warning Notice */}
                                {overlaps.length > 0 && (
                                    <div className="shift-overlap-alert">
                                        <strong>⚠️ Timing Conflict:</strong> {overlaps[0].message}. Shifts must not overlap.
                                    </div>
                                )}

                                {/* Add Shift Button */}
                                <button
                                    type="button"
                                    className="settings-btn-add-shift"
                                    onClick={handleAddShift}
                                >
                                    <AddIcon style={{ fontSize: '18px' }} />
                                    <span>Add Another Operating Shift / Timing Window</span>
                                </button>

                                {/* Timeline Visualizer */}
                                <div className="schedule-timeline-container">
                                    <div className="timeline-title-row">
                                        <span className="timeline-label">Visual 24h Schedule Timeline:</span>
                                        <span className="timeline-stats font-mono">
                                            {formatDuration(totalWorkMinutes)} Active • {formatDuration(totalBreakMinutes)} Breaks
                                        </span>
                                    </div>

                                    {/* Bar representation */}
                                    <div className="timeline-bar-track">
                                        {/* Shift segments */}
                                        {shifts.map((s, i) => {
                                            const sMin = timeToMinutes(s.start);
                                            const eMin = timeToMinutes(s.end);
                                            const dayStart = 6 * 60; // 06:00
                                            const dayTotal = 18 * 60; // 18 hours span (06:00 to 24:00)

                                            const leftPct = Math.max(0, Math.min(100, ((sMin - dayStart) / dayTotal) * 100));
                                            const widthPct = Math.max(2, Math.min(100 - leftPct, ((eMin - sMin) / dayTotal) * 100));

                                            return (
                                                <div
                                                    key={`bar-${i}`}
                                                    className="timeline-shift-segment"
                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                    title={`${s.label || `Shift ${i + 1}`}: ${s.start} - ${s.end}`}
                                                >
                                                    <span>{s.start} - {s.end}</span>
                                                </div>
                                            );
                                        })}

                                        {/* Break segments */}
                                        {breaks.map((b, i) => {
                                            const sMin = timeToMinutes(b.start);
                                            const eMin = timeToMinutes(b.end);
                                            const dayStart = 6 * 60;
                                            const dayTotal = 18 * 60;

                                            const leftPct = Math.max(0, Math.min(100, ((sMin - dayStart) / dayTotal) * 100));
                                            const widthPct = Math.max(1, Math.min(100 - leftPct, ((eMin - sMin) / dayTotal) * 100));

                                            return (
                                                <div
                                                    key={`break-${i}`}
                                                    className="timeline-break-segment"
                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                    title={`Break: ${b.start} - ${b.end} (${formatDuration(b.durationMinutes)})`}
                                                >
                                                    <span>☕ Break</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Timeline Hour Marks */}
                                    <div className="timeline-markers-row font-mono">
                                        <span>06:00</span>
                                        <span>09:00</span>
                                        <span>12:00</span>
                                        <span>15:00</span>
                                        <span>18:00</span>
                                        <span>21:00</span>
                                        <span>24:00</span>
                                    </div>
                                </div>

                                {/* Slot Duration Selector */}
                                <div className="settings-form-row" style={{ marginTop: '16px' }}>
                                    <div className="settings-field-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Standard Appointment Slot Duration</label>
                                        <select
                                            className="settings-select font-mono"
                                            value={slotDuration}
                                            onChange={(e) => setSlotDuration(parseInt(e.target.value, 10))}
                                        >
                                            <option value="30">30 Minutes (Quick Services & Oil Change)</option>
                                            <option value="45">45 Minutes</option>
                                            <option value="60">60 Minutes (Standard 1 Hour Slots)</option>
                                            <option value="90">90 Minutes (1.5 Hours)</option>
                                            <option value="120">120 Minutes (2 Hours Major Repairs)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'billing' && (
                        <div className="settings-tab-content">
                            {/* Section 1: Currency Configuration */}
                            <div className="settings-section-card">
                                <div className="settings-section-head">
                                    <div className="settings-section-title-wrap">
                                        <MonetizationOnIcon className="settings-section-icon" />
                                        <h4 className="settings-section-title">Currency Configuration</h4>
                                    </div>
                                    <span className="settings-section-badge">Active: {currencyCode} ({currencySymbol})</span>
                                </div>

                                {/* Presets */}
                                <div className="settings-preset-chips">
                                    {CURRENCY_PRESETS.map((preset) => {
                                        const isCurrent = currencyCode.toUpperCase() === preset.code.toUpperCase();
                                        return (
                                            <button
                                                type="button"
                                                key={preset.code}
                                                className={`settings-chip-btn ${isCurrent ? 'active' : ''}`}
                                                onClick={() => handleSelectCurrencyPreset(preset)}
                                                title={preset.name}
                                            >
                                                <span>{preset.symbol}</span>
                                                <span>{preset.code}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Manual Overrides */}
                                <div className="settings-form-row">
                                    <div className="settings-field-group">
                                        <label>Currency Code</label>
                                        <input
                                            type="text"
                                            className="settings-input font-mono"
                                            value={currencyCode}
                                            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                                            placeholder="e.g. OMR, USD"
                                            maxLength={10}
                                            required
                                        />
                                    </div>

                                    <div className="settings-field-group">
                                        <label>Display Symbol</label>
                                        <input
                                            type="text"
                                            className="settings-input font-mono"
                                            value={currencySymbol}
                                            onChange={(e) => setCurrencySymbol(e.target.value)}
                                            placeholder="e.g. OMR, $"
                                            maxLength={10}
                                            required
                                        />
                                    </div>

                                    <div className="settings-field-group">
                                        <label>Decimal Digits</label>
                                        <select
                                            className="settings-select font-mono"
                                            value={currencyDecimals}
                                            onChange={(e) => setCurrencyDecimals(parseInt(e.target.value, 10))}
                                        >
                                            <option value="2">2 Decimals (e.g. 10.00)</option>
                                            <option value="3">3 Decimals (e.g. 10.000 - OMR / KWD)</option>
                                            <option value="0">0 Decimals (e.g. 10)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Live Currency Preview */}
                                <div className="settings-preview-banner">
                                    <span className="settings-preview-label">
                                        <VisibilityIcon style={{ fontSize: '16px' }} />
                                        <span>Preview Across App (e.g. Parts, Total, Invoices):</span>
                                    </span>
                                    <span className="settings-preview-value font-mono">{previewDisplay}</span>
                                </div>
                            </div>

                            {/* Section 2: Tax Percentage (VAT) */}
                            <div className="settings-section-card">
                                <div className="settings-section-head">
                                    <div className="settings-section-title-wrap">
                                        <PercentIcon className="settings-section-icon" />
                                        <h4 className="settings-section-title">Workshop Tax Rate (VAT)</h4>
                                    </div>
                                    <span className="settings-section-badge font-mono">VAT ({taxPercentage}%)</span>
                                </div>

                                {/* Tax Presets */}
                                <div className="settings-preset-chips">
                                    {TAX_PRESETS.map((preset) => {
                                        const isCurrent = parseFloat(taxPercentage) === preset.val;
                                        return (
                                            <button
                                                type="button"
                                                key={preset.val}
                                                className={`settings-chip-btn ${isCurrent ? 'active' : ''}`}
                                                onClick={() => handleSelectTaxPreset(preset.val)}
                                            >
                                                <span>{preset.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="settings-form-row">
                                    <div className="settings-field-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Tax Percentage (0% to 100%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            className="settings-input font-mono"
                                            value={taxPercentage}
                                            onChange={(e) => setTaxPercentage(e.target.value)}
                                            placeholder="e.g. 5.00"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Tax Calculation Live Breakdown */}
                                <div className="settings-preview-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                                        <span>Sample Subtotal:</span>
                                        <span className="font-mono">{currencySymbol} {formattedSample}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffd85f' }}>
                                        <span>Calculated VAT ({numTax}%):</span>
                                        <span className="font-mono">{currencySymbol} {sampleTaxAmount}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#ffffff', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                                        <span>Sample Gross Invoice Total:</span>
                                        <span className="font-mono" style={{ color: '#ffd85f' }}>{currencySymbol} {sampleTotal}</span>
                                    </div>
                                </div>

                                {/* Recalculate pending invoices toggle */}
                                <label className="settings-checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={recalculatePending}
                                        onChange={(e) => setRecalculatePending(e.target.checked)}
                                    />
                                    <div className="settings-checkbox-text">
                                        <strong>Recalculate Pending Invoices</strong>
                                        <span className="settings-checkbox-sub">
                                            Automatically adjust tax and totals for pending work orders to match this new tax rate immediately in the Invoices table. Paid invoices remain locked.
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="settings-modal-footer">
                        <button
                            type="button"
                            className="settings-btn-cancel"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="settings-btn-save"
                            disabled={isSaving || overlaps.length > 0}
                        >
                            {isSaving ? (
                                <>
                                    <span className="settings-spinner" />
                                    <span>Saving Settings...</span>
                                </>
                            ) : (
                                <>
                                    <SettingsIcon style={{ fontSize: '18px' }} />
                                    <span>Apply & Save Workshop Settings</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
