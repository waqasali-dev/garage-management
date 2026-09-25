import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { AUTH_TOKEN_KEY } from './AuthContext';

const CurrencyContext = createContext(null);

export const CURRENCY_PRESETS = [
    { code: 'OMR', symbol: 'OMR', name: 'Omani Rial (ر.ع.)', decimals: 3 },
    { code: 'USD', symbol: '$', name: 'US Dollar ($)', decimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro (€)', decimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound (£)', decimals: 2 },
    { code: 'AED', symbol: 'AED', name: 'UAE Dirham (د.إ)', decimals: 2 },
    { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal (﷼)', decimals: 2 },
    { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal (ر.ق)', decimals: 2 },
    { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar (د.ك)', decimals: 3 },
    { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar (ب.د)', decimals: 3 },
    { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar ($)', decimals: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar ($)', decimals: 2 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)', decimals: 2 },
];

const LOCAL_STORAGE_SETTINGS_KEY = 'garage_workshop_settings';

export function CurrencyProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        try {
            const cached = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (e) {
            console.warn('Failed to parse cached workshop settings:', e);
        }
        return {
            tax_percentage: 5.0,
            currency_code: 'USD',
            currency_symbol: '$',
            currency_decimals: 2,
            workshop_name: 'Precision Garage',
        };
    });

    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // Fetch settings from server
    const fetchSettings = useCallback(async () => {
        try {
            setIsLoadingSettings(true);
            const res = await fetch(`${API_BASE_URL}/settings`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    const data = {
                        tax_percentage: parseFloat(json.data.tax_percentage) || 5.0,
                        currency_code: json.data.currency_code || 'USD',
                        currency_symbol: json.data.currency_symbol || '$',
                        currency_decimals: json.data.currency_decimals !== undefined ? json.data.currency_decimals : 2,
                        workshop_name: json.data.workshop_name || 'Precision Garage',
                    };
                    setSettings(data);
                    try {
                        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(data));
                    } catch (e) {}
                }
            }
        } catch (err) {
            console.warn('Could not fetch workshop settings, using cached/defaults:', err.message);
        } finally {
            setIsLoadingSettings(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Format currency amount based on current workshop settings
    const formatCurrency = useCallback((amount, options = {}) => {
        if (amount === undefined || amount === null || amount === '') return '--';
        const num = typeof amount === 'number' ? amount : parseFloat(amount);
        if (isNaN(num)) return '--';

        const decimals = options.decimals !== undefined ? options.decimals : settings.currency_decimals;
        const formattedNum = num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });

        const symbol = options.symbol !== undefined ? options.symbol : (settings.currency_symbol || settings.currency_code || '$');

        // If symbol is single special char like $, €, £, ₹
        if (['$', '€', '£', '₹', '¥'].includes(symbol)) {
            return `${symbol}${formattedNum}`;
        }

        // For multi-character codes like OMR, AED, SAR, USD, CA$
        if (options.symbolSuffix) {
            return `${formattedNum} ${symbol}`;
        }
        return `${symbol} ${formattedNum}`;
    }, [settings.currency_decimals, settings.currency_symbol, settings.currency_code]);

    // Format raw number without currency symbol
    const formatRaw = useCallback((amount, customDecimals) => {
        if (amount === undefined || amount === null || amount === '') return '0.00';
        const num = typeof amount === 'number' ? amount : parseFloat(amount);
        if (isNaN(num)) return '0.00';

        const decimals = customDecimals !== undefined ? customDecimals : settings.currency_decimals;
        return num.toFixed(decimals);
    }, [settings.currency_decimals]);

    // Update settings via backend API (Admin only)
    const updateSettings = useCallback(async (newSettings) => {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const res = await fetch(`${API_BASE_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(newSettings),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to update workshop settings');
        }

        const data = {
            tax_percentage: parseFloat(json.data.tax_percentage) || 5.0,
            currency_code: json.data.currency_code || 'USD',
            currency_symbol: json.data.currency_symbol || '$',
            currency_decimals: json.data.currency_decimals !== undefined ? json.data.currency_decimals : 2,
            workshop_name: json.data.workshop_name || 'Precision Garage',
        };
        setSettings(data);
        try {
            localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(data));
        } catch (e) {}

        return json;
    }, []);

    const currency = {
        code: settings.currency_code,
        symbol: settings.currency_symbol,
        decimals: settings.currency_decimals,
    };

    return (
        <CurrencyContext.Provider
            value={{
                settings,
                currency,
                taxPercentage: settings.tax_percentage,
                workshopName: settings.workshop_name,
                formatCurrency,
                formatRaw,
                fetchSettings,
                updateSettings,
                isLoadingSettings,
                isSettingsModalOpen,
                setIsSettingsModalOpen,
                openSettingsModal: () => setIsSettingsModalOpen(true),
                closeSettingsModal: () => setIsSettingsModalOpen(false),
            }}
        >
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
}
