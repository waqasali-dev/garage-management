/**
 * Exact Financial Math Utilities (SEC-15)
 * Eliminates IEEE 754 floating-point rounding errors (e.g. 0.1 + 0.2 = 0.30000000000000004)
 * by computing monetary values using scaled integer representations (cents/mills).
 */

/**
 * Convert any monetary value (number or string) to integer cents.
 */
export const toCents = (amount, decimals = 2) => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(Number(amount) * factor);
};

/**
 * Convert integer cents back to decimal number with exact precision.
 */
export const fromCents = (cents, decimals = 2) => {
    const factor = Math.pow(10, decimals);
    return Number((Number(cents) / factor).toFixed(decimals));
};

/**
 * Exact calculation of tax amount from subtotal and tax percentage.
 */
export const calculateTaxAmount = (subtotal, taxPercentage, decimals = 2) => {
    const subtotalCents = toCents(subtotal, decimals);
    const taxRate = Number(taxPercentage) || 0;
    const taxCents = Math.round(subtotalCents * (taxRate / 100));
    return fromCents(taxCents, decimals);
};

/**
 * Exact calculation of total amount: subtotal + taxAmount
 */
export const calculateTotalAmount = (subtotal, taxAmount, decimals = 2) => {
    const subtotalCents = toCents(subtotal, decimals);
    const taxCents = toCents(taxAmount, decimals);
    return fromCents(subtotalCents + taxCents, decimals);
};

/**
 * Sum an array of monetary items without floating-point inaccuracies
 */
export const sumMonetary = (amounts, decimals = 2) => {
    if (!Array.isArray(amounts)) return 0;
    const totalCents = amounts.reduce((acc, curr) => acc + toCents(curr, decimals), 0);
    return fromCents(totalCents, decimals);
};

export default {
    toCents,
    fromCents,
    calculateTaxAmount,
    calculateTotalAmount,
    sumMonetary,
};
