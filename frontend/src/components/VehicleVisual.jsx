import React, { useState } from 'react';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import { getVehicleVisual } from '../utils/vehicleVisuals';
import './css/VehicleVisual.css';

/**
 * Universal Vehicle Visual Component
 * Renders high-performance, alpha-transparent vehicle artwork with responsive sizing,
 * glow backdrops, and optional body-type badges.
 *
 * @param {Object} props
 * @param {string} [props.type] - Explicit vehicle type ('Sedan', 'SUV', etc.)
 * @param {string} [props.make] - Vehicle make (used for auto-inference if type is missing)
 * @param {string} [props.model] - Vehicle model (used for auto-inference)
 * @param {string} [props.size] - 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
 * @param {boolean} [props.showBadge] - Whether to render the body type pill badge
 * @param {string} [props.className] - Extra CSS classes
 * @param {Object} [props.style] - Inline styling overrides
 * @param {boolean} [props.glow] - Whether to render subtle radiant backdrop glow
 * @param {string} [props.alt] - Custom alt text
 */
export default function VehicleVisual({
    type,
    make = '',
    model = '',
    size = 'md',
    showBadge = false,
    className = '',
    style = {},
    glow = true,
    alt = '',
}) {
    const [imageError, setImageError] = useState(false);
    const visual = getVehicleVisual(type, make, model);

    const containerClasses = [
        'vehicle-visual-container',
        `vehicle-visual-${size}`,
        glow ? 'with-glow' : '',
        className,
    ].filter(Boolean).join(' ');

    const altText = alt || `${make ? `${make} ` : ''}${model ? `${model} ` : ''}(${visual.label})`;

    return (
        <div
            className={containerClasses}
            style={{
                '--vehicle-accent': visual.badgeColor,
                '--vehicle-accent-bg': visual.accentBg,
                '--vehicle-border': visual.borderColor,
                ...style,
            }}
        >
            {glow && <div className="vehicle-visual-glow" />}

            {!imageError ? (
                <picture className="vehicle-visual-picture">
                    <source srcSet={visual.webp} type="image/webp" />
                    <img
                        src={visual.image}
                        alt={altText}
                        className="vehicle-visual-img"
                        loading="lazy"
                        onError={() => setImageError(true)}
                    />
                </picture>
            ) : (
                <div className="vehicle-visual-fallback">
                    <DirectionsCarFilledIcon fontSize={size === 'xs' || size === 'sm' ? 'small' : 'large'} />
                </div>
            )}

            {showBadge && (
                <span
                    className="vehicle-visual-badge"
                    style={{
                        color: visual.badgeColor,
                        backgroundColor: visual.accentBg,
                        borderColor: visual.borderColor,
                    }}
                >
                    {visual.label}
                </span>
            )}
        </div>
    );
}
