/**
 * Centralized Global Express Error Handler Middleware
 */
export const errorHandler = (err, req, res, next) => {
    console.error(`[API ERROR] ${req.method} ${req.originalUrl}:`, err.stack || err.message);

    // Database error classification
    if (err.code === "23505") {
        return res.status(409).json({
            error: "A record with this unique identifier already exists in the database.",
            detail: err.detail,
        });
    }

    if (err.code === "23503") {
        return res.status(400).json({
            error: "Foreign key reference violation: referenced resource does not exist.",
            detail: err.detail,
        });
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "An unexpected internal server error occurred.";

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
};

export default errorHandler;
