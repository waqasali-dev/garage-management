import React from 'react';
import './css/StyledLoading.css';

/**
 * StyledLoading - Modern animated loading state for Precision Garage Management.
 * Replaces static loaders with orbital spinning rings, glowing mechanic emblems,
 * ambient radial aura, live telemetry indicator, and sleek shimmer bar.
 */
export default function StyledLoading({
    message = 'Loading workshop details from database...',
    subtitle = 'Syncing real-time records and vehicle telemetry',
    icon = 'build',
    badge = 'Workshop Telemetry',
    variant = 'fullscreen',
    size = 'md',
    style = {},
    className = '',
}) {
    const renderIcon = () => {
        if (!icon) return null;
        if (typeof icon === 'string') {
            return <span className="material-symbols-outlined">{icon}</span>;
        }
        return icon;
    };

    return (
        <div
            className={`styled-loading-root variant-${variant} size-${size} ${className}`}
            style={style}
            role="status"
            aria-live="polite"
        >
            {/* Ambient Radial Glow */}
            <div className="loading-ambient-glow" aria-hidden="true" />

            {/* Orbital Rings & Animated Emblem */}
            <div className="loading-orbit-system" aria-hidden="true">
                <div className="loading-ring-outer" />
                <div className="loading-ring-inner" />
                <div className="loading-emblem-core">
                    {renderIcon()}
                </div>
            </div>

            {/* Typography & Telemetry */}
            <div className="loading-content-wrap">
                {badge && (
                    <div className="loading-status-badge">
                        <span className="pulse-dot" />
                        <span>{badge}</span>
                    </div>
                )}
                <p className="loading-primary-text">{message}</p>
                {subtitle && <p className="loading-subtitle-text">{subtitle}</p>}
                
                {/* Precision Shimmer Track */}
                <div className="loading-shimmer-track" aria-hidden="true">
                    <div className="loading-shimmer-bar" />
                </div>
            </div>
        </div>
    );
}
