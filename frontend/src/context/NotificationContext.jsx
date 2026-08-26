import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
    const [notification, setNotification] = useState(null);

    const showNotification = useCallback((message, type = 'success', duration = 4000) => {
        setNotification({ message, type });
        const timer = setTimeout(() => {
            setNotification(null);
        }, duration);
        return () => clearTimeout(timer);
    }, []);

    const closeNotification = useCallback(() => {
        setNotification(null);
    }, []);

    return (
        <NotificationContext.Provider value={{ notification, showNotification, closeNotification }}>
            {children}
            {notification && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 20px',
                        borderRadius: '8px',
                        backgroundColor: notification.type === 'error' ? '#1e1b2e' : '#111b27',
                        border: `1px solid ${notification.type === 'error' ? '#ef4444' : '#10b981'}`,
                        color: notification.type === 'error' ? '#fca5a5' : '#6ee7b7',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
                        fontFamily: 'Inter, -apple-system, sans-serif',
                        fontSize: '13px',
                        fontWeight: '500',
                        animation: 'slideInToast 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    <span style={{ fontSize: '18px' }}>
                        {notification.type === 'error' ? '⚠️' : '✅'}
                    </span>
                    <span>{notification.message}</span>
                    <button
                        onClick={closeNotification}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'inherit',
                            cursor: 'pointer',
                            padding: '4px',
                            marginLeft: '8px',
                            opacity: 0.7,
                            fontSize: '16px',
                        }}
                    >
                        ✕
                    </button>
                    <style>{`
                        @keyframes slideInToast {
                            from { transform: translateY(20px); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                    `}</style>
                </div>
            )}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        // Safe fallback if used outside provider
        return {
            showNotification: (msg) => console.log('[Notification]', msg),
            closeNotification: () => {},
            notification: null,
        };
    }
    return context;
}

export default NotificationContext;
