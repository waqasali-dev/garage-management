/**
 * Centralized Global Express Error Handler Middleware
 * Mitigates internal stack trace and schema details leakage (CWE-209 / SEC-11)
 */
export const errorHandler = (err, req, res, next) => {
    console.error(`[API ERROR] ${req.method} ${req.originalUrl}:`, err.stack || err.message);

    const isProduction = process.env.NODE_ENV === "production";

    // Database error classification (PostgreSQL error codes)
    if (err.code === "23505") {
        return res.status(409).json({
            error: "A record with this unique identifier already exists in the database.",
            ...(!isProduction && { detail: err.detail }),
        });
    }

    if (err.code === "23503") {
        return res.status(400).json({
            error: "Foreign key reference violation: referenced resource does not exist.",
            ...(!isProduction && { detail: err.detail }),
        });
    }

    if (err.code === "22P02") {
        return res.status(400).json({
            error: "Invalid input syntax for parameter type.",
            ...(!isProduction && { detail: err.detail }),
        });
    }

    const statusCode = err.statusCode || err.status || 500;
    const safeMessage = (statusCode >= 500 && isProduction)
        ? "An unexpected internal server error occurred."
        : (err.message || "An unexpected error occurred.");

    res.status(statusCode).json({
        error: safeMessage,
        ...(!isProduction && { stack: err.stack }),
    });
};

export default errorHandler;
