import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import './NotificationToast.css';

const NotificationContext = createContext(null);

const TOAST_CONFIG = {
    success: {
        title: 'Operation Success',
        icon: <CheckCircleOutlineIcon fontSize="small" />,
        className: 'pg-toast-success',
    },
    error: {
        title: 'System Alert',
        icon: <ErrorOutlineIcon fontSize="small" />,
        className: 'pg-toast-error',
    },
    warning: {
        title: 'Workshop Notice',
        icon: <WarningAmberIcon fontSize="small" />,
        className: 'pg-toast-warning',
    },
    info: {
        title: 'Information',
        icon: <InfoOutlinedIcon fontSize="small" />,
        className: 'pg-toast-info',
    },
};

export function NotificationProvider({ children }) {
    const [notification, setNotification] = useState(null);
    const timerRef = useRef(null);

    const closeNotification = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setNotification(null);
    }, []);

    const showNotification = useCallback((message, type = 'success', duration = 4200) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        const normalizedType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'success';
        setNotification({
            id: Date.now(),
            message,
            type: normalizedType,
            duration,
        });

        timerRef.current = setTimeout(() => {
            setNotification(null);
            timerRef.current = null;
        }, duration);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const activeConfig = notification ? (TOAST_CONFIG[notification.type] || TOAST_CONFIG.success) : TOAST_CONFIG.success;

    return (
        <NotificationContext.Provider value={{ notification, showNotification, closeNotification }}>
            {children}
            {notification && (
                <aside
                    key={notification.id}
                    className={`pg-toast-container ${activeConfig.className}`}
                    role="alert"
                    aria-live="assertive"
                >
                    <div className="pg-toast-content">
                        <div className="pg-toast-icon-wrap">
                            {activeConfig.icon}
                        </div>
                        <div className="pg-toast-body">
                            <div className="pg-toast-header">
                                <span className="pg-toast-title">{activeConfig.title}</span>
                                <span className="pg-toast-time">Just now</span>
                            </div>
                            <div className="pg-toast-message">{notification.message}</div>
                        </div>
                        <button
                            onClick={closeNotification}
                            className="pg-toast-close"
                            aria-label="Close notification"
                        >
                            <CloseIcon style={{ fontSize: '16px' }} />
                        </button>
                    </div>
                    <div className="pg-toast-progress-track">
                        <div
                            className="pg-toast-progress-bar"
                            style={{ animationDuration: `${notification.duration}ms` }}
                        />
                    </div>
                </aside>
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
