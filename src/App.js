import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import Dashboard from './components/Dashboard';
import VehicleIntake from './components/VehicleIntake';
import WorkOrders from './components/WorkOrders';
import WorkOrderDetails from './components/WorkOrderDetails';
import OwnersList from './components/OwnersList';
import OwnerDetail from './components/OwnerDetail';
import Scheduling from './components/Scheduling';
import Inventory from './components/Inventory';
import Invoices from './components/Invoices';
import Staff from './components/Staff';
import StaffLogin from './components/StaffLogin';
import AuditLog from './components/AuditLog';
import UserManagement from './components/UserManagement';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/work-orders/details" element={<WorkOrderDetails />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetails />} />
        <Route path="/owners" element={<OwnersList />} />
        <Route path="/owners/details" element={<OwnerDetail />} />
        <Route path="/owners/:id" element={<OwnerDetail />} />
        <Route path="/intake" element={<VehicleIntake />} />
        <Route path="/scheduling" element={<Scheduling />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/login" element={<StaffLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
