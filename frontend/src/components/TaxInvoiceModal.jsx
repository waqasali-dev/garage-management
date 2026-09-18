import React, { useState } from 'react';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { useAuth } from '../context/AuthContext';
import './css/TaxInvoiceModal.css';

export default function TaxInvoiceModal({ invoice, onClose }) {
    const { isOwner } = useAuth();
    const [copied, setCopied] = useState(false);
    const [taxPercentage, setTaxPercentage] = useState(() => {
        if (invoice?.tax_percentage !== undefined && invoice?.tax_percentage !== null) {
            return parseFloat(invoice.tax_percentage) || 0;
        }
        return 5; // Default is 5%
    });

    if (!invoice) return null;

    const handlePrint = () => {
        window.print();
    };

    // Customer & Vehicle data resolution
    const ownerName = invoice.owner_name || invoice.full_name || 'Valued Customer';
    const ownerPhone = invoice.owner_phone || invoice.phone_number || '--';
    const vehiclePlate = invoice.license_plate || '--';
    const vehicleModel = `${invoice.year || ''} ${invoice.make || ''} ${invoice.model || ''}`.trim() || 'Vehicle';
    const vehicleVin = invoice.vin ? `${invoice.vin}` : '196320 Kms';
    const invoiceId = invoice.invoice_id || `INV-${invoice.work_order_id || '82-4756'}`;
    const dateIssued = invoice.date_issued || new Date().toISOString().split('T')[0];

    // Format date as DD-MM-YY
    const dateParts = dateIssued.split('-');
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0].slice(2)}` : dateIssued;

    // Items list resolution
    const rawItems = invoice.items || [];
    const items = rawItems.length > 0 ? rawItems : [
        {
            item_id: 1,
            description: invoice.initial_observations || 'Comprehensive Vehicle Repair & Diagnostic Service',
            quantity_or_hours: 1,
            unit_price: parseFloat(invoice.subtotal || invoice.total_cost || invoice.total_amount || 18.00),
            total_price: parseFloat(invoice.subtotal || invoice.total_cost || invoice.total_amount || 18.00),
        }
    ];

    // Calculate line items breakdown with customizable VAT rate (Default 5%)
    // Base unit price is exclusive of tax; Tax is generated ON TOP of the base price.
    const currentTaxRate = (parseFloat(taxPercentage) || 0) / 100;
    let totalExclVatSum = 0;
    let totalVatSum = 0;
    let totalInclVatSum = 0;
    let totalQtySum = 0;

    const tableRows = items.map((item, index) => {
        const qty = parseFloat(item.quantity_or_hours || 1);
        const unitPriceBase = parseFloat(
            item.unit_price !== undefined && item.unit_price !== null
                ? item.unit_price
                : (item.total_price ? item.total_price / qty : 0)
        );

        const lineBase = qty * unitPriceBase;
        const lineVat = lineBase * currentTaxRate;
        const lineTotal = lineBase + lineVat;

        totalQtySum += qty;
        totalExclVatSum += lineBase;
        totalVatSum += lineVat;
        totalInclVatSum += lineTotal;

        return {
            index: index + 1,
            description: item.description || item.part_name || 'Vehicle Service',
            qty: qty,
            unitPrice: unitPriceBase.toFixed(3),
            amountExcl: lineBase.toFixed(3),
            vat: lineVat.toFixed(3),
            amountTotal: lineTotal.toFixed(3),
        };
    });

    const isPaid = invoice.status === 'paid';
    const paidAmount = isPaid ? totalInclVatSum.toFixed(3) : '0.000';
    const outstandingAmount = isPaid ? '0.000' : totalInclVatSum.toFixed(3);

    const handleCopySummary = () => {
        const text = `Official Tax Invoice #${invoiceId}
Date: ${formattedDate}
Customer: ${ownerName} (${ownerPhone})
Vehicle: ${vehicleModel} [Plate: ${vehiclePlate} | VIN: ${vehicleVin}]
VAT Rate: ${(parseFloat(taxPercentage) || 0)}%
Total Amount: OMR ${totalInclVatSum.toFixed(3)} (${isPaid ? 'PAID IN FULL' : 'PAYMENT DUE: OMR ' + outstandingAmount})
Precision Garage Workshop Management System`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="tax-invoice-modal-overlay" onClick={onClose}>
            <div className="tax-invoice-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* On-Screen Action Toolbar */}
                <div className="tax-invoice-modal-toolbar">
                    {/* Top Row: Title, ID Badge, Actions */}
                    <div className="toolbar-top-row">
                        <div className="toolbar-left-info">
                            <div className="toolbar-main-heading">
                                <span className="material-symbols-outlined toolbar-icon">receipt_long</span>
                                <span className="toolbar-title-text">Official Tax Invoice</span>
                            </div>
                            <div className="toolbar-sub-badges">
                                <span className="invoice-id-pill font-mono">{invoiceId}</span>
                                <span className="currency-pill">OMR Standard</span>
                            </div>
                        </div>

                        <div className="toolbar-actions">
                            <button
                                type="button"
                                className="btn-copy-invoice"
                                onClick={handleCopySummary}
                                title="Copy invoice summary to clipboard"
                            >
                                {copied ? (
                                    <>
                                        <CheckIcon fontSize="small" style={{ color: '#10b981' }} />
                                        <span style={{ color: '#10b981', fontWeight: 700 }}>Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <ContentCopyIcon fontSize="small" />
                                        <span>Copy Summary</span>
                                    </>
                                )}
                            </button>
                            <button type="button" className="btn-print-invoice" onClick={handlePrint}>
                                <PrintIcon fontSize="small" />
                                <span>Print / Save as PDF</span>
                            </button>
                            <button type="button" className="btn-close-modal" onClick={onClose} title="Close Preview">
                                <CloseIcon fontSize="small" />
                            </button>
                        </div>
                    </div>

                    {/* Bottom Strip: Dedicated Tax (VAT) Rate Selector (Staff & Admin Only) */}
                    {!isOwner && (
                        <div className="toolbar-tax-strip">
                            <div className="tax-strip-label">
                                <span className="material-symbols-outlined" style={{ fontSize: '17px', color: '#ffd85f' }}>tune</span>
                                <span>VAT Tax Rate:</span>
                            </div>

                            <div className="tax-strip-presets">
                                {[
                                    { val: 0, label: '0% (Tax Free)' },
                                    { val: 5, label: '5% (Standard Default)' },
                                    { val: 10, label: '10%' },
                                    { val: 15, label: '15%' }
                                ].map((preset) => {
                                    const isActive = parseFloat(taxPercentage) === preset.val;
                                    return (
                                        <button
                                            key={preset.val}
                                            type="button"
                                            className={`tax-preset-chip ${isActive ? 'active' : ''}`}
                                            onClick={() => setTaxPercentage(preset.val)}
                                            title={`Set invoice VAT to ${preset.val}%`}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="tax-custom-input-wrap">
                                <span className="custom-input-label">Custom:</span>
                                <div className="custom-input-box-inner">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        className="tax-num-field font-mono"
                                        value={taxPercentage}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setTaxPercentage(val === '' ? '' : Math.max(0, parseFloat(val) || 0));
                                        }}
                                        title="Custom VAT percentage"
                                        placeholder="5"
                                    />
                                    <span className="tax-percent-symbol">%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ========================================================= */}
                {/* TAX INVOICE A4 DOCUMENT CONTAINER (MATCHING SAMPLE IMAGE) */}
                {/* ========================================================= */}
                <div className="tax-invoice-paper" id="printable-tax-invoice">
                    {/* Authentic Official Rubber Watermark Stamp */}
                    <div className={`invoice-stamp ${isPaid ? 'stamp-paid' : 'stamp-pending'}`}>
                        <div className="stamp-inner-border">
                            <span className="stamp-title">{isPaid ? 'PAID IN FULL' : 'PAYMENT DUE'}</span>
                            <span className="stamp-sub font-mono">{isPaid ? 'OFFICIALLY CLEARED' : 'SETTLEMENT REQUIRED'}</span>
                        </div>
                    </div>

                    {/* Header */}
                    <header className="invoice-doc-header">
                        {/* Brand Logo Box Left */}
                        <div className="invoice-brand-box">
                            <span className="brand-main-txt">ProDrive</span>
                            <span className="brand-sub-txt">Auto Care</span>
                        </div>

                        {/* Company Details Center */}
                        <div className="invoice-center-info">
                            <h1 className="invoice-company-title">
                                Pro<span>Service</span> SPC
                            </h1>
                            <p className="invoice-company-details">
                                Phone # 9966 9403
                            </p>
                            <p className="invoice-company-details">
                                Oman Oil Modern Hayy As Sarah Rustaq Oman
                            </p>
                            <p className="invoice-company-details">
                                VAT # OM1100349203
                            </p>
                            <div className="invoice-doc-type-title">
                                TAX INVOICE
                            </div>
                        </div>

                        {/* Arabic Brand Box Right */}
                        <div className="invoice-arabic-box">
                            <span className="arabic-main-txt">برودرايف</span>
                            <span className="arabic-sub-txt">للعناية بالسيارات</span>
                        </div>
                    </header>

                    {/* Metadata Section */}
                    <section className="invoice-metadata-grid">
                        {/* Column 1: Bill To */}
                        <div className="meta-column">
                            <div>CR # 1470856</div>
                            <div className="meta-label-strong">Bill To :</div>
                            <div className="meta-label-strong">{ownerName}</div>
                            <div>{ownerPhone}</div>
                        </div>

                        {/* Column 2: Vehicle */}
                        <div className="meta-column">
                            <div className="meta-label-strong">Vehicle :</div>
                            <div>{vehiclePlate}</div>
                            <div>{vehicleModel}</div>
                            <div>{vehicleVin}</div>
                        </div>

                        {/* Column 3: Tax Invoice Details */}
                        <div className="meta-column meta-right-align">
                            <div className="meta-row-right">
                                <span className="meta-label-strong">Tax Invoice #</span>
                                <span>{invoiceId}</span>
                            </div>
                            <div className="meta-row-right">
                                <span className="meta-label-strong">Date:</span>
                                <span>{formattedDate}</span>
                            </div>
                        </div>
                    </section>

                    {/* Items Table */}
                    <section className="invoice-table-section">
                        <table className="invoice-items-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '35px' }} className="col-center">#</th>
                                    <th>Service</th>
                                    <th style={{ width: '45px' }} className="col-center">Qty</th>
                                    <th style={{ width: '80px' }} className="col-right">Unit Price</th>
                                    <th style={{ width: '80px' }} className="col-right">Amount</th>
                                    <th style={{ width: '75px' }} className="col-right">
                                        VAT ({parseFloat(taxPercentage) || 0}%)
                                    </th>
                                    <th style={{ width: '85px' }} className="col-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row) => (
                                    <tr key={row.index}>
                                        <td className="col-center">{row.index}</td>
                                        <td>{row.description}</td>
                                        <td className="col-center">{row.qty}</td>
                                        <td className="col-right">{row.unitPrice}</td>
                                        <td className="col-right">{row.amountExcl}</td>
                                        <td className="col-right">{row.vat}</td>
                                        <td className="col-right">{row.amountTotal}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="table-summary-bar">
                                    <td colSpan="2"></td>
                                    <td className="col-center">{totalQtySum}</td>
                                    <td></td>
                                    <td className="col-right">{totalExclVatSum.toFixed(3)}</td>
                                    <td className="col-right">{totalVatSum.toFixed(3)}</td>
                                    <td className="col-right">{totalInclVatSum.toFixed(3)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </section>

                    {/* Financial Totals Breakdown Box (Right Aligned) */}
                    <section className="invoice-totals-wrapper">
                        <div className="invoice-totals-box">
                            <div className="totals-line-row">
                                <span>Sub Total</span>
                                <span>{totalExclVatSum.toFixed(3)}</span>
                            </div>
                            <div className="totals-line-row">
                                <span>VAT ({parseFloat(taxPercentage) || 0}%)</span>
                                <span>{totalVatSum.toFixed(3)}</span>
                            </div>
                            <div className="totals-grand-bar">
                                <span>Grand Total (OMR)</span>
                                <span>{totalInclVatSum.toFixed(3)}</span>
                            </div>
                            <div className="totals-line-row" style={{ marginTop: '4px' }}>
                                <span>Paid Amount</span>
                                <span>{paidAmount}</span>
                            </div>
                            <div className="totals-line-row">
                                <span>Outstanding</span>
                                <span>{outstandingAmount}</span>
                            </div>
                        </div>
                    </section>

                    {/* Warranty & Guarantee Assurance Banner */}
                    <div className="invoice-guarantee-banner">
                        <span className="material-symbols-outlined guarantee-icon">verified_user</span>
                        <div className="guarantee-text">
                            <strong>Precision Workshop Quality Guarantee:</strong> All installed replacement parts and mechanical craftsmanship are protected under our comprehensive 90-Day or 5,000 KM service assurance warranty.
                        </div>
                    </div>

                    {/* Signatures & Seal Section */}
                    <footer className="invoice-signatures-section">
                        {/* Receiver Sign Left */}
                        <div className="sig-box-left">
                            <div className="sig-name">{ownerName}</div>
                            <div className="sig-sub-label">Receiver's Sign</div>
                        </div>

                        {/* Acknowledgment Center */}
                        <div className="sig-box-center">
                            <div className="sig-ack-title">ACKNOWLEDGMENT</div>
                            <div className="sig-sub-label">ProDrive Auto Care</div>
                        </div>

                        {/* Physical Seal & Sign Placeholder Right */}
                        <div className="sig-box-right">
                            <div className="seal-sign-space"></div>
                            <div className="sig-sub-label">Workshop Seal & Sign</div>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
