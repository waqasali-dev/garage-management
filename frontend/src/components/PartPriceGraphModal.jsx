import React, { useState, useEffect, useMemo } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AddBoxIcon from '@mui/icons-material/AddBox';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import StyledLoading from './StyledLoading';
import { useCurrency } from '../context/CurrencyContext';
import { API_BASE_URL } from '../config/api';
import './css/PartPriceGraphModal.css';

export default function PartPriceGraphModal({
    isOpen,
    onClose,
    partId,
    onRestockRequested,
    valuationMethod = 'fifo',
}) {
    const { formatCurrency, currency } = useCurrency();
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [priceFilter, setPriceFilter] = useState('both'); // 'both', 'selling', 'cost'
    const [hoveredNode, setHoveredNode] = useState(null);

    // Fetch part details from API
    const loadDetails = async () => {
        if (!partId) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/inventory/${partId}/details`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    setDetails(json.data);
                } else {
                    setError(json.error || 'Failed to fetch part details');
                }
            } else {
                setError('Failed to fetch part details from server');
            }
        } catch (err) {
            console.error('Error fetching part details:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && partId) {
            loadDetails();
            setHoveredNode(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, partId]);

    // Graph plotting calculation
    const graphData = useMemo(() => {
        if (!details || !details.graph_timeline || details.graph_timeline.length === 0) {
            return null;
        }

        const rawPoints = details.graph_timeline;
        const width = 720;
        const height = 240;
        const padX = 55;
        const padY = 35;
        const plotWidth = width - padX * 2;
        const plotHeight = height - padY * 2;

        // If only 1 entry exists (e.g. initial baseline), add a virtual baseline start point so it draws a continuous flat line
        let points = [...rawPoints];
        if (points.length === 1) {
            const p = points[0];
            const prevDate = new Date(new Date(p.date).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            points = [
                {
                    ...p,
                    id: 'virtual-start',
                    date: prevDate,
                    shortDate: 'Baseline Start',
                    dateLabel: 'Initial Registration',
                    isVirtual: true,
                },
                p,
            ];
        }

        // Min & Max prices across timeline
        const allPrices = points.flatMap((p) => [p.costPrice, p.sellingPrice]);
        const minVal = Math.max(0, Math.min(...allPrices) * 0.85);
        const maxVal = Math.max(...allPrices) * 1.15 || 100;
        const valRange = maxVal - minVal || 1;

        // Calculate (x, y) coordinates
        const coords = points.map((p, idx) => {
            const ratioX = points.length > 1 ? idx / (points.length - 1) : 0.5;
            const x = padX + ratioX * plotWidth;

            const costRatioY = (p.costPrice - minVal) / valRange;
            const costY = height - padY - costRatioY * plotHeight;

            const sellingRatioY = (p.sellingPrice - minVal) / valRange;
            const sellingY = height - padY - sellingRatioY * plotHeight;

            return {
                ...p,
                x,
                costY,
                sellingY,
            };
        });

        // Path generator
        const buildPath = (keyY) => {
            if (coords.length === 0) return '';
            return coords.reduce((acc, pt, i) => {
                if (i === 0) return `M ${pt.x} ${pt[keyY]}`;
                // Crisp linear segment for precise price jump tracking
                return `${acc} L ${pt.x} ${pt[keyY]}`;
            }, '');
        };

        const sellingPath = buildPath('sellingY');
        const costPath = buildPath('costY');

        // Area path for gradient shading under curves
        const firstPt = coords[0];
        const lastPt = coords[coords.length - 1];
        const bottomY = height - padY;

        const sellingArea = `${sellingPath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;
        const costArea = `${costPath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;

        // Y Grid Ticks (4 horizontal guide lines)
        const ticksCount = 4;
        const gridTicks = [];
        for (let i = 0; i <= ticksCount; i++) {
            const val = minVal + (valRange * (i / ticksCount));
            const y = height - padY - ((val - minVal) / valRange) * plotHeight;
            gridTicks.push({ val, y });
        }

        return {
            width,
            height,
            padX,
            padY,
            coords,
            sellingPath,
            costPath,
            sellingArea,
            costArea,
            gridTicks,
            minVal,
            maxVal,
        };
    }, [details]);

    if (!isOpen) return null;

    const part = details?.part;
    const stats = details?.stats;
    const batches = details?.batches || [];
    const activeMethod = details?.valuation_method || valuationMethod || 'fifo';

    // Find the next batch that will sell
    const nextBatchId = (() => {
        if (!batches || batches.length === 0) return null;
        if (activeMethod === 'lifo') {
            const found = batches.find((b) => b.quantity_remaining > 0);
            return found ? found.batch_id : null;
        } else {
            // FIFO: reverse (oldest first)
            const asc = [...batches].reverse();
            const found = asc.find((b) => b.quantity_remaining > 0);
            return found ? found.batch_id : null;
        }
    })();

    return (
        <div className="part-graph-modal-overlay" onClick={onClose}>
            <div className="part-graph-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="part-graph-modal-header">
                    <div className="part-graph-header-left">
                        <div className="part-graph-icon-box">
                            <ShowChartIcon />
                        </div>
                        <div>
                            <h3 className="part-graph-title">
                                <span>{part?.part_name || 'Loading Part Analytics...'}</span>
                                {part?.sku && <span className="part-graph-sku-badge">{part.sku}</span>}
                            </h3>
                            <p className="part-graph-subtitle">
                                Multi-Batch Cost & Price Evolution Under Same SKU • Active Strategy:{' '}
                                <strong style={{ color: '#ffd85f' }}>{activeMethod.toUpperCase()}</strong>
                            </p>
                        </div>
                    </div>
                    <button type="button" className="part-graph-close-btn" onClick={onClose} aria-label="Close">
                        <CloseIcon fontSize="small" />
                    </button>
                </div>

                {/* Body */}
                <div className="part-graph-modal-body">
                    {isLoading ? (
                        <div style={{ padding: '60px 0' }}>
                            <StyledLoading
                                variant="dashboard"
                                size="md"
                                message="Loading price history & batch matrix..."
                                subtitle="Querying all batches, unit costs & historical price adjustments"
                                icon="show_chart"
                                badge="Price Analytics"
                            />
                        </div>
                    ) : error ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#f87171' }}>
                            <p>Error: {error}</p>
                            <button
                                type="button"
                                className="btn-part-graph-close"
                                onClick={loadDetails}
                                style={{ marginTop: '10px' }}
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Top 4 Stats Bento */}
                            <div className="part-graph-stats-row">
                                <div className="part-stat-mini-card active-selling">
                                    <span className="part-stat-label">Next Selling Rate</span>
                                    <span className="part-stat-val" style={{ color: '#ffd85f' }}>
                                        {formatCurrency(stats?.next_selling_price ?? part?.selling_price)}
                                    </span>
                                    <span className="part-stat-sub">
                                        ⚡ Next unit sold via {activeMethod.toUpperCase()}
                                    </span>
                                </div>

                                <div className="part-stat-mini-card">
                                    <span className="part-stat-label">Next Cost / Unit</span>
                                    <span className="part-stat-val" style={{ color: '#38bdf8' }}>
                                        {formatCurrency(stats?.next_cost_price ?? part?.unit_cost)}
                                    </span>
                                    <span className="part-stat-sub">
                                        Batch: {stats?.next_batch_number || 'Standard'}
                                    </span>
                                </div>

                                <div className="part-stat-mini-card">
                                    <span className="part-stat-label">Stock Across Batches</span>
                                    <span className="part-stat-val">
                                        {stats?.total_stock ?? part?.stock_quantity}
                                    </span>
                                    <span className="part-stat-sub">
                                        Threshold: {part?.reorder_threshold} units
                                    </span>
                                </div>

                                <div className="part-stat-mini-card">
                                    <span className="part-stat-label">Active Batches</span>
                                    <span className="part-stat-val" style={{ color: '#34d399' }}>
                                        {stats?.active_batches_count ?? 1}
                                        <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
                                            {' '}
                                            / {stats?.total_batches_count ?? 1}
                                        </span>
                                    </span>
                                    <span className="part-stat-sub">
                                        Avg Cost: {formatCurrency(stats?.weighted_avg_cost ?? part?.unit_cost)}
                                    </span>
                                </div>
                            </div>

                            {/* Chart Card */}
                            <div className="chart-container-card">
                                <div className="chart-header-row">
                                    <div className="chart-title-wrap">
                                        <ShowChartIcon style={{ fontSize: '18px', color: '#ffd85f' }} />
                                        <h4>Price History & Margin Trends</h4>
                                    </div>

                                    {/* Legend & Filter */}
                                    <div className="chart-legend">
                                        {(priceFilter === 'both' || priceFilter === 'selling') && (
                                            <div className="legend-item">
                                                <span className="legend-dot selling" />
                                                <span>Selling Price</span>
                                            </div>
                                        )}
                                        {(priceFilter === 'both' || priceFilter === 'cost') && (
                                            <div className="legend-item">
                                                <span className="legend-dot cost" />
                                                <span>Purchase Cost</span>
                                            </div>
                                        )}

                                        <div className="chart-filter-pills">
                                            <button
                                                type="button"
                                                className={`chart-pill-btn ${priceFilter === 'both' ? 'active' : ''}`}
                                                onClick={() => setPriceFilter('both')}
                                            >
                                                Both
                                            </button>
                                            <button
                                                type="button"
                                                className={`chart-pill-btn ${priceFilter === 'selling' ? 'active' : ''}`}
                                                onClick={() => setPriceFilter('selling')}
                                            >
                                                Selling
                                            </button>
                                            <button
                                                type="button"
                                                className={`chart-pill-btn ${priceFilter === 'cost' ? 'active' : ''}`}
                                                onClick={() => setPriceFilter('cost')}
                                            >
                                                Cost
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* SVG Chart */}
                                {graphData && (
                                    <div className="svg-chart-wrapper">
                                        <svg
                                            viewBox={`0 0 ${graphData.width} ${graphData.height}`}
                                            className="price-history-svg"
                                        >
                                            <defs>
                                                {/* Selling Price Gradient */}
                                                <linearGradient id="sellingGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#ffd85f" stopOpacity="0.28" />
                                                    <stop offset="100%" stopColor="#ffd85f" stopOpacity="0.0" />
                                                </linearGradient>

                                                {/* Cost Price Gradient */}
                                                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                                                </linearGradient>
                                            </defs>

                                            {/* Horizontal Grid Lines */}
                                            {graphData.gridTicks.map((tick, idx) => (
                                                <g key={idx}>
                                                    <line
                                                        x1={graphData.padX}
                                                        y1={tick.y}
                                                        x2={graphData.width - graphData.padX}
                                                        y2={tick.y}
                                                        stroke="rgba(255, 255, 255, 0.08)"
                                                        strokeDasharray="4 4"
                                                    />
                                                    <text
                                                        x={graphData.padX - 8}
                                                        y={tick.y + 4}
                                                        fill="#64748b"
                                                        fontSize="10"
                                                        fontFamily="'JetBrains Mono', monospace"
                                                        textAnchor="end"
                                                    >
                                                        {currency?.symbol || '$'}{Math.round(tick.val)}
                                                    </text>
                                                </g>
                                            ))}

                                            {/* Shaded Areas */}
                                            {(priceFilter === 'both' || priceFilter === 'selling') && (
                                                <path d={graphData.sellingArea} fill="url(#sellingGradient)" />
                                            )}
                                            {(priceFilter === 'both' || priceFilter === 'cost') && (
                                                <path d={graphData.costArea} fill="url(#costGradient)" />
                                            )}

                                            {/* Lines */}
                                            {(priceFilter === 'both' || priceFilter === 'selling') && (
                                                <path
                                                    d={graphData.sellingPath}
                                                    fill="none"
                                                    stroke="#ffd85f"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            )}
                                            {(priceFilter === 'both' || priceFilter === 'cost') && (
                                                <path
                                                    d={graphData.costPath}
                                                    fill="none"
                                                    stroke="#38bdf8"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            )}

                                            {/* Data Nodes & Date Ticks */}
                                            {graphData.coords.map((pt, idx) => {
                                                if (pt.isVirtual) return null;
                                                return (
                                                    <g key={pt.id || idx}>
                                                        {/* X Date Label */}
                                                        <text
                                                            x={pt.x}
                                                            y={graphData.height - 10}
                                                            fill="#94a3b8"
                                                            fontSize="10"
                                                            fontFamily="'JetBrains Mono', monospace"
                                                            textAnchor="middle"
                                                        >
                                                            {pt.shortDate}
                                                        </text>

                                                        {/* Selling Node Dot */}
                                                        {(priceFilter === 'both' || priceFilter === 'selling') && (
                                                            <circle
                                                                cx={pt.x}
                                                                cy={pt.sellingY}
                                                                r="5.5"
                                                                fill="#ffd85f"
                                                                stroke="#121814"
                                                                strokeWidth="2"
                                                                style={{ cursor: 'pointer' }}
                                                                onMouseEnter={() => setHoveredNode(pt)}
                                                            />
                                                        )}

                                                        {/* Cost Node Dot */}
                                                        {(priceFilter === 'both' || priceFilter === 'cost') && (
                                                            <circle
                                                                cx={pt.x}
                                                                cy={pt.costY}
                                                                r="4.5"
                                                                fill="#38bdf8"
                                                                stroke="#121814"
                                                                strokeWidth="2"
                                                                style={{ cursor: 'pointer' }}
                                                                onMouseEnter={() => setHoveredNode(pt)}
                                                            />
                                                        )}
                                                    </g>
                                                );
                                            })}
                                        </svg>

                                        {/* Floating Node Tooltip */}
                                        {hoveredNode && (
                                            <div className="chart-floating-tooltip">
                                                <span className="tooltip-date">
                                                    📅 {hoveredNode.dateLabel} • {hoveredNode.batchNumber}
                                                </span>
                                                <div className="tooltip-metric-row">
                                                    <span style={{ color: '#ffd85f' }}>Selling Price:</span>
                                                    <strong className="font-mono">
                                                        {formatCurrency(hoveredNode.sellingPrice)}
                                                    </strong>
                                                </div>
                                                <div className="tooltip-metric-row">
                                                    <span style={{ color: '#38bdf8' }}>Purchase Cost:</span>
                                                    <strong className="font-mono">
                                                        {formatCurrency(hoveredNode.costPrice)}
                                                    </strong>
                                                </div>
                                                <div
                                                    className="tooltip-metric-row"
                                                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '3px' }}
                                                >
                                                    <span style={{ color: '#34d399' }}>Margin:</span>
                                                    <strong className="font-mono" style={{ color: '#34d399' }}>
                                                        +{formatCurrency(hoveredNode.profitMargin)} ({hoveredNode.marginPercent}%)
                                                    </strong>
                                                </div>
                                                {hoveredNode.notes && (
                                                    <span style={{ fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        {hoveredNode.notes}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Batches Breakdown Table */}
                            <div className="batches-breakdown-card">
                                <div className="batches-card-header">
                                    <div className="batches-card-title-group">
                                        <Inventory2Icon style={{ fontSize: '18px', color: '#ffd85f' }} />
                                        <h4>Stock Batches Matrix Under Same SKU</h4>
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                                        {batches.length} BATCH{batches.length === 1 ? '' : 'ES'} REGISTERED
                                    </span>
                                </div>

                                <div className="batches-table-container">
                                    <table className="batches-table">
                                        <thead>
                                            <tr>
                                                <th>Batch #</th>
                                                <th>Received Date</th>
                                                <th className="text-right">Stock (Remaining / In)</th>
                                                <th className="text-right">Unit Cost</th>
                                                <th className="text-right">Selling Price</th>
                                                <th className="text-right">Margin</th>
                                                <th className="text-center">Status</th>
                                                <th className="text-center">Selling Order</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batches.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                                        No batches recorded yet. Restock this part to create its first batch.
                                                    </td>
                                                </tr>
                                            ) : (
                                                batches.map((b) => {
                                                    const isNext = b.batch_id === nextBatchId;
                                                    const margin = b.selling_price - b.unit_cost;
                                                    const marginPct = b.unit_cost > 0 ? ((margin / b.unit_cost) * 100).toFixed(0) : '100';
                                                    const percentRemaining = b.quantity_received > 0 
                                                        ? Math.round((b.quantity_remaining / b.quantity_received) * 100) 
                                                        : 0;

                                                    return (
                                                        <tr
                                                            key={b.batch_id}
                                                            className={isNext ? 'batch-row-next-sell' : ''}
                                                        >
                                                            <td className="font-mono" style={{ fontWeight: 700, color: '#ffffff' }}>
                                                                {b.batch_number}
                                                            </td>
                                                            <td className="text-muted font-mono" style={{ fontSize: '11.5px' }}>
                                                                {new Date(b.received_date || b.created_at).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    year: 'numeric',
                                                                })}
                                                            </td>
                                                            <td className="text-right font-mono">
                                                                <span style={{ fontWeight: 700, color: b.quantity_remaining > 0 ? '#ffffff' : '#64748b' }}>
                                                                    {b.quantity_remaining}
                                                                </span>
                                                                <span style={{ color: '#94a3b8', fontSize: '11px' }}> / {b.quantity_received}</span>
                                                                <div className="batch-progress-bar-bg" style={{ marginLeft: 'auto' }}>
                                                                    <div
                                                                        className="batch-progress-bar-fill"
                                                                        style={{
                                                                            width: `${percentRemaining}%`,
                                                                            backgroundColor: percentRemaining <= 0 ? '#475569' : percentRemaining <= 25 ? '#fbbf24' : '#10b981',
                                                                        }}
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="text-right font-mono text-muted">
                                                                {formatCurrency(b.unit_cost)}
                                                            </td>
                                                            <td className="text-right font-mono" style={{ color: '#ffd85f', fontWeight: 700 }}>
                                                                {formatCurrency(b.selling_price)}
                                                            </td>
                                                            <td className="text-right font-mono" style={{ color: '#34d399' }}>
                                                                +{formatCurrency(margin)} <span style={{ fontSize: '10px', color: '#94a3b8' }}>({marginPct}%)</span>
                                                            </td>
                                                            <td className="text-center">
                                                                {b.status === 'depleted' ? (
                                                                    <span className="batch-depleted-badge">DEPLETED</span>
                                                                ) : b.status === 'partially_consumed' ? (
                                                                    <span className="status-pill pill-warning">PARTIAL</span>
                                                                ) : (
                                                                    <span className="status-pill pill-success">ACTIVE</span>
                                                                )}
                                                            </td>
                                                            <td className="text-center">
                                                                {isNext ? (
                                                                    <span className={`batch-next-badge ${activeMethod === 'lifo' ? 'lifo-badge' : ''}`}>
                                                                        <FlashOnIcon style={{ fontSize: '13px' }} />
                                                                        <span>NEXT TO SELL ({activeMethod.toUpperCase()})</span>
                                                                    </span>
                                                                ) : b.quantity_remaining > 0 ? (
                                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>In Queue</span>
                                                                ) : (
                                                                    <span style={{ fontSize: '11px', color: '#475569' }}>Sold Out</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="part-graph-modal-footer">
                    <button type="button" className="btn-part-graph-close" onClick={onClose}>
                        Close Analytics
                    </button>
                    {onRestockRequested && part && (
                        <button
                            type="button"
                            className="btn-part-graph-restock"
                            onClick={() => {
                                onClose();
                                onRestockRequested(part);
                            }}
                        >
                            <AddBoxIcon style={{ fontSize: '18px' }} />
                            <span>+ Restock Batch with New Price</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
