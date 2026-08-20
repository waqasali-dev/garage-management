import React from 'react';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import './css/TaxInvoiceModal.css';

export default function TaxInvoiceModal({ invoice, onClose }) {
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

    // Calculate line items breakdown with 5% VAT (Oman / International Tax Standard)
    const VAT_RATE = 0.05;
    let totalExclVatSum = 0;
    let totalVatSum = 0;
    let totalInclVatSum = 0;
    let totalQtySum = 0;

    const tableRows = items.map((item, index) => {
        const qty = parseFloat(item.quantity_or_hours || 1);
        const lineTotal = parseFloat(item.total_price || (qty * parseFloat(item.unit_price || 0)) || 0);

        // Calculate base price before VAT and VAT amount
        const lineBase = lineTotal / (1 + VAT_RATE);
        const lineVat = lineTotal - lineBase;
        const unitPriceBase = lineBase / qty;

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

    return (
        <div className="tax-invoice-modal-overlay" onClick={onClose}>
            <div className="tax-invoice-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* On-Screen Action Toolbar */}
                <div className="tax-invoice-modal-toolbar">
                    <span className="toolbar-title">OFFICIAL TAX INVOICE PREVIEW</span>
                    <div className="toolbar-actions">
                        <button type="button" className="btn-print-invoice" onClick={handlePrint}>
                            <PrintIcon fontSize="small" />
                            <span>Print / Save as PDF</span>
                        </button>
                        <button type="button" className="btn-close-modal" onClick={onClose}>
                            <CloseIcon fontSize="small" />
                            <span>Close</span>
                        </button>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* TAX INVOICE A4 DOCUMENT CONTAINER (MATCHING SAMPLE IMAGE) */}
                {/* ========================================================= */}
                <div className="tax-invoice-paper" id="printable-tax-invoice">
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
                                    <th style={{ width: '70px' }} className="col-right">VAT</th>
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
                                <span>VAT</span>
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

                    {/* Signatures & Stamp Seal Section */}
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

                        {/* Stamp Seal Right */}
                        <div className="sig-box-right">
                            <div className="stamp-seal-circle">
                                <div className="stamp-inner-border"></div>
                                <span className="stamp-text-top">PRODRIVE AUTO CARE</span>
                                <span className="stamp-sig-line">Official</span>
                                <span className="stamp-text-bottom">★ RUSTAQ OMAN ★</span>
                            </div>
                            <div className="sig-sub-label">Workshop Seal & Sign</div>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
