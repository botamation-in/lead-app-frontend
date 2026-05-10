import React from 'react';
import { useAccount } from '../context/AccountContext';
import AdminTab from './settings/AdminTab';
import AppNavbar from '../components/AppNavbar';

const AdminPage = () => {
    const { acctId } = useAccount();

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* ── Navbar ─────────────────────────────────────────────────────── */}
            <AppNavbar activePage="admin" />

            {/* ── Page body ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4 py-3">
                <AdminTab acctId={acctId} />
            </div>
        </div>
    );
};

export default AdminPage;
