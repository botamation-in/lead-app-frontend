import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import * as XLSX from 'xlsx';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import AccountCombobox from './AccountCombobox';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import { useNotifications } from './Notifications';
import LoadingMask from './LoadingMask';

const LeadsGrid = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, userDetails, logout } = useAuth();
    const {
        acctNo,
        acctId,
        acctName,
        accounts,
        isAccountLinked,
        accountsLoaded,
        accountsLoading,
        setIsLinkDialogOpen,
        switchAccount,
    } = useAccount();
    const { showSuccess, showError, NotificationComponent } = useNotifications();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fields, setFields] = useState([]);

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const userMenuRef = useRef(null);
    const filterTimerRef = useRef(null);
    const columnSelectorRef = useRef(null);

    // Column visibility: null = all visible; array = selected field keys (in original order)
    const [visibleFields, setVisibleFields] = useState(null);
    const [showColumnSelector, setShowColumnSelector] = useState(false);

    // localStorage key scoped per account + category — nested format
    const COL_VIS_KEY = 'colVis';
    const FILTERS_KEY = 'filters';
    const SELECTED_CATEGORY_KEY = 'selectedCategory';

    const readFiltersStore = () => {
        try {
            const raw = localStorage.getItem(FILTERS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch { return {}; }
    };

    const loadFilters = (acctId, categoryId) => {
        try {
            const store = readFiltersStore();
            return store[acctId]?.[categoryId || ''] ?? null;
        } catch { return null; }
    };

    const saveFilters = (acctId, categoryId, value) => {
        try {
            const store = readFiltersStore();
            store[acctId] = store[acctId] || {};
            if (!value || Object.keys(value).length === 0) {
                delete store[acctId][categoryId || ''];
            } else {
                store[acctId][categoryId || ''] = value;
            }
            localStorage.setItem(FILTERS_KEY, JSON.stringify(store));
        } catch { /* ignore */ }
    };

    const readSelectedCategoryStore = () => {
        try {
            const raw = localStorage.getItem(SELECTED_CATEGORY_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch { return {}; }
    };

    const loadSelectedCategory = (acctId) => {
        try {
            const store = readSelectedCategoryStore();
            return store[acctId] ?? null;
        } catch { return null; }
    };

    const saveSelectedCategory = (acctId, value) => {
        try {
            const store = readSelectedCategoryStore();
            if (value) {
                store[acctId] = value;
            } else {
                delete store[acctId];
            }
            localStorage.setItem(SELECTED_CATEGORY_KEY, JSON.stringify(store));
        } catch { /* ignore */ }
    };

    const readColVisStore = () => {
        try {
            const raw = localStorage.getItem(COL_VIS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch { return {}; }
    };

    const loadColVis = (acctId, categoryId) => {
        try {
            // Migrate old flat keys on first read
            const oldKey = `colVis_${acctId}_${categoryId || 'all'}`;
            const oldRaw = localStorage.getItem(oldKey);
            if (oldRaw) {
                const store = readColVisStore();
                store[acctId] = store[acctId] || {};
                store[acctId][categoryId || ''] = JSON.parse(oldRaw);
                localStorage.setItem(COL_VIS_KEY, JSON.stringify(store));
                localStorage.removeItem(oldKey);
            }
            const store = readColVisStore();
            return store[acctId]?.[categoryId || ''] ?? null;
        } catch { return null; }
    };

    const saveColVis = (acctId, categoryId, value) => {
        try {
            const store = readColVisStore();
            store[acctId] = store[acctId] || {};
            if (value === null) {
                delete store[acctId][categoryId || ''];
            } else {
                store[acctId][categoryId || ''] = value;
            }
            localStorage.setItem(COL_VIS_KEY, JSON.stringify(store));
        } catch { /* ignore */ }
    };

    // Save + set column visibility
    const updateVisibleFields = (newVal) => {
        setVisibleFields(newVal);
        saveColVis(acctId, selectedCategory, newVal);
    };

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
            if (columnSelectorRef.current && !columnSelectorRef.current.contains(e.target)) {
                setShowColumnSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);

    // Sorting state
    const [sortField, setSortField] = useState('');
    const [sortOrder, setSortOrder] = useState('asc');

    // Filter state
    const [filters, setFilters] = useState({});
    const [appliedFilters, setAppliedFilters] = useState({});

    // Category filter state
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [categoriesReady, setCategoriesReady] = useState(false);

    // Fetch category names from API using acctId
    const fetchCategories = async () => {
        if (!acctId) return;
        setCategoryLoading(true);
        setCategoriesReady(false);
        setCurrentPage(1);
        try {
            const response = await api.get('/api/ui/leads/categories', { params: { acctId } });
            const d = response.data;
            const raw = Array.isArray(d)
                ? d
                : Array.isArray(d?.data)
                    ? d.data
                    : Array.isArray(d?.categories)
                        ? d.categories
                        : [];
            const filtered = raw.filter(item => item?._id && item?.categoryName);
            setCategories(filtered);
            // Resolution priority: 1) URL ?categoryId= param, 2) localStorage, 3) API default
            const urlCategoryId = new URLSearchParams(window.location.search).get('categoryId');
            const stored = loadSelectedCategory(acctId);
            const urlCat = urlCategoryId && filtered.find(c => c._id === urlCategoryId);
            const storedCat = stored && filtered.find(c => c._id === stored);
            const activeCat = urlCat || storedCat || filtered.find(c => c.default === true);
            if (activeCat) {
                setSelectedCategory(activeCat._id);
                setAppliedFilters(prev => ({ ...prev, categoryId: activeCat._id }));
                // Ensure URL reflects the active category
                const params = new URLSearchParams(window.location.search);
                params.set('categoryId', activeCat._id);
                navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
            }
            setCategoriesReady(true);
        } catch (err) {
            console.error('Error fetching categories:', err);
            setCategoriesReady(true);
        } finally {
            setCategoryLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCategoryChange = (value) => {
        setSelectedCategory(value);
        // Persist to localStorage
        saveSelectedCategory(acctId, value || null);
        // Update URL: add or remove ?categoryId=
        const params = new URLSearchParams(location.search);
        if (value) params.set('categoryId', value);
        else params.delete('categoryId');
        navigate(`${location.pathname}?${params.toString()}`, { replace: true });
        // Restore saved field filters for the new category (or reset to empty)
        const savedFilters = loadFilters(acctId, value);
        // Reset input filters to restored values (or empty strings for each existing field)
        setFilters(prev => {
            const reset = {};
            Object.keys(prev).forEach(f => { reset[f] = savedFilters?.[f] ?? ''; });
            return reset;
        });
        setAppliedFilters(() => {
            const updated = savedFilters ? { ...savedFilters } : {};
            if (value) updated['categoryId'] = value;
            else delete updated['categoryId'];
            return updated;
        });
        setCurrentPage(1);
    };

    const handleSetDefault = async (categoryId) => {
        try {
            await api.put(`/api/ui/leads/categories/${categoryId}/default`, { acctId });
            setCategories(prev => prev.map(c => ({ ...c, default: c._id === categoryId })));
            showSuccess('Default category updated.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update default category.');
        }
    };

    // Fetch leads from API
    const fetchLeads = async () => {
        // Wait until account state is resolved and categories are ready before fetching
        if (!isAccountLinked || !acctId || !categoriesReady) return;

        setLoading(true);
        setError(null);

        try {
            const { category: _omit, ...safeFilters } = appliedFilters;
            const params = {
                page: currentPage,
                limit: pageSize,
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctId && { acctId }),
                ...safeFilters
            };

            const response = await api.get('/api/ui/leads', { params });

            setLeads(response.data.data || []);
            setTotalRecords(response.data.pagination?.total || 0);
            setTotalPages(response.data.pagination?.pages || 1);
            setCurrentPage(response.data.pagination?.page || 1);

            const excludeFields = ['__v', '_id', 'acctId', 'categoryId', 'adminName', 'adminProfileImage'];
            const apiCategoryFields = Array.isArray(response.data.categoryFields)
                ? response.data.categoryFields.filter(field => typeof field === 'string' && !excludeFields.includes(field))
                : [];
            const firstLead = (response.data.data || [])[0];
            const fallbackFields = firstLead
                ? Object.keys(firstLead).filter(field => !excludeFields.includes(field))
                : [];
            const baseFields = apiCategoryFields.length > 0 ? apiCategoryFields : fallbackFields;
            const displayFields = baseFields;

            if (displayFields.length > 0) {
                setFields(displayFields);
                // Restore saved column visibility for this account + category
                try {
                    const saved = loadColVis(acctId, selectedCategory);
                    if (saved) {
                        const valid = displayFields.filter(f => saved.includes(f));
                        setVisibleFields(valid.length > 0 ? valid : null);
                    } else {
                        setVisibleFields(null);
                    }
                } catch {
                    setVisibleFields(null);
                }

                if (Object.keys(filters).length === 0) {
                    // Restore persisted filters for this account + category on initial load
                    const savedFilters = loadFilters(acctId, selectedCategory);
                    const initialFilters = {};
                    displayFields.forEach(field => {
                        initialFilters[field] = savedFilters?.[field] ?? '';
                    });
                    setFilters(initialFilters);
                    if (savedFilters && Object.keys(savedFilters).length > 0) {
                        setAppliedFilters(prev => ({ ...prev, ...savedFilters }));
                    }
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch leads');
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeads();
    }, [currentPage, pageSize, sortField, sortOrder, appliedFilters, acctId, isAccountLinked, categoriesReady]);

    // Handle sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setCurrentPage(1);
    };

    // Handle filter input change — only updates local display state
    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    // Apply filter for a field — called on Enter key press
    const applyFilter = (field, value) => {
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        setAppliedFilters(prev => {
            const updated = { ...prev };
            if (value) updated[field] = value;
            else delete updated[field];
            // Persist field filters (exclude categoryId) to localStorage
            const { categoryId: _cat, ...fieldFilters } = updated;
            saveFilters(acctId, selectedCategory, Object.keys(fieldFilters).length > 0 ? fieldFilters : null);
            return updated;
        });
        setCurrentPage(1);
    };

    const handleFilterKeyDown = (e, field) => {
        if (e.key === 'Enter') {
            applyFilter(field, filters[field] || '');
        }
    };

    // Export to Excel with current filters
    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const params = {
                limit: 100000, // fetch all matching records
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctId && { acctId }),
                ...appliedFilters
            };

            const response = await api.get('/api/ui/leads', { params, timeout: 120000 });
            const allLeads = response.data.data || [];

            if (allLeads.length === 0) {
                showError('No data to export with the current filters.');
                return;
            }

            // Build rows: exclude internal fields, resolve adminId -> name
            const exportExcludeFields = ['__v', '_id', 'acctId', 'categoryId', 'adminName', 'adminProfileImage'];
            const apiCategoryFields = Array.isArray(response.data.categoryFields)
                ? response.data.categoryFields.filter(field => typeof field === 'string' && !exportExcludeFields.includes(field))
                : [];
            const fallbackFields = Object.keys(allLeads[0]).filter(f => !exportExcludeFields.includes(f));
            const defaultExportFields = apiCategoryFields.length > 0 ? apiCategoryFields : fallbackFields;
            const exportFields = fields.length > 0
                ? fields
                : defaultExportFields;

            const rows = allLeads.map(lead => {
                const row = {};
                exportFields.forEach(field => {
                    if (field === 'adminId') {
                        row['Admin Name'] = lead.adminName || lead.adminId || '-';
                    } else if (field === 'createdAt' || field.includes('Date') || field.includes('date')) {
                        row[formatFieldName(field)] = lead[field] ? formatDateDDMMYYYY(lead[field]) : '-';
                    } else {
                        row[formatFieldName(field)] = lead[field] ?? '-';
                    }
                });
                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

            // Auto-size columns
            const colWidths = Object.keys(rows[0] || {}).map(key => ({
                wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2
            }));
            worksheet['!cols'] = colWidths;

            const filterSuffix = Object.keys(appliedFilters).length > 0 ? '_filtered' : '';
            const fileName = `leads${filterSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            showSuccess(`Exported ${allLeads.length} lead${allLeads.length !== 1 ? 's' : ''} to ${fileName}`);
        } catch (err) {
            showError(err.message || 'Failed to export leads.');
            console.error('Export error:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Pagination handlers
    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const renderSortIcon = (field) => {
        if (sortField !== field) {
            return (
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortOrder === 'asc' ? (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    // Helper to format field names for display
    const formatFieldName = (field) => {
        if (field === 'adminId') return 'Admin Name';
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    // Helper to format date as dd.mm.yyyy HH:MM AM/PM
    const formatDateDDMMYYYY = (dateValue) => {
        const date = new Date(dateValue);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        hours = String(hours).padStart(2, '0');

        return `${day}.${month}.${year} ${hours}:${minutes} ${ampm}`;
    };

    // Helper to format field values
    const formatFieldValue = (field, value) => {
        if (!value) return '-';

        if (field === 'createdAt' || field === 'updatedAt' || field.includes('Date') || field.includes('date')) {
            return formatDateDDMMYYYY(value);
        }

        return value;
    };



    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden relative">
            <LoadingMask loading={isExporting} title="Exporting..." message="Please wait while we export your leads to Excel" />
            <NotificationComponent />
            {/* Navigation Menu */}
            <nav className="bg-black border-b border-gray-800 animate-fade-in shadow-lg flex-shrink-0">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <div className="py-2">
                            <BrandLogo />
                        </div>

                        {/* Menu Items */}
                        <div className="flex items-center gap-1">
                            <button
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative bg-gray-900 text-white shadow-lg"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Leads
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-t-full"></div>
                            </button>
                            <button
                                onClick={() => navigate('/admin')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Admin
                                </div>
                            </button>
                            <button
                                onClick={() => navigate('/settings')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </div>
                            </button>
                        </div>

                        {/* Right side: Account + User */}
                        <div className="ml-auto py-2 flex items-center gap-2">

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
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 transition-all duration-300 border border-gray-700"
                                >
                                    {(() => {
                                        const imgUrl = userDetails?.profileImageUrl || '';
                                        const src = imgUrl.startsWith('/') ? `http://localhost:8080${imgUrl}` : imgUrl;
                                        return src
                                            ? <img src={src} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-gray-600 flex-shrink-0" />
                                            : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xs font-bold shadow-lg border border-gray-600">
                                                {userDetails?.name?.charAt(0)?.toUpperCase() || user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>;
                                    })()}
                                    <span className="text-xs font-medium text-white hidden md:block">{userDetails?.name || user?.name || user?.email || 'User'}</span>
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Dropdown Menu */}
                                {showUserMenu && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50 animate-scale-in">
                                        <div className="px-3 py-2 border-b border-gray-100">
                                            <p className="text-xs font-semibold text-gray-900">{userDetails?.name || user?.name || 'User'}</p>
                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{user?.email || ''}</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
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

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4 py-3">
                {/* No Account Linked — full-page prompt */}
                {accountsLoaded && !accountsLoading && !isAccountLinked && (
                    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
                        <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-8 py-10 text-center max-w-sm">
                            <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 mb-2">No Account Linked</h2>
                            <p className="text-xs text-gray-500 mb-5">
                                You need to link a business account to view and manage leads.
                            </p>
                            <button
                                onClick={() => setIsLinkDialogOpen(true)}
                                className="px-5 py-2.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                Link Account
                            </button>
                        </div>
                    </div>
                )}

                {isAccountLinked && (
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <div className="mb-3 flex-shrink-0 flex justify-start gap-2">
                            {/* Clear Filters button */}
                            <button
                                onClick={() => {
                                    const cleared = {};
                                    fields.forEach(f => { cleared[f] = ''; });
                                    setFilters(cleared);
                                    // Remove persisted filters for this account + category
                                    saveFilters(acctId, selectedCategory, null);
                                    setAppliedFilters(prev => {
                                        const updated = {};
                                        if (prev.categoryId) updated.categoryId = prev.categoryId;
                                        return updated;
                                    });
                                    setCurrentPage(1);
                                }}
                                disabled={loading || Object.keys(appliedFilters).length === 0}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-red-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-red-400 focus:ring-1 focus:ring-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={Object.keys(appliedFilters).length > 0 ? `Clear ${Object.keys(appliedFilters).length} active filter${Object.keys(appliedFilters).length !== 1 ? 's' : ''}` : 'No active filters'}
                            >
                                <svg className="w-4 h-4 text-gray-600 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Refresh grid */}
                            <button
                                onClick={fetchLeads}
                                disabled={loading}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={loading ? 'Loading...' : 'Refresh leads'}
                            >
                                <svg
                                    className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>

                            {/* Export to Excel — icon-only */}
                            <button
                                onClick={handleExportExcel}
                                disabled={isExporting || loading}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-emerald-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-emerald-500 focus:ring-1 focus:ring-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={isExporting ? 'Exporting...' : (Object.keys(appliedFilters).length > 0 ? `Export filtered leads (${totalRecords}) to Excel` : 'Export all leads to Excel')}
                            >
                                {isExporting ? (
                                    <svg className="w-4 h-4 text-emerald-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 text-gray-600 group-hover:text-emerald-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                    </svg>
                                )}
                            </button>

                            <button
                                onClick={() => window.open('/analytics', '_blank')}
                                className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-blue-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-blue-500 focus:ring-1 focus:ring-blue-400"
                                title="Analytics"
                            >
                                <svg className="w-4 h-4 text-gray-600 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </button>

                            {/* Column Visibility Selector */}
                            {fields.length > 0 && (
                                <div className="relative" ref={columnSelectorRef}>
                                    <button
                                        onClick={() => setShowColumnSelector(v => !v)}
                                        className={`group relative w-8 h-8 bg-transparent rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 border focus:ring-1 focus:ring-orange-400 hover:bg-orange-50 hover:border-orange-500 ${showColumnSelector
                                            ? 'bg-orange-50 border-orange-500'
                                            : 'border-gray-300'
                                            }`}
                                        title="Show / hide columns"
                                    >
                                        <svg
                                            className={`w-4 h-4 transition-colors ${showColumnSelector ? 'text-orange-600' : 'text-gray-600 group-hover:text-orange-600'
                                                }`}
                                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                                        </svg>
                                        {visibleFields !== null && visibleFields.length !== fields.length && (
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-black rounded-full text-white text-[8px] flex items-center justify-center font-bold leading-none">
                                                {visibleFields.length}
                                            </span>
                                        )}
                                    </button>

                                    {showColumnSelector && (
                                        <div className="absolute left-0 mt-1 w-52 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
                                            {/* Header */}
                                            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                                                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Columns</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => updateVisibleFields(null)}
                                                        className="text-[10px] text-black hover:text-gray-600 font-semibold"
                                                    >
                                                        All
                                                    </button>
                                                    <span className="text-gray-300 text-[10px]">|</span>
                                                    <button
                                                        onClick={() => updateVisibleFields(fields.slice(0, 1))}
                                                        className="text-[10px] text-gray-400 hover:text-gray-700 font-semibold"
                                                    >
                                                        None
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Field list */}
                                            <div className="max-h-64 overflow-y-auto py-1">
                                                {fields.map(field => {
                                                    const checked = visibleFields === null || visibleFields.includes(field);
                                                    return (
                                                        <label
                                                            key={field}
                                                            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => {
                                                                    const current = visibleFields ?? fields;
                                                                    let next;
                                                                    if (current.includes(field)) {
                                                                        const removed = current.filter(f => f !== field);
                                                                        next = removed.length > 0 ? removed : current;
                                                                    } else {
                                                                        next = fields.filter(f => current.includes(f) || f === field);
                                                                    }
                                                                    updateVisibleFields(next);
                                                                }}
                                                                className="w-3.5 h-3.5 accent-black cursor-pointer flex-shrink-0"
                                                            />
                                                            <span className="text-[11px] text-gray-700 font-medium truncate">
                                                                {formatFieldName(field)}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Category Combobox + Default Checkbox */}
                            <div className="flex items-center gap-2">
                                <Combobox
                                    value={
                                        (selectedCategory ? categories.find(c => c._id === selectedCategory) : null) ?? null
                                    }
                                    onChange={(val) => handleCategoryChange(val?._id || '')}
                                    displayValue={(option) => option?.categoryName || ''}
                                    options={categories}
                                    disabled={categoryLoading || !acctId}
                                    placeholder="Select Category"
                                    className="w-40"
                                    dropdownClassName="!min-w-0"
                                >
                                    {(option) => (
                                        <ComboboxOption key={option._id} value={option}>
                                            <ComboboxLabel>{option.categoryName}</ComboboxLabel>
                                        </ComboboxOption>
                                    )}
                                </Combobox>
                                {selectedCategory && (() => {
                                    const activeCat = categories.find(c => c._id === selectedCategory);
                                    return activeCat ? (
                                        <label
                                            className="flex items-center gap-1.5 cursor-pointer select-none"
                                            title={activeCat.default ? 'This is the default category' : 'Mark as default'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!activeCat.default}
                                                onChange={() => { if (!activeCat.default) handleSetDefault(activeCat._id); }}
                                                className="w-3.5 h-3.5 accent-black cursor-pointer"
                                            />
                                            <span className="text-[11px] font-medium text-gray-600">Default</span>
                                        </label>
                                    ) : null;
                                })()}
                            </div>
                        </div>

                        {/* Table Section */}
                        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200 animate-scale-in">
                            {error && (
                                <div className="bg-gray-100 border-l-4 border-black text-gray-900 px-3 py-2 m-3 rounded-lg">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-xs font-medium">Error: {error}</span>
                                        </div>
                                        <button
                                            onClick={fetchLeads}
                                            className="text-xs font-medium underline hover:text-black transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-auto min-h-0">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-black">
                                        <tr>
                                            {(visibleFields ?? fields).map((field) => (
                                                <th key={field} className="px-3 py-2 text-center">
                                                    <div
                                                        className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-300 mb-1.5 transition-colors group"
                                                        onClick={() => handleSort(field)}
                                                    >
                                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                                            {formatFieldName(field)}
                                                        </span>
                                                        {renderSortIcon(field)}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Filter..."
                                                        value={filters[field] || ''}
                                                        onChange={(e) => handleFilterChange(field, e.target.value)}
                                                        onKeyDown={(e) => handleFilterKeyDown(e, field)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full px-2 py-1 text-[10px] border border-gray-700 bg-gray-900 text-white rounded focus:ring-1 focus:ring-gray-500 focus:border-transparent placeholder-gray-500 transition-all text-center"
                                                    />
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={(visibleFields ?? fields).length} className="px-3 py-6 text-center">
                                                    <div className="flex flex-col justify-center items-center gap-2">
                                                        <div className="relative">
                                                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300"></div>
                                                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-black border-t-transparent absolute top-0"></div>
                                                        </div>
                                                        <span className="text-gray-600 text-xs font-medium">Loading leads...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : leads.length === 0 ? (
                                            <tr>
                                                <td colSpan={(visibleFields ?? fields).length} className="px-3 py-6 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                        </svg>
                                                        <span className="text-gray-500 text-xs font-medium">No leads found</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            leads.map((lead, index) => (
                                                <tr key={lead._id} className="hover:bg-gray-50 transition-all duration-200" style={{ animationDelay: `${index * 50}ms` }}>
                                                    {(visibleFields ?? fields).map((field) => {
                                                        if (field === 'adminId') {
                                                            if (!lead.adminId) {
                                                                return (
                                                                    <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">-</td>
                                                                );
                                                            }
                                                            const imgUrl = lead.adminImage || lead.adminProfileImage || null;
                                                            const adminName = lead.adminName || '-';
                                                            const initial = adminName !== '-' ? adminName.charAt(0).toUpperCase() : null;
                                                            const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
                                                            const avatarColor = initial ? COLORS[(initial.charCodeAt(0) || 0) % COLORS.length] : null;
                                                            return (
                                                                <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                                    {adminName === '-' ? (
                                                                        <span>-</span>
                                                                    ) : (
                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                            {imgUrl ? (
                                                                                <img
                                                                                    src={imgUrl}
                                                                                    alt="admin"
                                                                                    className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0"
                                                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                                                />
                                                                            ) : (
                                                                                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[9px] select-none" style={{ backgroundColor: avatarColor }}>
                                                                                    {initial}
                                                                                </span>
                                                                            )}
                                                                            <span>{adminName}</span>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                                {formatFieldValue(field, lead[field])}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Section */}
                            <div className="flex-shrink-0 bg-gray-50 px-3 py-2 flex items-center justify-between border-t border-gray-200">
                                <div className="flex-1 flex justify-between sm:hidden">
                                    <button
                                        onClick={() => goToPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => goToPage(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="ml-2 relative inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        Next
                                    </button>
                                </div>
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs text-gray-700 font-medium">
                                            Showing <span className="font-bold text-black">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                                            <span className="font-bold text-black">
                                                {Math.min(currentPage * pageSize, totalRecords)}
                                            </span> of{' '}
                                            <span className="font-bold text-black">{totalRecords}</span> results
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded shadow-sm -space-x-px" aria-label="Pagination">
                                            <button
                                                onClick={() => goToPage(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="relative inline-flex items-center px-2 py-1 rounded-l border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                            >
                                                Previous
                                            </button>
                                            {[...Array(totalPages)].map((_, index) => {
                                                const page = index + 1;
                                                if (
                                                    page === 1 ||
                                                    page === totalPages ||
                                                    (page >= currentPage - 1 && page <= currentPage + 1)
                                                ) {
                                                    return (
                                                        <button
                                                            key={page}
                                                            onClick={() => goToPage(page)}
                                                            className={`relative inline-flex items-center px-2 py-1 border text-xs font-medium transition-all ${currentPage === page
                                                                ? 'z-10 bg-black border-black text-white shadow-lg'
                                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            {page}
                                                        </button>
                                                    );
                                                } else if (page === currentPage - 2 || page === currentPage + 2) {
                                                    return (
                                                        <span key={page} className="relative inline-flex items-center px-2 py-1 border border-gray-300 bg-white text-xs font-medium text-gray-700">
                                                            ...
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })}
                                            <button
                                                onClick={() => goToPage(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="relative inline-flex items-center px-2 py-1 rounded-r border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                            >
                                                Next
                                            </button>
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadsGrid;
