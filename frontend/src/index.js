import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Suppress third-party browser extension errors (e.g. chrome-extension://... reading 'M_ID')
window.addEventListener('error', (event) => {
  if (
    (event.filename && (event.filename.includes('chrome-extension://') || event.filename.includes('moz-extension://') || event.filename.includes('safari-extension://'))) ||
    (event.message && (event.message.includes('M_ID') || event.message.includes('extension')))
  ) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const stack = (reason && reason.stack) || '';
  const message = (reason && reason.message) || String(reason || '');
  if (
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-extension://') ||
    message.includes('M_ID')
  ) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
