// ==============================================================================
// BACKEND API CONFIGURATION
// ==============================================================================

// 🚀 LIVE PRODUCTION BACKEND (Render Cloud Deployment)
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://garage-management-hy5h.onrender.com/api';

// 💻 LOCAL DEVELOPMENT BACKEND (Uncomment to switch back to local development)
// export const API_BASE_URL = 'http://localhost:5000/api';

export default API_BASE_URL;
