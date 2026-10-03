// ==============================================================================
// 🏎️ VEHICLE VISUALS & BODY TYPE CONFIGURATION
// ==============================================================================
// Connects car body types to optimized alpha-transparent visual assets
// located in frontend/public/images/

export const VEHICLE_TYPES = [
    {
        id: 'Sedan',
        label: 'Sedan',
        subLabel: '4-Door / Saloon',
        image: '/images/Sedan.png',
        webp: '/images/Sedan.webp',
        badgeColor: '#3b82f6',
        accentBg: 'rgba(59, 130, 246, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        description: 'Standard passenger luxury & family saloons',
    },
    {
        id: 'SUV',
        label: 'SUV / Crossover',
        subLabel: 'Sport Utility',
        image: '/images/SUV.png',
        webp: '/images/SUV.webp',
        badgeColor: '#10b981',
        accentBg: 'rgba(16, 185, 129, 0.12)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
        description: 'Mid & full-size 4x4 SUVs and crossovers',
    },
    {
        id: 'Sports car',
        label: 'Sports Car',
        subLabel: 'Performance Coupe',
        image: '/images/Sports car.png',
        webp: '/images/Sports car.webp',
        badgeColor: '#ef4444',
        accentBg: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        description: 'High-performance sports coupes and roadsters',
    },
    {
        id: 'Pickup truck',
        label: 'Pickup Truck',
        subLabel: 'Utility / Bed',
        image: '/images/Pickup truck.png',
        webp: '/images/Pickup truck.webp',
        badgeColor: '#f59e0b',
        accentBg: 'rgba(245, 158, 11, 0.12)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        description: 'Light & heavy duty open-bed utility trucks',
    },
    {
        id: 'Van',
        label: 'Van / MPV',
        subLabel: 'Commercial / Shuttle',
        image: '/images/Van.png',
        webp: '/images/Van.webp',
        badgeColor: '#a855f7',
        accentBg: 'rgba(168, 85, 247, 0.12)',
        borderColor: 'rgba(168, 85, 247, 0.3)',
        description: 'Commercial cargo vans, minivans & passenger MPVs',
    },
    {
        id: 'Micro car',
        label: 'Micro Car / Hatchback',
        subLabel: 'Compact City',
        image: '/images/Micro car.png',
        webp: '/images/Micro car.webp',
        badgeColor: '#06b6d4',
        accentBg: 'rgba(6, 182, 212, 0.12)',
        borderColor: 'rgba(6, 182, 212, 0.3)',
        description: 'Subcompact city hatchbacks & micro vehicles',
    },
];

/**
 * Intelligent Vehicle Type Resolver:
 * Accepts explicit vehicle_type or infers body style from make/model.
 */
export function resolveVehicleType(typeInput, make = '', model = '') {
    const rawType = String(typeInput || '').trim().toLowerCase();

    // 1. Direct or partial type matching
    if (rawType.includes('suv') || rawType.includes('crossover') || rawType.includes('4x4')) {
        return 'SUV';
    }
    if (rawType.includes('pickup') || rawType.includes('truck')) {
        return 'Pickup truck';
    }
    if (rawType.includes('sport') || rawType.includes('coupe') || rawType.includes('roadster')) {
        return 'Sports car';
    }
    if (rawType.includes('van') || rawType.includes('mpv') || rawType.includes('minivan') || rawType.includes('shuttle')) {
        return 'Van';
    }
    if (rawType.includes('micro') || rawType.includes('hatch') || rawType.includes('compact') || rawType.includes('city')) {
        return 'Micro car';
    }
    if (rawType.includes('sedan') || rawType.includes('saloon')) {
        return 'Sedan';
    }

    // 2. Intelligent inference from model & make keywords
    const combined = `${make} ${model}`.toLowerCase();

    if (/\b(f-150|f150|f-250|silverado|ram|hilux|tundra|tacoma|sierra|ranger|navara|d-max|amarok|colorado|titan|pickup|truck)\b/i.test(combined)) {
        return 'Pickup truck';
    }
    if (/\b(suv|x1|x3|x5|x6|x7|q3|q5|q7|q8|rav4|cr-v|crv|tahoe|explorer|wrangler|patrol|land cruiser|prado|cherokee|grand cherokee|gle|glc|gls|g-wagon|cayenne|macan|suburban|pilot|highlander|edge|traverse|touareg|tiguan|outback|forester)\b/i.test(combined)) {
        return 'SUV';
    }
    if (/\b(911|corvette|mustang|camaro|ferrari|lamborghini|m2|m3|m4|m5|amg gt|gt-r|gtr|supra|r8|miata|boxster|cayman|vantage|huracan|aventador|roma|portofino|chiron|veiron|taycan|panamera)\b/i.test(combined)) {
        return 'Sports car';
    }
    if (/\b(van|transit|sienna|odyssey|caravan|hiace|sprinter|metris|pacifica|carnival|vito|alphard|v-class|tourneo)\b/i.test(combined)) {
        return 'Van';
    }
    if (/\b(micro|smart|mini|cooper|yaris|fiat 500|500|micra|i10|spark|picanto|beetle|twingo|fortwo|aygo|up!|polo|swift)\b/i.test(combined)) {
        return 'Micro car';
    }

    return 'Sedan';
}

/**
 * Returns full visual metadata (image URLs, badge color, labels) for any vehicle.
 */
export function getVehicleVisual(typeInput, make = '', model = '') {
    const resolvedId = resolveVehicleType(typeInput, make, model);
    const found = VEHICLE_TYPES.find((v) => v.id.toLowerCase() === resolvedId.toLowerCase());
    return found || VEHICLE_TYPES[0];
}

export default VEHICLE_TYPES;
