import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './css/VehicleIntake.css';

export default function VehicleIntake() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [formData, setFormData] = useState({
        vin: '',
        make: '',
        model: '',
        year: '',
        licensePlate: '',
        ownerSearch: '',
        fullName: '',
        phone: '',
        email: '',
        notes: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('Submitting Intake Data:', formData);
    };

    return (
        <div className="intake-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Content Viewport */}
            <div className="intake-wrapper">
                {/* Top App Bar Header */}
                <header className="intake-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="header-title">New Vehicle Intake</h2>
                    </div>

                    <div className="header-right">
                        <button className="icon-btn" aria-label="Notifications">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Form Canvas */}
                <main className="intake-main">
                    <form id="intakeForm" onSubmit={handleSubmit} className="intake-grid">
                        {/* Section 1: Vehicle Identification */}
                        <section className="intake-card col-span-8">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    directions_car
                                </span>
                                <h3>Vehicle Identification</h3>
                            </div>

                            <div className="form-grid">
                                {/* VIN Input */}
                                <div className="form-group col-span-12">
                                    <label htmlFor="vin">VIN (Vehicle Identification Number)</label>
                                    <div className="input-with-action">
                                        <input
                                            type="text"
                                            id="vin"
                                            name="vin"
                                            maxLength={17}
                                            placeholder="ENTER 17-CHARACTER VIN"
                                            value={formData.vin}
                                            onChange={handleChange}
                                            className="uppercase-input font-mono"
                                            required
                                        />
                                        <button type="button" className="input-action-btn" aria-label="Scan VIN">
                                            <span className="material-symbols-outlined">document_scanner</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Make */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="make">MAKE</label>
                                    <input
                                        type="text"
                                        id="make"
                                        name="make"
                                        placeholder="e.g., Toyota"
                                        value={formData.make}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                {/* Model */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="model">MODEL</label>
                                    <input
                                        type="text"
                                        id="model"
                                        name="model"
                                        placeholder="e.g., Camry"
                                        value={formData.model}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                {/* Year */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="year">YEAR</label>
                                    <input
                                        type="number"
                                        id="year"
                                        name="year"
                                        placeholder="YYYY"
                                        value={formData.year}
                                        onChange={handleChange}
                                        className="font-mono"
                                        required
                                    />
                                </div>

                                {/* License Plate */}
                                <div className="form-group col-span-6">
                                    <label htmlFor="licensePlate">LICENSE PLATE</label>
                                    <input
                                        type="text"
                                        id="licensePlate"
                                        name="licensePlate"
                                        placeholder="ENTER PLATE NUMBER"
                                        value={formData.licensePlate}
                                        onChange={handleChange}
                                        className="uppercase-input font-mono"
                                        required
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Owner Details */}
                        <section className="intake-card col-span-4">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    person
                                </span>
                                <h3>Owner Details</h3>
                            </div>

                            {/* Existing Owner Search */}
                            <div className="form-group search-group">
                                <span className="material-symbols-outlined search-icon">search</span>
                                <input
                                    type="text"
                                    name="ownerSearch"
                                    placeholder="Search existing owner..."
                                    value={formData.ownerSearch}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="divider">
                                <span>OR ADD NEW</span>
                            </div>

                            <div className="form-stack">
                                <div className="form-group">
                                    <label htmlFor="fullName">FULL NAME</label>
                                    <input
                                        type="text"
                                        id="fullName"
                                        name="fullName"
                                        placeholder="First Last"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="phone">PHONE NUMBER</label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        placeholder="(555) 000-0000"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">EMAIL ADDRESS</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="owner@example.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Notes & Media */}
                        <section className="intake-card col-span-12">
                            <div className="card-header">
                                <span className="material-symbols-outlined header-icon">
                                    notes
                                </span>
                                <h3>Intake Notes & Media</h3>
                            </div>

                            <div className="media-grid">
                                {/* Notes Column */}
                                <div className="form-group notes-group">
                                    <label htmlFor="notes">INITIAL OBSERVATIONS</label>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        placeholder="Describe reason for visit, visible damage, or customer concerns..."
                                        value={formData.notes}
                                        onChange={handleChange}
                                    />
                                </div>

                                {/* Photos Column */}
                                <div className="form-group">
                                    <label>VEHICLE CONDITION PHOTOS</label>
                                    <div className="photo-upload-grid">
                                        <button type="button" className="photo-upload-btn">
                                            <span className="material-symbols-outlined">add_a_photo</span>
                                            <span>UPLOAD</span>
                                        </button>
                                        <div className="photo-placeholder">
                                            <span className="material-symbols-outlined">image</span>
                                        </div>
                                        <div className="photo-placeholder">
                                            <span className="material-symbols-outlined">image</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </form>
                </main>

                {/* Sticky Action Bar */}
                <footer className="intake-sticky-footer">
                    <div className="footer-actions">
                        <button type="button" className="cancel-btn">
                            Cancel
                        </button>
                        <button type="submit" form="intakeForm" className="submit-btn">
                            <span className="material-symbols-outlined">save</span>
                            <span>Save & Create Work Order</span>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}