import React, { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import './css/WorkOrderDetails.css';

const INITIAL_ITEMS = [
    {
        id: 1,
        type: 'PART',
        description: 'Front Lower Control Arm',
        sku: 'SKU: LCA-FR-092',
        qty: 1.0,
        unitPrice: 285.0,
    },
    {
        id: 2,
        type: 'LABOR',
        description: 'Suspension Component Replacement',
        sku: 'Tech: Mike R.',
        qty: 2.5,
        unitPrice: 120.0,
    },
];

const INITIAL_TIMELINE = [
    {
        id: 1,
        time: 'Today, 10:45 AM',
        text: 'Work Order status changed to In Progress.',
        author: 'By: System / Mike R.',
        isLatest: true,
    },
    {
        id: 2,
        time: 'Today, 09:15 AM',
        text: 'Estimate approved by customer via SMS link.',
        author: '',
        isLatest: false,
    },
    {
        id: 3,
        time: 'Yesterday, 04:30 PM',
        text: 'Diagnostic completed. Estimate generated.',
        author: '',
        isLatest: false,
    },
    {
        id: 4,
        time: 'Yesterday, 08:00 AM',
        text: 'Vehicle dropped off. Keys in lockbox B.',
        author: '',
        isLatest: false,
    },
];

export default function WorkOrderDetails() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    const params = useParams();

    const passedOrder = location.state?.order;
    const orderIdDisplay = passedOrder?.id || (params.id ? `#${params.id}` : 'WO-2023-0842');
    const vehicleDisplay = passedOrder?.vehicle || '2019 Tesla Model 3';
    const ownerDisplay = passedOrder?.owner || 'John Doe';
    const vinDisplay = passedOrder?.vin || 'VIN: 5YJ3E1EA5KFXXXXXX';

    const [items] = useState(INITIAL_ITEMS);
    const [timeline, setTimeline] = useState(INITIAL_TIMELINE);
    const [noteText, setNoteText] = useState('');

    // Financial calculations
    const subtotal = items.reduce(
        (sum, item) => sum + item.qty * item.unitPrice,
        0
    );
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    const handleAddNote = (e) => {
        e.preventDefault();
        if (!noteText.trim()) return;

        const newNote = {
            id: Date.now(),
            time: 'Just now',
            text: noteText,
            author: 'By: Admin Terminal',
            isLatest: true,
        };

        setTimeline((prev) => [
            newNote,
            ...prev.map((t) => ({ ...t, isLatest: false })),
        ]);
        setNoteText('');
    };

    return (
        <div className="wo-details-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport */}
            <div className="wo-details-wrapper">
                {/* Mobile Header Bar */}
                <header className="details-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">Work Order Details</h2>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Workspace */}
                <main className="details-main">
                    <div className="content-container">
                        {/* Top Page Control Header */}
                        <div className="page-header-row">
                            <div className="title-stack">
                                <div className="title-inline">
                                    <Link to="/work-orders" className="back-btn" aria-label="Go back">
                                        <span className="material-symbols-outlined">arrow_back</span>
                                    </Link>
                                    <h2 className="order-id">{orderIdDisplay}</h2>
                                    <span className="badge badge-warning font-mono">IN PROGRESS</span>
                                </div>
                                <p className="order-meta-desc">
                                    {vehicleDisplay} • {ownerDisplay} • {vinDisplay}
                                </p>
                            </div>

                            <div className="page-actions">
                                <button type="button" className="secondary-btn">
                                    Print / Export
                                </button>
                                <button type="button" className="primary-btn">
                                    Release Car
                                </button>
                            </div>
                        </div>

                        {/* Active Repair Status Stepper */}
                        <section className="stepper-card">
                            <h3 className="section-title">Repair Status</h3>
                            <div className="stepper-track">
                                {/* Connecting background progress line */}
                                <div className="stepper-line-bg"></div>
                                <div className="stepper-line-fill" style={{ width: '70%' }}></div>

                                {/* Step 1 */}
                                <div className="step-item completed">
                                    <div className="step-icon">
                                        <span className="material-symbols-outlined">check</span>
                                    </div>
                                    <span className="step-label">Received</span>
                                </div>

                                {/* Step 2 */}
                                <div className="step-item completed">
                                    <div className="step-icon">
                                        <span className="material-symbols-outlined">check</span>
                                    </div>
                                    <span className="step-label">Diagnosed</span>
                                </div>

                                {/* Step 3 */}
                                <div className="step-item completed">
                                    <div className="step-icon">
                                        <span className="material-symbols-outlined">check</span>
                                    </div>
                                    <span className="step-label">Approved</span>
                                </div>

                                {/* Step 4 (Active) */}
                                <div className="step-item active">
                                    <div className="step-icon pulse-glow">
                                        <span className="material-symbols-outlined">build</span>
                                    </div>
                                    <span className="step-label active-text">In Progress</span>
                                </div>

                                {/* Step 5 */}
                                <div className="step-item disabled">
                                    <div className="step-icon">
                                        <span className="material-symbols-outlined">directions_car</span>
                                    </div>
                                    <span className="step-label">Ready</span>
                                </div>
                            </div>
                        </section>

                        {/* Two Column Grid Section */}
                        <div className="details-grid">
                            {/* Left Column (Required Work & Items Table) */}
                            <div className="left-column">
                                {/* Required Work Card */}
                                <article className="info-card">
                                    <div className="card-header-row">
                                        <h3>Required Work</h3>
                                        <button className="icon-edit-btn" aria-label="Edit Required Work">
                                            <span className="material-symbols-outlined">edit</span>
                                        </button>
                                    </div>
                                    <p className="work-description">
                                        Customer reports knocking sound from front right suspension when turning left at low speeds. Diagnostic confirms worn lower control arm bushing and slight play in the tie rod end. Recommend replacing lower control arm assembly and tie rod end, followed by a full 4-wheel alignment.
                                    </p>
                                </article>

                                {/* Parts & Labor Breakdown Card */}
                                <article className="info-card">
                                    <div className="card-header-row">
                                        <h3>Parts & Labor</h3>
                                        <div className="header-btn-group">
                                            <button type="button" className="secondary-btn-sm">
                                                <span className="material-symbols-outlined">add</span> Part
                                            </button>
                                            <button type="button" className="primary-btn-sm">
                                                Submit Estimate
                                            </button>
                                        </div>
                                    </div>

                                    <div className="table-responsive">
                                        <table className="breakdown-table">
                                            <thead>
                                                <tr>
                                                    <th>Type</th>
                                                    <th>Description / SKU</th>
                                                    <th className="text-right">Qty/Hrs</th>
                                                    <th className="text-right">Unit Price</th>
                                                    <th className="text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item) => (
                                                    <tr key={item.id} className="table-row">
                                                        <td>
                                                            <span
                                                                className={`type-tag ${item.type === 'PART' ? 'tag-part' : 'tag-labor'
                                                                    }`}
                                                            >
                                                                {item.type}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="item-title">{item.description}</div>
                                                            <div className="item-sku font-mono">{item.sku}</div>
                                                        </td>
                                                        <td className="text-right font-mono">{item.qty.toFixed(1)}</td>
                                                        <td className="text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                                                        <td className="text-right font-mono highlight">
                                                            ${(item.qty * item.unitPrice).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan="3"></td>
                                                    <td className="text-right text-muted font-mono">Subtotal</td>
                                                    <td className="text-right font-mono">${subtotal.toFixed(2)}</td>
                                                </tr>
                                                <tr>
                                                    <td colSpan="3"></td>
                                                    <td className="text-right text-muted font-mono">Tax (8%)</td>
                                                    <td className="text-right font-mono">${tax.toFixed(2)}</td>
                                                </tr>
                                                <tr className="total-row">
                                                    <td colSpan="3"></td>
                                                    <td className="text-right total-label font-mono">Total</td>
                                                    <td className="text-right total-amount font-mono">${total.toFixed(2)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </article>
                            </div>

                            {/* Right Column (Activity Timeline & Notes) */}
                            <div className="right-column">
                                <article className="info-card timeline-card">
                                    <h3>Activity Log</h3>

                                    <div className="timeline-wrapper">
                                        {timeline.map((entry) => (
                                            <div
                                                key={entry.id}
                                                className={`timeline-row ${entry.isLatest ? 'is-latest' : ''}`}
                                            >
                                                <span className="timeline-node"></span>
                                                <span className="timeline-timestamp font-mono">{entry.time}</span>
                                                <div className="timeline-box">
                                                    <p className="timeline-text">{entry.text}</p>
                                                    {entry.author && (
                                                        <span className="timeline-author">{entry.author}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <form onSubmit={handleAddNote} className="note-form">
                                        <input
                                            type="text"
                                            placeholder="Add internal note..."
                                            value={noteText}
                                            onChange={(e) => setNoteText(e.target.value)}
                                        />
                                        <button type="submit" aria-label="Send note">
                                            <span className="material-symbols-outlined">send</span>
                                        </button>
                                    </form>
                                </article>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}