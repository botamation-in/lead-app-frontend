import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import ApiTab from './settings/ApiTab';
import DeleteAccountPage from './settings/DeleteAccountPage';
import AccountCombobox from '../components/AccountCombobox';

const TABS = [
    { id: 'api', label: 'API Key' },
    { id: 'deleteAccount', label: 'Delete Account' },
];

const SettingsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, userDetails, logout } = useAuth();
    const {
        acctId,
        acctNo,
        acctName,
        accounts,
        isAccountLinked,
        accountsLoaded,
        setIsLinkDialogOpen,
        switchAccount,
    } = useAccount();

    const [activeTab, setActiveTab] = useState('api');
    const [showUserMenu, setShowUserMenu] = useState(false);

    const userMenuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Read ?acc= from URL for DeleteAccountPage
    const accountFromUrl = new URLSearchParams(location.search).get('acc') || acctNo || '';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Navbar (same style as LeadsGrid) ────────────────────────── */}
            <nav className="bg-gradient-to-b from-slate-900 to-slate-800 border-b border-slate-700/60" style={{boxShadow: '0 4px 24px 0 rgba(99,102,241,0.10), 0 1px 0 0 rgba(255,255,255,0.04) inset'}}>
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <div className="py-2">
                            <BrandLogo />
                        </div>

                        {/* Menu items */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => navigate('/leads')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-slate-400 hover:bg-slate-700/50 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Leads
                                </div>
                            </button>
                            <button
                                onClick={() => navigate('/admin')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-slate-400 hover:bg-slate-700/50 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Admin
                                </div>
                            </button>
                            <button
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative bg-gradient-to-b from-slate-700/80 to-slate-800/80 text-white shadow-lg"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 to-violet-400 rounded-t-full"></div>
                            </button>
                        </div>

                        {/* Right side: Account + User */}
                        <div className="ml-auto py-2 flex items-center gap-2">

                            {/* Account dropdown */}
                            {/* Account dropdown */}
                            <AccountCombobox
                                accounts={accounts}
                                acctNo={acctNo}
                                acctName={acctName}
                                isAccountLinked={isAccountLinked}
                                accountsLoaded={accountsLoaded}
                                switchAccount={switchAccount}
                                setIsLinkDialogOpen={setIsLinkDialogOpen}
                                onOpen={() => setShowUserMenu(false)}
                            />

                            {/* User Profile */}
                            <div className="relative" ref={userMenuRef}>
                                <button
                                    onClick={() => { setShowUserMenu(v => !v); }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/70 transition-all duration-300 border border-slate-600/70 backdrop-blur-sm"
                                >
                                    {(() => {
                                        const imgUrl = userDetails?.profileImageUrl || '';
                                        const src = imgUrl.startsWith('http') ? imgUrl : (imgUrl ? imgUrl : '');
                                        return src
                                            ? <img src={src} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-indigo-400/40 flex-shrink-0" />
                                            : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-lg border border-indigo-400/40">
                                                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>;
                                    })()}
                                    <span className="text-xs font-medium text-white hidden md:block">{userDetails?.name || user?.name || user?.email || 'User'}</span>
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showUserMenu && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50">
                                        <div className="px-3 py-2 border-b border-gray-100">
                                            <p className="text-xs font-semibold text-gray-900">{user?.name || 'User'}</p>
                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{user?.email || ''}</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            My Profile
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                logout();
                                            }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            My Profile
                                        </button>
                                        <button
                                            onClick={() => { setShowUserMenu(false); logout(); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* end User Profile */}

                        </div>
                        {/* end Right side */}
                    </div>
                </div>
            </nav>

            {/* ── Page body ─────────────────────────────────────────────────── */}
            <div className="container mx-auto px-4 py-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Tab bar */}
                    <div className="border-b border-gray-200 px-6">
                        <nav className="flex gap-0 -mb-px">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-indigo-600 text-indigo-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Tab content */}
                    <div className="p-6">
                        {activeTab === 'api' && (
                            <ApiTab acctId={acctId} />
                        )}
                        {activeTab === 'deleteAccount' && (
                            <DeleteAccountPage
                                acctId={acctId}
                                accountFromUrl={accountFromUrl}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
