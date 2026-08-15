import React, { useState } from 'react';
import Sidebar from './Sidebar';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import './css/Staff.css';

const STAFF_DATA = [
    {
        id: 1,
        name: 'Marcus Vance',
        role: 'LEAD TECHNICIAN',
        isLead: true,
        activeJobs: 4,
        efficiency: '98%',
        workload: '85%',
        workloadLabel: '85% - Heavy',
        workloadType: 'warning',
        initials: 'MV',
    },
    {
        id: 2,
        name: 'Sarah Jenkins',
        role: 'DIAGNOSTICS TECH',
        isLead: false,
        activeJobs: 2,
        efficiency: '92%',
        workload: '45%',
        workloadLabel: '45% - Optimal',
        workloadType: 'success',
        initials: 'SJ',
    },
    {
        id: 3,
        name: 'David Tran',
        role: 'SERVICE ADVISOR',
        isLead: false,
        activeJobs: 1,
        efficiency: 'Available',
        workload: '15%',
        workloadLabel: '15% - Light',
        workloadType: 'success',
        initials: 'DT',
    },
];

export default function Staff() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredStaff = STAFF_DATA.filter((member) => {
        const search = searchTerm.toLowerCase();
        return (
            member.name.toLowerCase().includes(search) ||
            member.role.toLowerCase().includes(search)
        );
    });

    return (
        <div className="staff-layout">
            {/* Existing Sidebar Component */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Viewport Container */}
            <div className="staff-wrapper">
                {/* Top App Bar Header */}
                <header className="staff-header">
                    <div className="header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Navigation Menu"
                        >
                            <MenuIcon fontSize="small" />
                        </button>

                        <div className="search-box">
                            <SearchIcon className="search-icon" fontSize="small" />
                            <input
                                type="text"
                                placeholder="Search staff..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="header-actions">
                        <button className="icon-btn" aria-label="Notifications">
                            <NotificationsIcon fontSize="small" />
                            <span className="notification-badge"></span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Main Area */}
                <main className="staff-main">
                    <div className="content-container">
                        {/* Header Section */}
                        <div className="page-header">
                            <div>
                                <h2 className="page-title">Mechanics & Staff</h2>
                                <p className="page-subtitle">
                                    Manage personnel, workloads, and terminal access.
                                </p>
                            </div>

                            <button type="button" className="primary-btn">
                                <PersonAddIcon fontSize="small" />
                                <span>ADD STAFF MEMBER</span>
                            </button>
                        </div>

                        {/* Bento Grid Staff Cards */}
                        <div className="staff-grid">
                            {filteredStaff.map((member) => (
                                <div key={member.id} className="staff-card">
                                    <div className="card-top">
                                        <div className="profile-group">
                                            <div className="avatar-box">
                                                <span className="avatar-initials">{member.initials}</span>
                                            </div>
                                            <div>
                                                <h3 className="staff-name">{member.name}</h3>
                                                <p className={`staff-role ${member.isLead ? 'role-lead' : ''}`}>
                                                    {member.role}
                                                </p>
                                            </div>
                                        </div>

                                        <button className="more-btn" aria-label="Options">
                                            <MoreVertIcon fontSize="small" />
                                        </button>
                                    </div>

                                    <div className="metrics-row">
                                        <div className="metric-box">
                                            <span className="metric-label">
                                                {member.role === 'SERVICE ADVISOR' ? 'Pending Intakes' : 'Active Jobs'}
                                            </span>
                                            <span className="metric-value">{member.activeJobs}</span>
                                        </div>

                                        <div className="metric-box">
                                            <span className="metric-label">
                                                {member.role === 'SERVICE ADVISOR' ? 'Status' : 'Efficiency'}
                                            </span>
                                            <span className="metric-value text-success">{member.efficiency}</span>
                                        </div>
                                    </div>

                                    <div className="card-bottom">
                                        <div className="workload-info">
                                            <span className="text-muted">
                                                {member.role === 'SERVICE ADVISOR' ? 'Queue Load' : 'Workload'}
                                            </span>
                                            <span
                                                className={
                                                    member.workloadType === 'warning' ? 'text-warning' : 'text-success'
                                                }
                                            >
                                                {member.workloadLabel}
                                            </span>
                                        </div>

                                        <div className="progress-bar-track">
                                            <div
                                                className={`progress-bar-fill ${member.workloadType === 'warning' ? 'fill-warning' : 'fill-success'
                                                    }`}
                                                style={{ width: member.workload }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Quick Add Placeholder Card */}
                            <button type="button" className="quick-add-card">
                                <div className="add-icon-circle">
                                    <AddIcon fontSize="medium" />
                                </div>
                                <span className="quick-add-text">Quick Add Member</span>
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}