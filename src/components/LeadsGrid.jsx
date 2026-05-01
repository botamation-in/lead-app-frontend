import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ExcelJS from 'exceljs';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import { useNotifications } from './Notifications';
import LoadingMask from './LoadingMask';
import DeleteConfirmation from './DeleteConfirmation';
import Tooltip from './Tooltip';
import AppNavbar from './AppNavbar';
import Button from './ui/Button';


// Avatar colour palette — used in lead row renderer
const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
const LeadsGrid = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { showSuccess, showError, NotificationComponent } = useNotifications();
    const {
        acctNo,
        acctId,
        isAccountLinked,
        accountsLoaded,
        accountsLoading,
        setIsLinkDialogOpen,
    } = useAccount();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    // Edit / Delete state
    const [editLead, setEditLead] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [editFields, setEditFields] = useState([]);
    const [isEditFormVisible, setIsEditFormVisible] = useState(false);
    const [isGridVisible, setIsGridVisible] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteLeadId, setDeleteLeadId] = useState(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [error, setError] = useState(null);
    const [fields, setFields] = useState([]);

    const [isExporting, setIsExporting] = useState(false);

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
            if (columnSelectorRef.current && !columnSelectorRef.current.contains(e.target)) {
                setShowColumnSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Responsive: hide grid on mobile when edit form is open
    const checkWindowSize = () => {
        const isSmallScreen = window.innerWidth <= 768;
        setIsGridVisible(isSmallScreen ? !isEditFormVisible : true);
    };

    useEffect(() => {
        checkWindowSize();
        window.addEventListener('resize', checkWindowSize);
        return () => window.removeEventListener('resize', checkWindowSize);
    }, [isEditFormVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const [deleteCategoryPending, setDeleteCategoryPending] = useState(null); // { _id, categoryName, leadCount }
    const [deleteCategoryLoading, setDeleteCategoryLoading] = useState(false);

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
        setAppliedFilters(() => (value ? { categoryId: value } : {}));
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

    const handleDeleteCategoryConfirm = async () => {
        if (!deleteCategoryPending) return;
        setDeleteCategoryLoading(true);
        try {
            await api.delete(`/api/ui/leads/categories/${deleteCategoryPending._id}`, { params: { acctId } });
            showSuccess(`Category "${deleteCategoryPending.categoryName}" and all its leads have been deleted.`);
            // Remove from list
            const remaining = categories.filter(c => c._id !== deleteCategoryPending._id);
            setCategories(remaining);
            // If the deleted category was selected, switch to the next best one
            if (selectedCategory === deleteCategoryPending._id) {
                const next = remaining.find(c => c.default) || remaining[0] || null;
                const nextId = next?._id || '';
                setSelectedCategory(nextId);
                saveSelectedCategory(acctId, nextId || null);
                // Update URL
                const params = new URLSearchParams(window.location.search);
                if (nextId) params.set('categoryId', nextId);
                else params.delete('categoryId');
                navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
                setAppliedFilters(prev => {
                    const f = { ...prev };
                    if (nextId) f.categoryId = nextId;
                    else delete f.categoryId;
                    return f;
                });
            }
            setDeleteCategoryPending(null);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete category.');
        } finally {
            setDeleteCategoryLoading(false);
        }
    };

    // Fetch leads from API
    const fetchLeads = async () => {
        // Wait until account state is resolved and categories are ready before fetching
        if (!isAccountLinked || !acctId || !categoriesReady) {
            if (accountsLoaded && !accountsLoading && !isAccountLinked) setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { categoryId: _omit, ...safeFilters } = appliedFilters;
            const params = {
                page: currentPage,
                limit: pageSize,
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctId && { acctId }),
                ...(selectedCategory && { categoryId: selectedCategory }),
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
            // Deduplicate while preserving order (guards against backend sending duplicate fields)
            const displayFields = [...new Set(baseFields)];

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
            const { categoryId: _exportOmit, ...exportFilters } = appliedFilters;
            const params = {
                limit: 100000, // fetch all matching records
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctId && { acctId }),
                ...(selectedCategory && { categoryId: selectedCategory }),
                ...exportFilters
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

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Leads');

            const headerKeys = Object.keys(rows[0] || {});
            worksheet.columns = headerKeys.map(key => ({
                header: key,
                key,
                width: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2
            }));
            rows.forEach(row => {
                worksheet.addRow(row);
            });

            const filterSuffix = Object.keys(appliedFilters).length > 0 ? '_filtered' : '';
            const fileName = `leads${filterSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            showSuccess(`Exported ${allLeads.length} lead${allLeads.length !== 1 ? 's' : ''} to ${fileName}`);
        } catch (err) {
            showError(err.message || 'Failed to export leads.');
            console.error('Export error:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Add lead
    const handleAdd = () => {
        setEditLead(null);
        const initialForm = {};
        fields.forEach(f => { initialForm[f] = ''; });
        setEditFields(fields);
        setEditForm(initialForm);
        setIsEditFormVisible(true);
    };

    // Edit lead
    const handleEditOpen = (lead) => {
        setEditLead(lead);
        const excluded = ['__v', '_id', 'acctId', 'categoryId', 'adminId', 'adminName', 'createdAt', 'updatedAt'];
        const leadFields = Object.keys(lead || {}).filter(field => !excluded.includes(field));
        const orderedFields = [
            ...fields,
            ...leadFields.filter(field => !fields.includes(field))
        ];
        const formData = {};
        orderedFields.forEach(f => { formData[f] = lead[f] ?? ''; });
        setEditFields(orderedFields);
        setEditForm(formData);
        setIsEditFormVisible(true);
    };

    const handleEditSave = async () => {
        setIsSaving(true);
        try {
            if (editLead) {
                // UPDATE — existing lead
                const { adminId: _a, adminName: _b, ...editableFields } = editForm;
                // Coerce fields that were originally numeric (or look like pure numbers) back to numbers
                const coerced = Object.fromEntries(
                    Object.entries(editableFields).map(([k, v]) => {
                        if (v !== '' && v !== null && v !== undefined) {
                            const orig = editLead[k];
                            const isOrigNumber = typeof orig === 'number';
                            const looksNumeric = !isNaN(Number(v)) && String(v).trim() !== '' && !/^0\d/.test(String(v));
                            if (isOrigNumber || (looksNumeric && typeof orig !== 'string')) {
                                return [k, Number(v)];
                            }
                            // Also coerce if original was a numeric string (e.g. "10" stored as string)
                            if (typeof orig === 'string' && looksNumeric && /^\d+(\.\d+)?$/.test(String(orig).trim())) {
                                return [k, Number(v)];
                            }
                        }
                        return [k, v];
                    })
                );
                await api.put(`/api/ui/leads/${editLead._id}`, coerced, { params: { acctId, acctNo } });
                showSuccess('Lead updated successfully.');
            } else {
                // CREATE — new lead
                const activeCat = categories.find(c => c._id === selectedCategory);
                const categoryName = activeCat?.categoryName;
                const createUrl = categoryName
                    ? `/api/ui/leads/category/${encodeURIComponent(categoryName)}`
                    : '/api/ui/leads';
                await api.post(createUrl, { data: { ...editForm } }, { params: { acctId } });
                showSuccess('Lead created successfully.');
            }
            setIsEditFormVisible(false);
            setEditLead(null);
            setEditFields([]);
            fetchLeads();
        } catch (err) {
            showError(err.response?.data?.message || (editLead ? 'Failed to update lead.' : 'Failed to create lead.'));
        } finally {
            setIsSaving(false);
        }
    };

    const cancelEdit = () => {
        setIsEditFormVisible(false);
        setEditLead(null);
        setEditFields([]);
    };

    // Delete lead
    const handleDeleteOpen = (leadId) => {
        setDeleteLeadId(leadId);
        setIsDeleteOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteLeadId) return;
        try {
            await api.delete(`/api/ui/leads/${deleteLeadId}`, { params: { acctId } });
            showSuccess('Lead deleted successfully.');
            setIsDeleteOpen(false);
            setDeleteLeadId(null);
            fetchLeads();
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete lead.');
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
                <svg className="absolute -right-4 w-3 h-3 text-indigo-400 opacity-0 group-hover/sort:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortOrder === 'asc' ? (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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



    const getColumnAlignClass = (field, type) => {
        const align = 'center'; // Center align all columns

        if (type === 'th') return align === 'left' ? 'text-left' : 'text-center';
        if (type === 'flex') return align === 'left' ? 'justify-start' : 'justify-center';
        if (type === 'td') return align === 'left' ? 'text-left' : 'text-center';
        if (type === 'input') return align === 'left' ? 'text-left' : 'text-center';

        return '';
    };

    const isEditFormDirty = (() => {
        if (!editForm) return false;
        if (!editLead) {
            // New lead - check if any field has been filled
            return Object.values(editForm).some(val => val && val.toString().trim() !== '');
        }
        // Existing lead - compare each editable field to its original value
        return Object.keys(editForm).some(key => {
            if (key === 'adminId' || key === 'adminName') return false; // Ignore readonly/system fields in comparison
            const originalVal = editLead[key] == null ? '' : String(editLead[key]);
            const currentVal = editForm[key] == null ? '' : String(editForm[key]);
            return currentVal !== originalVal;
        });
    })();

    return (
        <div className="h-[100dvh] w-[100dvw] flex flex-col bg-gray-50 overflow-hidden relative">
            <LoadingMask loading={isExporting} title="Exporting..." message="Please wait while we export your leads to Excel" />
            <NotificationComponent />
            {/* Navigation Menu */}
            <AppNavbar activePage="leads" />

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4 py-3 relative">
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
                            <Button
                                onClick={() => setIsLinkDialogOpen(true)}
                            >
                                Link Account
                            </Button>
                        </div>
                    </div>
                )}

                {isAccountLinked && (
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <div className="mb-3 flex-shrink-0 flex items-center justify-start gap-1">

                            {/* ── Group 1: Data context — Category selector + delete ── */}
                            <div className="flex items-center gap-1.5">
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
                                        <Tooltip content={`Delete category "${activeCat.categoryName}"`} placement="top">
                                            <button
                                                onClick={() => setDeleteCategoryPending(activeCat)}
                                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-red-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-red-400 focus:ring-1 focus:ring-red-300"
                                            >
                                                <svg className="w-4 h-4 text-gray-600 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </Tooltip>
                                    ) : null;
                                })()}
                            </div>

                            {/* Divider */}
                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* ── Group 2: View & filter — Clear filters + Refresh ── */}
                            <div className="flex items-center gap-1.5">
                                <Tooltip
                                    content={Object.keys(appliedFilters).filter(k => k !== 'categoryId').length > 0 ? `Clear ${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length} active filter${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length !== 1 ? 's' : ''}` : 'No active filters'}
                                    placement="top"
                                >
                                    <button
                                        onClick={() => {
                                            const cleared = {};
                                            fields.forEach(f => { cleared[f] = ''; });
                                            setFilters(cleared);
                                            saveFilters(acctId, selectedCategory, null);
                                            setAppliedFilters(prev => {
                                                const updated = {};
                                                if (prev.categoryId) updated.categoryId = prev.categoryId;
                                                return updated;
                                            });
                                            setCurrentPage(1);
                                        }}
                                        disabled={loading || Object.keys(appliedFilters).filter(k => k !== 'categoryId').length === 0}
                                        className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed ${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length > 0
                                            ? 'bg-red-50 border-red-400 focus:ring-red-300'
                                            : 'bg-transparent border-gray-300 hover:bg-red-50 hover:border-red-400 focus:ring-red-300'
                                            }`}
                                        title={Object.keys(appliedFilters).filter(k => k !== 'categoryId').length > 0 ? `Clear ${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length} active filter${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length !== 1 ? 's' : ''}` : 'No active filters'}
                                    >
                                        <svg className={`w-4 h-4 transition-colors ${Object.keys(appliedFilters).filter(k => k !== 'categoryId').length > 0 ? 'text-red-500' : 'text-gray-600 group-hover:text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12" />
                                        </svg>
                                    </button>
                                </Tooltip>
                                <Tooltip content={loading ? 'Loading...' : 'Refresh leads'} placement="top">
                                    <button
                                        onClick={fetchLeads}
                                        disabled={loading}
                                        className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-indigo-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={loading ? 'Loading...' : 'Refresh leads'}
                                    >
                                        <svg
                                            className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
                                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* ── Group 3: Display — Show / hide columns ── */}
                            {fields.length > 0 && (
                                <div className="relative" ref={columnSelectorRef}>
                                    <Tooltip content="Show / hide columns" placement="top">
                                        <button
                                            onClick={() => setShowColumnSelector(v => !v)}
                                            className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 focus:ring-violet-400 ${(visibleFields !== null && visibleFields.length !== fields.length) || showColumnSelector
                                                ? 'bg-violet-50 border-violet-400'
                                                : 'bg-transparent border-gray-300 hover:bg-violet-50 hover:border-violet-400'
                                                }`}
                                            title="Show / hide columns"
                                        >
                                            <svg
                                                className={`w-4 h-4 transition-colors ${(visibleFields !== null && visibleFields.length !== fields.length) || showColumnSelector
                                                    ? 'text-violet-600'
                                                    : 'text-gray-600 group-hover:text-violet-600'
                                                    }`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                                            </svg>
                                            {visibleFields !== null && visibleFields.length !== fields.length && (
                                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-600 rounded-full text-white text-[8px] flex items-center justify-center font-bold leading-none">
                                                    {visibleFields.length}
                                                </span>
                                            )}
                                        </button>
                                    </Tooltip>

                                    {showColumnSelector && (
                                        <div className="absolute left-0 mt-1 w-52 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
                                            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                                                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Columns</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => updateVisibleFields(null)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold">All</button>
                                                    <span className="text-gray-300 text-[10px]">|</span>
                                                    <button onClick={() => updateVisibleFields(fields.slice(0, 1))} className="text-[10px] text-gray-400 hover:text-gray-700 font-semibold">None</button>
                                                </div>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto py-1">
                                                {fields.map(field => {
                                                    const checked = visibleFields === null || visibleFields.includes(field);
                                                    return (
                                                        <label key={field} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
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
                                                                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer flex-shrink-0"
                                                            />
                                                            <span className="text-[11px] text-gray-700 font-medium truncate">{formatFieldName(field)}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Divider */}
                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* ── Group 4: Output — Export + Analytics ── */}
                            <div className="flex items-center gap-1.5">
                                <Tooltip
                                    content={isExporting ? 'Exporting...' : (Object.keys(appliedFilters).length > 0 ? `Export filtered leads (${totalRecords}) to Excel` : 'Export all leads to Excel')}
                                    placement="top"
                                >
                                    <button
                                        onClick={handleExportExcel}
                                        disabled={isExporting || loading}
                                        className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-emerald-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-emerald-500 focus:ring-1 focus:ring-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
                                </Tooltip>
                                <Tooltip content="Open Analytics" placement="top">
                                    <button
                                        onClick={() => window.open('/analytics', '_blank')}
                                        className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-blue-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-blue-500 focus:ring-1 focus:ring-blue-400"
                                    >
                                        <svg className="w-4 h-4 text-gray-600 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* ── Group 5: Primary action — Add new lead ── */}
                            <Tooltip content="Add New Lead" placement="top">
                                <Button
                                    size="sm"
                                    onClick={handleAdd}
                                    disabled={loading || fields.length === 0}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Lead
                                </Button>
                            </Tooltip>

                        </div>

                        {/* Split Panel: Table (left) + Edit Form (right) */}
                        <div className="flex flex-col sm:flex-row gap-4 transition-all duration-300 flex-1 min-h-0 w-full">

                            {/* LEFT — Table panel */}
                            {isGridVisible && (
                                <div
                                    className={`transition-all duration-300 flex flex-col min-h-0 h-full ${isEditFormVisible ? 'w-full sm:w-[calc(66.666%-0.5rem)]' : 'w-full'}`}
                                >
                                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200 animate-scale-in">
                                        {error && (
                                            <div className="bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900 px-3 py-2 m-3 rounded-lg">
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

                                        <div className="flex-1 overflow-y-scroll overflow-x-auto min-h-0">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all group/header">
                                                    <tr>
                                                        {(visibleFields ?? fields).map((field) => (
                                                            <th key={field} className={`px-3 py-2.5 relative align-bottom ${getColumnAlignClass(field, 'th')}`}>
                                                                <div
                                                                    className={`flex items-center cursor-pointer group/sort mb-1.5 transition-colors ${getColumnAlignClass(field, 'flex')}`}
                                                                    onClick={() => handleSort(field)}
                                                                >
                                                                    <div className="relative inline-flex items-center">
                                                                        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider group-hover/sort:text-indigo-600 transition-colors">
                                                                            {formatFieldName(field)}
                                                                        </span>
                                                                        {renderSortIcon(field)}
                                                                    </div>
                                                                </div>
                                                                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${Object.values(filters).some(Boolean) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-hover/header:grid-rows-[1fr] group-focus-within/header:grid-rows-[1fr]'}`}>
                                                                    <div className="overflow-hidden">
                                                                        <div className="pb-1 pt-0.5 px-0.5">
                                                                            <div className="relative rounded-md bg-slate-200/80 focus-within:bg-gradient-to-r focus-within:from-indigo-500 focus-within:via-violet-400 focus-within:to-indigo-500 p-[1px] transition-all duration-300 shadow-sm focus-within:shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Filter..."
                                                                                    value={filters[field] || ''}
                                                                                    onChange={(e) => handleFilterChange(field, e.target.value)}
                                                                                    onKeyDown={(e) => handleFilterKeyDown(e, field)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className={`w-full px-2 py-1 text-[10px] bg-white/70 focus:bg-white text-slate-700 rounded-[5px] outline-none placeholder-slate-400 transition-all ${getColumnAlignClass(field, 'input')}`}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-3 py-2.5 text-center w-20 align-bottom">
                                                            <div className="flex items-center justify-center gap-1 mb-1.5">
                                                                <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</span>
                                                            </div>
                                                            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${Object.values(filters).some(Boolean) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-hover/header:grid-rows-[1fr] group-focus-within/header:grid-rows-[1fr]'}`}>
                                                                <div className="overflow-hidden">
                                                                    <div className="pb-1 pt-0.5 px-0.5 opacity-0 pointer-events-none">
                                                                        <div className="p-[1px]">
                                                                            <input type="text" className="w-full px-2 py-1 text-[10px]" disabled />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th colSpan="100" className="p-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-400 to-indigo-500 border-none shadow-[0_0_15px_rgba(99,102,241,0.6)] relative z-20"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`bg-white divide-y divide-gray-100 transition-opacity duration-200 ${loading && leads.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {loading && leads.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={(visibleFields ?? fields).length + 1} className="px-3 py-6 text-center">
                                                                <div className="flex flex-col justify-center items-center gap-2">
                                                                    <div className="relative">
                                                                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300"></div>
                                                                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent absolute top-0"></div>
                                                                    </div>
                                                                    <span className="text-gray-600 text-xs font-medium">Loading leads...</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : leads.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={(visibleFields ?? fields).length + 1} className="px-3 py-6 text-center">
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
                                                                                <td key={field} className={`px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium ${getColumnAlignClass(field, 'td')}`}>-</td>
                                                                            );
                                                                        }
                                                                        const imgUrl = lead.adminImage || lead.adminProfileImage || null;
                                                                        const adminName = lead.adminName || '-';
                                                                        const initial = adminName !== '-' ? adminName.charAt(0).toUpperCase() : null;

                                                                        const avatarColor = initial ? COLORS[(initial.charCodeAt(0) || 0) % COLORS.length] : null;
                                                                        return (
                                                                            <td key={field} className={`px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium ${getColumnAlignClass(field, 'td')}`}>
                                                                                {adminName === '-' ? (
                                                                                    <span>-</span>
                                                                                ) : (
                                                                                    <div className={`flex items-center gap-1.5 ${getColumnAlignClass(field, 'flex')}`}>
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
                                                                        <td key={field} className={`px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium ${getColumnAlignClass(field, 'td')}`}>
                                                                            {formatFieldValue(field, lead[field])}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="px-3 py-2 whitespace-nowrap text-center">
                                                                    <div className="flex items-center justify-center gap-1.5">
                                                                        <Tooltip content="Edit lead" placement="top">
                                                                            <button
                                                                                onClick={() => handleEditOpen(lead)}
                                                                                className="group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md hover:bg-blue-50 transition-all duration-200 hover:scale-110 border border-gray-300 hover:border-blue-300 focus:ring-1 focus:ring-blue-300"
                                                                            >
                                                                                <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                                </svg>
                                                                            </button>
                                                                        </Tooltip>
                                                                        <Tooltip content="Delete lead" placement="top">
                                                                            <button
                                                                                onClick={() => handleDeleteOpen(lead._id)}
                                                                                className="group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md hover:bg-red-50 transition-all duration-200 hover:scale-110 border border-gray-300 hover:border-red-300 focus:ring-1 focus:ring-red-300"
                                                                            >
                                                                                <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                </svg>
                                                                            </button>
                                                                        </Tooltip>
                                                                    </div>
                                                                </td>
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
                                                    className="relative inline-flex items-center px-2 py-1 border border-indigo-200 text-xs font-medium rounded text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    onClick={() => goToPage(currentPage + 1)}
                                                    disabled={currentPage === totalPages}
                                                    className="ml-2 relative inline-flex items-center px-2 py-1 border border-indigo-200 text-xs font-medium rounded text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-xs text-gray-700 font-medium">
                                                        Showing <span className="font-bold text-indigo-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                                                        <span className="font-bold text-indigo-700">
                                                            {Math.min(currentPage * pageSize, totalRecords)}
                                                        </span> of{' '}
                                                        <span className="font-bold text-indigo-700">{totalRecords}</span> results
                                                    </p>
                                                </div>
                                                <div>
                                                    <nav className="relative z-0 inline-flex rounded shadow-sm -space-x-px" aria-label="Pagination">
                                                        <button
                                                            onClick={() => goToPage(currentPage - 1)}
                                                            disabled={currentPage === 1}
                                                            className="relative inline-flex items-center px-2 py-1 rounded-l border border-indigo-200 bg-white text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                                                                            ? 'z-10 bg-gradient-to-b from-indigo-500 to-indigo-700 border-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                                            : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50'
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
                                                            className="relative inline-flex items-center px-2 py-1 rounded-r border border-indigo-200 bg-white text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

                            {/* RIGHT — Add / Edit form panel */}
                            {isEditFormVisible && (
                                <div
                                    className="w-full sm:w-[calc(33.333%-0.5rem)] bg-white border border-gray-300 rounded-lg shadow-sm relative flex flex-col h-full overflow-hidden"
                                >
                                    {/* Action buttons */}
                                    <div className="flex items-center justify-between gap-2 p-4 pb-3 border-b border-gray-200 shrink-0">
                                        <h3 className="text-xs font-bold text-gray-700">
                                            {editLead ? 'Edit Lead' : 'Add New Lead'}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                             <Button
                                                size="sm"
                                                onClick={handleEditSave}
                                                disabled={isSaving || !isEditFormDirty}
                                                loading={isSaving}
                                             >
                                                 Save
                                             </Button>
                                             <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={cancelEdit}
                                                disabled={isSaving}
                                             >
                                                 Cancel
                                             </Button>
                                        </div>
                                    </div>

                                    {/* Form fields */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <div className="grid grid-cols-1 gap-4">
                                            {editFields.map(field => {
                                                const isNumeric = editLead
                                                    ? editLead[field] !== null && editLead[field] !== undefined && editLead[field] !== '' && !isNaN(Number(editLead[field])) && typeof editLead[field] === 'number'
                                                    : false;
                                                return (
                                                    <div key={field}>
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                            {formatFieldName(field)}
                                                        </label>
                                                        <input
                                                            type={isNumeric ? 'number' : 'text'}
                                                            value={editForm[field] ?? ''}
                                                            onChange={e => setEditForm(prev => ({ ...prev, [field]: isNumeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value }))}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                                            disabled={isSaving}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation */}
            <DeleteConfirmation
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Delete Lead"
                message="Are you sure you want to delete this lead? This action cannot be undone."
            />

            {/* Delete Category Confirmation Modal */}
            {deleteCategoryPending && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleteCategoryLoading && setDeleteCategoryPending(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 animate-fade-in">
                        {/* Icon */}
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 text-center mb-2">Delete Category</h3>
                        <p className="text-sm text-gray-600 text-center mb-1">
                            You are about to permanently delete the category
                        </p>
                        <p className="text-sm font-semibold text-gray-900 text-center mb-3">
                            &ldquo;{deleteCategoryPending.categoryName}&rdquo;
                        </p>
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
                            <p className="text-xs text-red-700 text-center leading-relaxed">
                                This will also delete <strong>all leads</strong> in this category.<br />
                                This action <strong>cannot be recovered</strong>.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                block
                                variant="secondary"
                                onClick={() => setDeleteCategoryPending(null)}
                                disabled={deleteCategoryLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                block
                                variant="danger"
                                onClick={handleDeleteCategoryConfirm}
                                disabled={deleteCategoryLoading}
                                loading={deleteCategoryLoading}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete permanently
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsGrid;
