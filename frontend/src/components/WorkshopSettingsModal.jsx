import React, { useState, useEffect } from 'react';
import { useCurrency, CURRENCY_PRESETS } from '../context/CurrencyContext';
import { useNotification } from '../context/NotificationContext';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PercentIcon from '@mui/icons-material/Percent';
import VisibilityIcon from '@mui/icons-material/Visibility';
import './css/WorkshopSettingsModal.css';

const TAX_PRESETS = [
    { label: '0% (Tax Free)', val: 0 },
    { label: '5% (Standard VAT)', val: 5 },
    { label: '10% (VAT)', val: 10 },
    { label: '15% (VAT)', val: 15 },
];

export default function WorkshopSettingsModal({ isOpen, onClose, onSaved }) {
    const { settings, updateSettings } = useCurrency();
    const { showNotification } = useNotification();

    const [taxPercentage, setTaxPercentage] = useState(5.0);
    const [currencyCode, setCurrencyCode] = useState('USD');
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [currencyDecimals, setCurrencyDecimals] = useState(2);
    const [recalculatePending, setRecalculatePending] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Sync from settings on open
    useEffect(() => {
        if (isOpen && settings) {
            setTaxPercentage(settings.tax_percentage !== undefined ? settings.tax_percentage : 5.0);
            setCurrencyCode(settings.currency_code || 'USD');
            setCurrencySymbol(settings.currency_symbol || '$');
            setCurrencyDecimals(settings.currency_decimals !== undefined ? settings.currency_decimals : 2);
            setRecalculatePending(true);
        }
    }, [isOpen, settings]);

    if (!isOpen) return null;

    const handleSelectCurrencyPreset = (preset) => {
        setCurrencyCode(preset.code);
        setCurrencySymbol(preset.symbol);
        setCurrencyDecimals(preset.decimals);
    };

    const handleSelectTaxPreset = (val) => {
        setTaxPercentage(val);
    };

    // Live preview formatted sample
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
        const parsedTax = parseFloat(taxPercentage);
        if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
            showNotification('Tax percentage must be between 0% and 100%', 'error');
            return;
        }

        if (!currencyCode.trim()) {
            showNotification('Please provide a valid currency code (e.g. OMR, USD)', 'error');
            return;
        }

        try {
            setIsSaving(true);
            const result = await updateSettings({
                tax_percentage: parsedTax,
                currency_code: currencyCode.trim().toUpperCase(),
                currency_symbol: currencySymbol.trim() || currencyCode.trim().toUpperCase(),
                currency_decimals: parseInt(currencyDecimals, 10) || 2,
                recalculate_pending: recalculatePending,
            });

            showNotification(
                `Settings saved! Active VAT: ${parsedTax}%, Currency: ${currencyCode.trim().toUpperCase()}${result.recalculatedCount ? ` (${result.recalculatedCount} pending invoices recalculated)` : ''}`,
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
                            <h3 className="settings-modal-title">Workshop Billing & Currency Settings</h3>
                            <p className="settings-modal-subtitle">
                                Configure global currency format, default tax rate (VAT), and automatic ledger updates.
                            </p>
                        </div>
                    </div>
                    <button type="button" className="settings-close-btn" onClick={onClose} aria-label="Close">
                        <CloseIcon fontSize="small" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSave} className="settings-modal-body">
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
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <span className="settings-spinner" />
                                    <span>Saving Settings...</span>
                                </>
                            ) : (
                                <>
                                    <SettingsIcon style={{ fontSize: '18px' }} />
                                    <span>Apply & Save Settings</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
