import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { resolveActiveAcctNo, getAcctIdFromLocalStorage } from '../utils/accountHelpers';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import LoadingMask from '../components/LoadingMask';
import DeleteConfirmation from '../components/DeleteConfirmation';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { acctNo, acctId, accountsLoaded } = useAccount();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categoryFieldsCache, setCategoryFieldsCache] = useState({});
    const fieldsFetchPromisesRef = useRef({});

    // Category state
    const [categories, setCategories] = useState([]);
    const [categoryLoading, setCategoryLoading] = useState(false);

    // Header smart-hide state
    const [headerVisible, setHeaderVisible] = useState(true);
    const lastScrollY = useRef(0);
    const inactivityTimer = useRef(null);

    useEffect(() => {
        const resetInactivityTimer = () => {
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            inactivityTimer.current = setTimeout(() => setHeaderVisible(false), 3000);
        };

        const handleScroll = () => {
            const currentY = window.scrollY;
            if (currentY <= 0) {
                setHeaderVisible(true);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
                lastScrollY.current = 0;
                return;
            }
            if (currentY < lastScrollY.current) {
                // scrolling up — show header and arm inactivity timer
                setHeaderVisible(true);
                resetInactivityTimer();
            } else {
                // scrolling down — hide header immediately
                setHeaderVisible(false);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            }
            lastScrollY.current = currentY;
        };

        const handleScrollEnd = () => resetInactivityTimer();

        const handleMouseMove = (e) => {
            if (e.clientY < 60) {
                setHeaderVisible(true);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scrollend', handleScrollEnd, { passive: true });
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scrollend', handleScrollEnd);
            window.removeEventListener('mousemove', handleMouseMove);
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, []);

    // Chart types
    const chartTypes = [
        { value: 'pie', label: 'Pie Chart' },
        { value: 'bar', label: 'Bar Chart' },
        { value: 'line', label: 'Line Chart' },
        { value: 'heatmap', label: 'Heat Map' },
        { value: 'number', label: 'Number' }
    ];

    // Helper to format field names
    const formatFieldName = (field) => {
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    // Columns are derived dynamically per chart below

    // Aggregation types
    const aggregationTypes = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' }
    ];
    const aggregationTypesNumber = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' },
        { value: 'avg', label: 'Average' }
    ];

    // Default chart configuration
    const defaultChartConfig = {
        chartType: null,
        xAxis: null,
        yAxis: null,
        zAxis: null,
        aggregation: null,
        chartMode: null,
        dateFilterFrom: '',
        dateFilterTo: '',
        chartWidth: 'half',
        chartHeight: 320,
        chartWidthPx: null,
        chartName: '',
        barOrientation: 'vertical',
        chartColor: null,
        autoRefreshMins: null,
        chartCategory: null
    };

    const STORAGE_KEY = 'analyticsDashboard_charts';

    // Read the full nested store: { acctId: { catId: { filters: [...] } } }
    const readStore = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch {
            return {};
        }
    };

    const loadCharts = (acct) => {
        try {
            // Migrate old per-account keys into the new format on first read
            const oldKey = `analyticsDashboard_charts_${acct || 'default'}`;
            const oldRaw = localStorage.getItem(oldKey);
            if (oldRaw) {
                const oldParsed = JSON.parse(oldRaw);
                if (Array.isArray(oldParsed)) {
                    const store = readStore();
                    const acctKey = acct || 'default';
                    store[acctKey] = store[acctKey] || {};
                    oldParsed.forEach(entry => {
                        const catKey = entry.category || '';
                        store[acctKey][catKey] = { filters: entry.filter || [] };
                    });
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
                    localStorage.removeItem(oldKey);
                }
            }

            const store = readStore();
            const acctKey = acct || 'default';
            const acctData = store[acctKey] || {};

            let allCharts = [];
            let needsMigration = false;

            const keys = Object.keys(acctData);
            if (keys.length > 0 && !(keys.length === 1 && keys[0] === '')) {
                needsMigration = true;
                keys.forEach(k => {
                    allCharts.push(...(acctData[k].filters || []));
                });
                // Reassign IDs to avoid collisions
                allCharts = allCharts.map((c, i) => ({ ...c, id: i + 1 }));
                store[acctKey] = { '': { filters: allCharts } };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
            } else {
                allCharts = acctData['']?.filters || [];
            }
            return allCharts;
        } catch {
            return [];
        }
    };

    const saveCharts = (acct, chartsData) => {
        try {
            const store = readStore();
            const acctKey = acct || 'default';
            const chartsToSave = chartsData.map(chart => ({
                id: chart.id,
                chartType: chart.chartType,
                xAxis: chart.xAxis,
                yAxis: chart.yAxis,
                aggregation: chart.aggregation,
                dateFilterFrom: chart.dateFilterFrom,
                dateFilterTo: chart.dateFilterTo,
                _lastNDays: chart._lastNDays,
                _showLastN: chart._showLastN,
                _showCustom: chart._showCustom,
                chartWidth: chart.chartWidth,
                chartHeight: chart.chartHeight,
                chartWidthPx: chart.chartWidthPx ?? null,
                chartName: chart.chartName || '',
                barOrientation: chart.barOrientation || 'vertical',
                chartColor: chart.chartColor || null,
                autoRefreshMins: chart.autoRefreshMins ?? null,
                zAxis: chart.zAxis || null,
                chartMode: chart.chartMode || null,
                chartCategory: chart.chartCategory || null
            }));
            store[acctKey] = store[acctKey] || {};
            store[acctKey][''] = { filters: chartsToSave };
            // Ensure no other category keys remain
            Object.keys(store[acctKey]).forEach(k => {
                if (k !== '') delete store[acctKey][k];
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch {
            // ignore storage errors
        }
    };

    const getTodayISO = () => {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const normalizeChart = (entry) => {
        const todayISO = getTodayISO();
        return {
            ...defaultChartConfig,
            ...entry,
            id: entry.id,
            dateFilterFrom: entry.dateFilterFrom || todayISO,
            dateFilterTo: entry.dateFilterTo || todayISO,
        };
    };

    // State for charts — local to account
    const [charts, setCharts] = useState(() => {
        const initAcctId = getAcctIdFromLocalStorage();
        const saved = loadCharts(initAcctId);
        return saved.map(entry => normalizeChart(entry));
    });
    const [nextChartId, setNextChartId] = useState(() => {
        const initAcctId = getAcctIdFromLocalStorage();
        const saved = loadCharts(initAcctId);
        return saved.length > 0 ? Math.max(...saved.map(c => c.id)) + 1 : 1;
    });
    const [chartDataCache, setChartDataCache] = useState({});
    const [chartLoadingState, setChartLoadingState] = useState({});
    // Auto-refresh: per-chart countdown seconds remaining
    const [autoRefreshCountdown, setAutoRefreshCountdown] = useState({});
    const autoRefreshIntervalsRef = React.useRef({});
    const chartsForTimerRef = React.useRef([]);
    const draggedIdRef = React.useRef(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [isDraggingAny, setIsDraggingAny] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const scrollIntervalRef = React.useRef(null);
    const isResizingRef = React.useRef(false);
    const [dragHeights, setDragHeights] = useState({});
    const [dragWidths, setDragWidths] = useState({});

    // Filter panel visibility — per-chart, proximity-based
    const [filterVisible, setFilterVisible] = useState({});
    const filterLockedRef = React.useRef({});
    const pendingHideRef = React.useRef({});
    const cardRefs = React.useRef({});

    const hideFilter = (chartId) => {
        if (!filterLockedRef.current[chartId]) {
            setFilterVisible(prev => { const n = { ...prev }; delete n[chartId]; return n; });
        } else {
            // Mark for hide-after-unlock (e.g. mouse left while combobox dropdown was open)
            pendingHideRef.current[chartId] = true;
        }
    };

    // Release all locks on document mouseup (covers combobox portal selections)
    React.useEffect(() => {
        const onDocMouseUp = () => {
            setTimeout(() => {
                const pending = Object.keys(pendingHideRef.current);
                filterLockedRef.current = {};
                if (pending.length) {
                    pendingHideRef.current = {};
                    setFilterVisible(prev => {
                        const n = { ...prev };
                        pending.forEach(id => delete n[id]);
                        return n;
                    });
                }
            }, 200);
        };
        document.addEventListener('mouseup', onDocMouseUp);
        return () => document.removeEventListener('mouseup', onDocMouseUp);
    }, []);

    // direction: 'y' | 'x' | 'both'
    const startResize = (e, id, currentHeight, currentWidth, direction = 'y') => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        const startY = e.clientY;
        const startX = e.clientX;
        const startH = currentHeight;
        const startW = currentWidth;
        const onMove = (mv) => {
            if (direction === 'y' || direction === 'both') {
                const newH = Math.max(120, Math.min(1200, startH + (mv.clientY - startY)));
                setDragHeights(prev => ({ ...prev, [id]: newH }));
            }
            if (direction === 'x' || direction === 'both') {
                const newW = Math.max(200, Math.min(2400, startW + (mv.clientX - startX)));
                setDragWidths(prev => ({ ...prev, [id]: newW }));
            }
        };
        const onUp = (up) => {
            isResizingRef.current = false;
            if (direction === 'y' || direction === 'both') {
                const finalH = Math.max(120, Math.min(1200, startH + (up.clientY - startY)));
                updateChartConfig(id, 'chartHeight', finalH);
                setDragHeights(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
            if (direction === 'x' || direction === 'both') {
                const finalW = Math.max(200, Math.min(2400, startW + (up.clientX - startX)));
                updateChartConfig(id, 'chartWidthPx', finalW);
                setDragWidths(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const stopAutoScroll = () => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const handleDragOverScroll = (clientY) => {
        stopAutoScroll();
        const zone = 80;
        const speed = 12;
        if (clientY < zone) {
            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, -speed), 16);
        } else if (clientY > window.innerHeight - zone) {
            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, speed), 16);
        }
    };

    // Refs to coordinate per-account save without spurious writes on load
    const skipSaveRef = React.useRef(false);
    // chartsRef lets fetchFieldsData always see the latest charts without being a dep
    const chartsRef = React.useRef(charts);
    // fieldsFetchIdRef cancels stale fetchFieldsData completions
    const fieldsFetchIdRef = React.useRef(0);

    // Reset all data-related fields when category changes
    const resetChartDataFields = (chartId) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                return {
                    ...chart,
                    chartType: null,
                    xAxis: null,
                    yAxis: null,
                    zAxis: null,
                    aggregation: null,
                    chartMode: null,
                    dateFilterFrom: '',
                    dateFilterTo: '',
                    _showCustom: false,
                    _showLastN: false,
                    _lastNDays: 2,
                    chartColor: null,
                    autoRefreshMins: null,
                    barOrientation: 'vertical',
                };
            }
            return chart;
        }));
    };

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                let updatedChart = { ...chart, [field]: value };
                // When category changes: reset axis/aggregation fields and fetch new category fields
                if (field === 'chartCategory') {
                    const catId = value?._id || value;
                    if (catId) fetchFieldsForCategory(catId);
                    // Reset dependent fields so X/Y axis options reflect the new category
                    updatedChart = {
                        ...updatedChart,
                        chartType: null,
                        xAxis: null,
                        yAxis: null,
                        zAxis: null,
                        aggregation: null,
                        chartMode: null,
                        dateFilterFrom: '',
                        dateFilterTo: '',
                        _showCustom: false,
                        _showLastN: false,
                        _lastNDays: 2,
                        chartColor: null,
                        autoRefreshMins: null,
                        barOrientation: 'vertical',
                    };
                }
                // Fetch data when X, Y, Z, mode, aggregation, or date filters change
                if (['xAxis', 'yAxis', 'zAxis', 'aggregation', 'chartMode', 'dateFilterFrom', 'dateFilterTo'].includes(field)) {
                    fetchChartDataFromBackend(chartId, updatedChart);
                }
                return updatedChart;
            }
            return chart;
        }));
    };

    // Update multiple fields at once — triggers at most one API call
    const updateChartConfigBatch = (chartId, updates) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                const updatedChart = { ...chart, ...updates };
                const hasDataTrigger = Object.keys(updates).some(f =>
                    ['xAxis', 'yAxis', 'zAxis', 'aggregation', 'chartMode', 'dateFilterFrom', 'dateFilterTo'].includes(f)
                );
                if (hasDataTrigger) {
                    fetchChartDataFromBackend(chartId, updatedChart);
                }
                return updatedChart;
            }
            return chart;
        }));
    };

    // Fetch chart data from backend API
    // silent=true skips the per-chart loading mask (used by auto-refresh)
    const fetchChartDataFromBackend = async (chartId, chartConfig, silent = false) => {
        const isNumber = chartConfig.chartType?.value === 'number';
        if (isNumber ? (!chartConfig.yAxis || !chartConfig.aggregation) : (!chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation)) {
            return;
        }

        if (!silent) setChartLoadingState(prev => ({ ...prev, [chartId]: true }));
        try {
            const xAxisValue = isNumber ? chartConfig.yAxis.value : chartConfig.xAxis.value;
            // Use the chart's own category if set
            const effectiveCategoryId = chartConfig.chartCategory?._id || chartConfig.chartCategory || null;
            const params = {
                xAxis: xAxisValue,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value === 'average' ? 'avg' : chartConfig.aggregation.value,
                ...(acctId && { acctId }),
                ...(effectiveCategoryId && { categoryId: effectiveCategoryId }),
                ...((chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && chartConfig.zAxis ? { zAxis: chartConfig.zAxis.value } : {}),
                ...(chartConfig.dateFilterFrom && { dateFrom: chartConfig.dateFilterFrom }),
                ...(chartConfig.dateFilterTo && { dateTo: chartConfig.dateFilterTo })
            };

            const response = await api.post('/api/ui/analytics/chart-data', params);
            const data = response.data.data || [];
            // Sort descending by value
            data.sort((a, b) => b.value - a.value);

            setChartDataCache(prev => ({
                ...prev,
                [chartId]: data
            }));
        } catch (err) {
            console.error('Error fetching chart data:', err);
            setChartDataCache(prev => ({
                ...prev,
                [chartId]: []
            }));
        } finally {
            if (!silent) setChartLoadingState(prev => ({ ...prev, [chartId]: false }));
        }
    };

    // Add new chart
    const addChart = () => {
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const y = todayDate.getFullYear();
        const m = String(todayDate.getMonth() + 1).padStart(2, '0');
        const d = String(todayDate.getDate()).padStart(2, '0');
        const todayISO = `${y}-${m}-${d}`;
        const newChart = {
            ...defaultChartConfig,
            id: nextChartId,
            dateFilterFrom: todayISO,
            dateFilterTo: todayISO
        };
        setCharts(prev => [...prev, newChart]);
        setNextChartId(prev => prev + 1);
    };

    // Remove chart
    const removeChart = (chartId) => {
        setCharts(prev => prev.filter(chart => chart.id !== chartId));
    };

    // Refresh all charts — re-fetches live data for every configured chart
    const [globalRefreshing, setGlobalRefreshing] = useState(false);
    const refreshAllCharts = async () => {
        const configured = charts.filter(c => c.chartType?.value === 'number' ? (c.yAxis && c.aggregation) : (c.xAxis && c.yAxis && c.aggregation));
        if (!configured.length) return;
        setGlobalRefreshing(true);
        await Promise.all(configured.map(c => fetchChartDataFromBackend(c.id, c)));
        setGlobalRefreshing(false);
    };


    // Keep chartsForTimerRef current so the interval callbacks always use latest chart state
    useEffect(() => {
        chartsForTimerRef.current = charts;
    }, [charts]);

    // Auto-refresh timer manager — starts/restarts a countdown for each chart
    // No cleanup on dep change: each chart's timer is managed individually inside the body.
    useEffect(() => {
        const activeIds = new Set(charts.map(c => c.id));

        // Clear intervals for removed charts (skip _total keys)
        Object.keys(autoRefreshIntervalsRef.current)
            .filter(k => !k.includes('_total'))
            .forEach(idStr => {
                const id = Number(idStr);
                if (!activeIds.has(id)) {
                    clearInterval(autoRefreshIntervalsRef.current[idStr]);
                    delete autoRefreshIntervalsRef.current[idStr];
                    delete autoRefreshIntervalsRef.current[`${idStr}_total`];
                    setAutoRefreshCountdown(prev => { const n = { ...prev }; delete n[id]; return n; });
                }
            });

        charts.forEach(chart => {
            // Auto-refresh disabled for this chart — clear any running timer
            if (!chart.autoRefreshMins) {
                if (autoRefreshIntervalsRef.current[chart.id]) {
                    clearInterval(autoRefreshIntervalsRef.current[chart.id]);
                    delete autoRefreshIntervalsRef.current[chart.id];
                    delete autoRefreshIntervalsRef.current[`${chart.id}_total`];
                    setAutoRefreshCountdown(prev => { const n = { ...prev }; delete n[chart.id]; return n; });
                }
                return;
            }

            const mins = chart.autoRefreshMins;
            const totalSecs = mins * 60;
            const existingInterval = autoRefreshIntervalsRef.current[chart.id];

            // Skip if this chart's interval is already running with the same timing
            const currentCountdown = autoRefreshIntervalsRef.current[`${chart.id}_total`];
            if (existingInterval && currentCountdown === totalSecs) return;

            // Timing changed — clear only this chart's old interval
            if (existingInterval) clearInterval(existingInterval);

            autoRefreshIntervalsRef.current[`${chart.id}_total`] = totalSecs;
            setAutoRefreshCountdown(prev => ({ ...prev, [chart.id]: totalSecs }));

            autoRefreshIntervalsRef.current[chart.id] = setInterval(() => {
                setAutoRefreshCountdown(prev => {
                    const remaining = (prev[chart.id] ?? totalSecs) - 1;
                    if (remaining <= 0) {
                        // Trigger refresh using latest chart state from ref
                        const latestChart = chartsForTimerRef.current.find(c => c.id === chart.id);
                        const isNumberChart = latestChart?.chartType?.value === 'number';
                        if (latestChart && (isNumberChart ? (latestChart.yAxis && latestChart.aggregation) : (latestChart.xAxis && latestChart.yAxis && latestChart.aggregation))) {
                            fetchChartDataFromBackend(latestChart.id, latestChart, true);
                        }
                        autoRefreshIntervalsRef.current[`${chart.id}_total`] = totalSecs;
                        return { ...prev, [chart.id]: totalSecs };
                    }
                    return { ...prev, [chart.id]: remaining };
                });
            }, 1000);
        });
        // No return/cleanup here — we handle per-chart cleanup above
        // Global cleanup on unmount is handled by the effect below
    }, [charts.map(c => `${c.id}:${c.autoRefreshMins ?? 'off'}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear all auto-refresh intervals on component unmount only
    useEffect(() => {
        return () => {
            Object.keys(autoRefreshIntervalsRef.current)
                .filter(k => !k.includes('_total'))
                .forEach(k => clearInterval(autoRefreshIntervalsRef.current[k]));
        };
    }, []);

    // Load charts whenever account changes
    useEffect(() => {
        if (!acctId) return;
        skipSaveRef.current = true;
        const saved = loadCharts(acctId);
        const restored = saved.map(entry => normalizeChart(entry));
        chartsRef.current = restored;
        setCharts(restored);
        setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
        setChartDataCache({});
        setCategoryFieldsCache({});
        fieldsFetchPromisesRef.current = {};

        // Fetch field schemas for used categories
        const usedCategories = [...new Set(restored.map(c => c.chartCategory?._id || c.chartCategory).filter(Boolean))];
        usedCategories.forEach(catId => fetchFieldsForCategory(catId));

        // Fetch initial data
        restored.forEach(chart => {
            const isNum = chart.chartType?.value === 'number';
            if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                fetchChartDataFromBackend(chart.id, chart, true);
            }
        });
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist charts whenever they change (skip on load)
    useEffect(() => {
        chartsRef.current = charts; // always keep ref current
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (!acctId) return;
        saveCharts(acctId, charts);
    }, [charts, acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch categories
    const fetchCategories = async () => {
        if (!acctId) return;
        setCategoryLoading(true);
        try {
            const response = await api.get('/api/ui/leads/categories', { params: { acctId } });
            const d = response.data;
            const raw = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.categories) ? d.categories : [];
            const filtered = raw.filter(item => item?._id && item?.categoryName);
            setCategories(filtered);
        } catch (err) {
            console.error('Error fetching categories:', err);
        } finally {
            setCategoryLoading(false);
        }
    };

    // Fetch categories when acctId changes
    useEffect(() => {
        fetchCategories();
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchFieldsForCategory = async (catId) => {
        if (!catId || !acctId) return [];
        if (categoryFieldsCache[catId]?.length > 0) return categoryFieldsCache[catId];
        // Use a single shared promise key per acctId so concurrent calls share one request
        const promiseKey = `__all__${acctId}`;
        if (fieldsFetchPromisesRef.current[promiseKey]) {
            const allResults = await fieldsFetchPromisesRef.current[promiseKey];
            return allResults[catId] || [];
        }

        const promise = (async () => {
            try {
                const response = await api.get('/api/ui/leads/fields', { params: { acctId } });
                const raw = response.data;

                // Cache ALL categories' raw fields (no filtering here — filter at read time)
                const allResults = {};
                if (Array.isArray(raw?.categories)) {
                    raw.categories.forEach(cat => {
                        if (cat.categoryId && Array.isArray(cat.fields)) {
                            allResults[cat.categoryId] = cat.fields.filter(f => typeof f === 'string');
                        }
                    });
                }

                setCategoryFieldsCache(prev => ({ ...prev, ...allResults }));
                return allResults;
            } catch (err) {
                console.error('Error fetching fields:', err);
                return {};
            } finally {
                delete fieldsFetchPromisesRef.current[promiseKey];
            }
        })();

        fieldsFetchPromisesRef.current[promiseKey] = promise;
        const allResults = await promise;
        return allResults[catId] || [];
    };

    // Get chart data from cache
    const getChartData = (chartConfig, chartId) => {
        return chartDataCache[chartId] || [];
    };

    // Colors for charts - Vibrant palette
    const COLORS = [
        '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
        '#84cc16', '#a855f7', '#22c55e', '#eab308', '#ef4444'
    ];
    const DEFAULT_CHART_COLOR = '#6366f1';
    const COLOR_OPTIONS = [
        '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6',
        '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#22c55e', '#1a1a1a'
    ];

    // Shared attractive tooltip style
    const tooltipStyle = {
        contentStyle: {
            backgroundColor: 'rgba(255,255,255,0.98)',
            border: 'none',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            padding: '12px 16px',
            fontSize: '13px'
        },
        labelStyle: { color: '#1e293b', fontWeight: 700, marginBottom: 4 },
        itemStyle: { color: '#64748b' },
        cursor: { fill: 'rgba(99,102,241,0.06)' }
    };

    // Render Pie Chart — modern donut with radial gradients
    const renderPieChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <defs>
                    {COLORS.map((color, i) => (
                        <radialGradient key={i} id={`pieGrad-${i}`} cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor={color} stopOpacity={1} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.75} />
                        </radialGradient>
                    ))}
                </defs>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={115}
                    paddingAngle={3}
                    labelLine={false}
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                    dataKey="value"
                >
                    {chartData.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={`url(#pieGrad-${index % COLORS.length})`}
                            stroke="white"
                            strokeWidth={2}
                        />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={tooltipStyle.contentStyle}
                    labelStyle={tooltipStyle.labelStyle}
                    itemStyle={tooltipStyle.itemStyle}
                    formatter={(value, name) => [value, yAxisLabel]}
                />
                <Legend iconType="circle" iconSize={10} />
            </PieChart>
        </ResponsiveContainer>
    );

    // Render Bar Chart — gradient bars, clean grid
    const renderBarChart = (chartData, yAxisLabel, orientation = 'vertical') => {
        const isHorizontal = orientation === 'horizontal';
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    layout={isHorizontal ? 'vertical' : 'horizontal'}
                    margin={isHorizontal
                        ? { top: 10, right: 30, left: 80, bottom: 10 }
                        : { top: 10, right: 20, left: 10, bottom: 40 }
                    }
                >
                    <defs>
                        {COLORS.map((color, i) => (
                            <linearGradient key={i} id={`barGrad-${i}`} x1="0" y1="0" x2={isHorizontal ? '1' : '0'} y2={isHorizontal ? '0' : '1'}>
                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.45} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={!isHorizontal} vertical={isHorizontal} />
                    {isHorizontal ? (
                        <>
                            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} width={75} />
                        </>
                    ) : (
                        <>
                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-45} textAnchor="end" height={60} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        </>
                    )}
                    <Tooltip
                        contentStyle={tooltipStyle.contentStyle}
                        labelStyle={tooltipStyle.labelStyle}
                        itemStyle={tooltipStyle.itemStyle}
                        cursor={tooltipStyle.cursor}
                        formatter={(value) => [value, yAxisLabel]}
                    />
                    <Legend iconType="circle" iconSize={10} />
                    <Bar
                        dataKey="value"
                        name={yAxisLabel}
                        radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
                        maxBarSize={60}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#barGrad-${index % COLORS.length})`} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    // Render Line Chart — area chart with gradient fill
    const renderLineChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR) => (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    contentStyle={tooltipStyle.contentStyle}
                    labelStyle={tooltipStyle.labelStyle}
                    itemStyle={tooltipStyle.itemStyle}
                    cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
                    formatter={(value) => [value, yAxisLabel]}
                />
                <Legend iconType="circle" iconSize={10} />
                <Area
                    type="monotone"
                    dataKey="value"
                    name={yAxisLabel}
                    stroke={color}
                    strokeWidth={3}
                    fill="url(#areaGrad)"
                    dot={{ fill: color, stroke: 'white', strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 7, fill: color, stroke: 'white', strokeWidth: 2 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );

    // Render Heat Map — colored tile grid, intensity proportional to value
    const renderHeatmapChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR) => {
        const max = Math.max(...chartData.map(d => d.value));
        const min = Math.min(...chartData.map(d => d.value));
        const range = max - min || 1;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return (
            <div className="w-full h-full overflow-auto p-4">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium">Scale:</span>
                    {[0, 0.25, 0.5, 0.75, 1].map(i => (
                        <div key={i} className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: `rgba(${r},${g},${b},${0.1 + i * 0.9})` }} />
                            <span className="text-[10px] text-gray-500">{Math.round(min + i * range).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    {chartData.map((entry, index) => {
                        const intensity = (entry.value - min) / range;
                        return (
                            <div
                                key={index}
                                title={`${entry.name}: ${entry.value.toLocaleString()} ${yAxisLabel}`}
                                style={{ backgroundColor: `rgba(${r},${g},${b},${0.1 + intensity * 0.9})` }}
                                className="flex flex-col items-center justify-center rounded-xl p-3 min-w-[72px] cursor-default transition-transform duration-150 hover:scale-110 hover:shadow-md"
                            >
                                <span className="text-sm font-black leading-none" style={{ color: intensity > 0.55 ? 'white' : '#1e293b' }}>
                                    {entry.value.toLocaleString()}
                                </span>
                                <span className="text-[10px] mt-1 max-w-[80px] text-center leading-tight overflow-hidden" style={{ color: intensity > 0.55 ? 'rgba(255,255,255,0.8)' : '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {entry.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render Number Chart — large KPI total with top-N breakdown
    const renderNumberChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR) => {
        const total = chartData.reduce((sum, d) => sum + (d.value || 0), 0);
        const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();
        const topItems = [...chartData].sort((a, b) => b.value - a.value).slice(0, 4);
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                <div className="text-center">
                    <div className="text-7xl font-black tracking-tighter leading-none" style={{ color }}>
                        {fmt(total)}
                    </div>
                    <div className="text-sm text-gray-500 mt-3 font-medium uppercase tracking-widest">{yAxisLabel}</div>
                </div>
                {topItems.length > 1 && (
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                        {topItems.map((item, i) => (
                            <div key={i} className="text-center rounded-xl px-4 py-2 border min-w-[80px]" style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}>
                                <div className="text-lg font-bold" style={{ color }}>{item.value.toLocaleString()}</div>
                                <div className="text-[11px] text-gray-500 truncate max-w-[100px]">{item.name}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ── Grouped / Stacked Bar ─────────────────────────────────────────────
    const renderMultiSeriesBarChart = (chartData, yAxisLabel, orientation = 'vertical', stacked = false) => {
        const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
        if (!hasZKey) return renderBarChart(chartData, yAxisLabel, orientation);
        const isHorizontal = orientation === 'horizontal';
        const names = [...new Set(chartData.map(d => d.name))];
        const zKeys = [...new Set(chartData.map(d => d.zKey))];
        const data = names.map(name => {
            const entry = { name };
            zKeys.forEach(zKey => {
                const found = chartData.find(d => d.name === name && d.zKey === zKey);
                entry[zKey] = found ? found.value : 0;
            });
            return entry;
        });
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout={isHorizontal ? 'vertical' : 'horizontal'}
                    margin={isHorizontal ? { top: 10, right: 30, left: 80, bottom: 10 } : { top: 10, right: 20, left: 10, bottom: 40 }}
                >
                    <defs>
                        {COLORS.map((color, i) => (
                            <linearGradient key={i} id={`msBarGrad-${i}`} x1="0" y1="0" x2={isHorizontal ? '1' : '0'} y2={isHorizontal ? '0' : '1'}>
                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={!isHorizontal} vertical={isHorizontal} />
                    {isHorizontal ? (
                        <>
                            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} width={75} />
                        </>
                    ) : (
                        <>
                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={55} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        </>
                    )}
                    <Tooltip
                        contentStyle={tooltipStyle.contentStyle}
                        labelStyle={tooltipStyle.labelStyle}
                        itemStyle={tooltipStyle.itemStyle}
                        cursor={tooltipStyle.cursor}
                    />
                    <Legend iconType="circle" iconSize={10} />
                    {zKeys.map((zKey, i) => (
                        <Bar
                            key={zKey}
                            dataKey={zKey}
                            name={zKey}
                            fill={`url(#msBarGrad-${i % COLORS.length})`}
                            stackId={stacked ? 'a' : undefined}
                            radius={stacked
                                ? (i === zKeys.length - 1 ? (isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]) : [0, 0, 0, 0])
                                : (isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0])
                            }
                            maxBarSize={stacked ? 80 : 50}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    // ── Nested Pie (Grouped — inner=X-axis, outer=Z-axis breakdown) ────────
    const renderNestedPieChart = (chartData, yAxisLabel) => {
        const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
        if (!hasZKey) return renderPieChart(chartData, yAxisLabel);
        const innerMap = {};
        chartData.forEach(d => { innerMap[d.name] = (innerMap[d.name] || 0) + d.value; });
        const innerData = Object.entries(innerMap).map(([name, value]) => ({ name, value }));
        const outerData = chartData.map(d => ({ name: `${d.name} › ${d.zKey}`, value: d.value }));
        return (
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <defs>
                        {COLORS.map((color, i) => (
                            <radialGradient key={i} id={`nPieIn-${i}`} cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.75} />
                            </radialGradient>
                        ))}
                        {COLORS.map((color, i) => (
                            <radialGradient key={`o${i}`} id={`nPieOut-${i}`} cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                            </radialGradient>
                        ))}
                    </defs>
                    <Pie data={innerData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={2} dataKey="value" labelLine={false} label={({ percent }) => percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ''}>
                        {innerData.map((_, i) => <Cell key={`in-${i}`} fill={`url(#nPieIn-${i % COLORS.length})`} stroke="white" strokeWidth={2} />)}
                    </Pie>
                    <Pie data={outerData} cx="50%" cy="50%" innerRadius={78} outerRadius={115} paddingAngle={1} dataKey="value">
                        {outerData.map((_, i) => <Cell key={`out-${i}`} fill={`url(#nPieOut-${i % COLORS.length})`} stroke="white" strokeWidth={1} />)}
                    </Pie>
                    <Tooltip
                        contentStyle={tooltipStyle.contentStyle}
                        labelStyle={tooltipStyle.labelStyle}
                        itemStyle={tooltipStyle.itemStyle}
                        formatter={(value, name) => [value, name]}
                    />
                    <Legend iconType="circle" iconSize={10} />
                </PieChart>
            </ResponsiveContainer>
        );
    };

    // ── placeholder so darkenHex reference doesn't break (unused) ──────────
    const darkenHex = (hex, f = 0.55) => {
        const n = parseInt((hex || '#6366f1').replace('#', ''), 16);
        const r = Math.round(((n >> 16) & 0xff) * f);
        const g = Math.round(((n >> 8) & 0xff) * f);
        const b = Math.round((n & 0xff) * f);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    const renderChart = (chartConfig) => {
        const isLoading = chartLoadingState[chartConfig.id];
        const chartData = getChartData(chartConfig, chartConfig.id);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';
        const height = chartConfig.chartHeight || 320;

        if (isLoading) return (
            <div className="flex flex-col items-center justify-center w-full h-full gap-2">
                <div className="relative">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200"></div>
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-800 border-t-transparent absolute top-0"></div>
                </div>
                <span className="text-[11px] text-gray-400 font-medium">Loading chart...</span>
            </div>
        );

        if (!chartConfig.chartType) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select chart type to begin</div>;
        if (chartConfig.chartType?.value !== 'number' && !chartConfig.xAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Group By' : 'Select X axis'}</div>;
        if (!chartConfig.yAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Value' : chartConfig.chartType?.value === 'number' ? 'Select Value' : 'Select Y axis'}</div>;
        if (!chartConfig.aggregation) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select aggregation type</div>;
        if (!chartData.length) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">No data available</div>;

        const chartColor = chartConfig.chartColor || DEFAULT_CHART_COLOR;
        const mode = chartConfig.chartMode;
        switch (chartConfig.chartType.value) {
            case 'pie':
                return (mode === 'grouped' || mode === 'stacked')
                    ? renderNestedPieChart(chartData, yAxisLabel)
                    : renderPieChart(chartData, yAxisLabel);
            case 'bar':
                return mode === 'grouped'
                    ? renderMultiSeriesBarChart(chartData, yAxisLabel, chartConfig.barOrientation || 'vertical', false)
                    : mode === 'stacked'
                        ? renderMultiSeriesBarChart(chartData, yAxisLabel, chartConfig.barOrientation || 'vertical', true)
                        : renderBarChart(chartData, yAxisLabel, chartConfig.barOrientation || 'vertical');
            case 'line':
                return renderLineChart(chartData, yAxisLabel, chartColor);
            case 'heatmap':
                return renderHeatmapChart(chartData, yAxisLabel, chartColor);
            case 'number':
                return renderNumberChart(chartData, yAxisLabel, chartColor);
            default:
                return null;
        }
    };

    // Render single chart card
    const renderChartCard = (chartConfig) => {
        const catIdForFields = chartConfig.chartCategory?._id || chartConfig.chartCategory;
        const excludeAxisFields = ['__v', '_id'];
        const chartFields = catIdForFields
            ? (categoryFieldsCache[catIdForFields] || []).filter(f => !excludeAxisFields.includes(f))
            : [];
        const columns = chartFields.map(field => ({
            value: field,
            label: formatFieldName(field)
        }));

        const toISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayStr = toISO(today);
        const yest = new Date(today); yest.setDate(yest.getDate() - 1);
        const yesterdayStr = toISO(yest);

        // Determine active preset
        const isToday = chartConfig.dateFilterFrom === todayStr && chartConfig.dateFilterTo === todayStr && todayStr !== '';
        const isYesterday = chartConfig.dateFilterFrom === yesterdayStr && chartConfig.dateFilterTo === yesterdayStr && yesterdayStr !== '';
        // "Last N Days" is active when To=today and From = today minus N days (N >= 1, not yesterday-only)
        const lastNDays = chartConfig._lastNDays || 2;
        const lastNFrom = (() => { const d = new Date(today); d.setDate(d.getDate() - lastNDays); return toISO(d); })();
        const isLastN = chartConfig._showLastN && chartConfig.dateFilterFrom === lastNFrom && chartConfig.dateFilterTo === todayStr;

        const hasCustomDate = !isToday && !isYesterday && !isLastN && (chartConfig.dateFilterFrom || chartConfig.dateFilterTo);
        const showCustomInputs = hasCustomDate || chartConfig._showCustom;
        const filterIsVisible = !!filterVisible[chartConfig.id];

        const applyLastN = (n) => {
            const d = new Date(today); d.setDate(d.getDate() - n);
            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: toISO(d), dateFilterTo: todayStr });
        };

        return (
            <div
                key={chartConfig.id}
                draggable
                onDragStart={(e) => {
                    if (isResizingRef.current) { e.preventDefault(); return; }
                    draggedIdRef.current = chartConfig.id;
                    e.dataTransfer.effectAllowed = 'move';
                    setIsDraggingAny(true);
                }}
                onDragOver={(e) => { e.preventDefault(); handleDragOverScroll(e.clientY); if (chartConfig.id !== draggedIdRef.current) setDragOverId(chartConfig.id); }}
                onDrop={(e) => {
                    e.preventDefault();
                    const fromId = draggedIdRef.current;
                    if (!fromId || fromId === chartConfig.id) { setDragOverId(null); return; }
                    setCharts(prev => {
                        const fromIdx = prev.findIndex(c => c.id === fromId);
                        const toIdx = prev.findIndex(c => c.id === chartConfig.id);
                        const next = [...prev];
                        const [moved] = next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, moved);
                        return next;
                    });
                    setDragOverId(null);
                    draggedIdRef.current = null;
                    stopAutoScroll();
                    setIsDraggingAny(false);
                }}
                onDragEnd={() => { setDragOverId(null); draggedIdRef.current = null; stopAutoScroll(); setIsDraggingAny(false); }}
                ref={(el) => { cardRefs.current[chartConfig.id] = el; }}
                onMouseMove={(e) => {
                    if (isResizingRef.current || isDraggingAny) return;
                    const card = cardRefs.current[chartConfig.id];
                    if (!card) return;
                    const rect = card.getBoundingClientRect();
                    // Only trigger inside the chart body (below the 36px header), near the top
                    const relY = e.clientY - rect.top;
                    if (relY > 36 && relY < 96) {
                        setFilterVisible(prev => ({ ...prev, [chartConfig.id]: true }));
                    }
                }}
                onMouseLeave={() => hideFilter(chartConfig.id)}
                className={`bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 animate-scale-in flex flex-col border-2 relative ${dragOverId === chartConfig.id ? 'border-gray-700 shadow-gray-200' : 'border-gray-200'
                    }`}
                style={{
                    height: dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400,
                    width: (() => {
                        const pw = dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx;
                        if (pw) return pw;
                        return chartConfig.chartWidth === 'full' ? '100%' : 'calc(50% - 12px)';
                    })(),
                    flexShrink: 0,
                    minWidth: 200,
                }}
            >
                {/* ── Always-visible name bar with drag handle ── */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 cursor-grab active:cursor-grabbing select-none">
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 16 16">
                        <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
                        <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
                        <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
                    </svg>
                    <input
                        type="text"
                        value={chartConfig.chartName || ''}
                        placeholder={`Chart ${chartConfig.id}`}
                        onChange={(e) => updateChartConfig(chartConfig.id, 'chartName', e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 text-sm font-semibold text-white bg-transparent outline-none border-none cursor-text placeholder:text-gray-500 min-w-0"
                    />
                    {/* Manual refresh button */}
                    <button
                        title="Refresh chart"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); fetchChartDataFromBackend(chartConfig.id, chartConfig); }}
                        className="p-1 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>

                    {/* Delete button */}
                    <button
                        title="Delete chart"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPendingDeleteId(chartConfig.id); }}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>

                    {/* Auto-refresh countdown arc — only shown when auto-refresh is enabled */}
                    {chartConfig.autoRefreshMins && (() => {
                        const mins = chartConfig.autoRefreshMins;
                        const totalSecs = mins * 60;
                        const remaining = autoRefreshCountdown[chartConfig.id] ?? totalSecs;
                        const progress = remaining / totalSecs; // 1 = full, 0 = trigger
                        const r = 8;
                        const circ = 2 * Math.PI * r;
                        const dash = circ * progress;
                        const fmt = remaining >= 60
                            ? `${Math.floor(remaining / 60)}m${remaining % 60 > 0 ? String(remaining % 60).padStart(2, '0') + 's' : ''}`
                            : `${remaining}s`;
                        return (
                            <div
                                className="flex items-center gap-1 shrink-0 select-none"
                                title={`Auto-refresh in ${fmt} (every ${totalSecs < 60 ? `${totalSecs}s` : totalSecs < 3600 ? `${Math.round(totalSecs / 60)}m` : '1h'})`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); fetchChartDataFromBackend(chartConfig.id, chartConfig); }}
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" className="cursor-pointer">
                                    {/* Track */}
                                    <circle cx="10" cy="10" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                                    {/* Progress arc */}
                                    <circle
                                        cx="10" cy="10" r={r}
                                        fill="none"
                                        stroke={progress > 0.25 ? '#6ee7b7' : '#f87171'}
                                        strokeWidth="2"
                                        strokeDasharray={`${dash} ${circ}`}
                                        strokeLinecap="round"
                                        transform="rotate(-90 10 10)"
                                        style={{ transition: 'stroke-dasharray 0.9s linear' }}
                                    />
                                </svg>
                                <span className="text-[9px] font-mono text-gray-400 min-w-[22px]">{fmt}</span>
                            </div>
                        );
                    })()}
                </div>

                {/* ── All controls — slides in when near top ── */}
                <div
                    className={`absolute left-0 right-0 bg-white z-40 border-b border-gray-200 shadow-lg
                        transition-all duration-200 ease-out origin-top
                        ${filterIsVisible
                            ? 'opacity-100 translate-y-0 pointer-events-auto'
                            : 'opacity-0 -translate-y-3 pointer-events-none'
                        }`}
                    style={{ top: 36 }}
                    onMouseLeave={() => hideFilter(chartConfig.id)}
                    onMouseDown={() => { filterLockedRef.current[chartConfig.id] = true; }}
                    onMouseUp={() => { setTimeout(() => { delete filterLockedRef.current[chartConfig.id]; }, 200); }}
                >

                    {/* ── Account Category — always shown first ── */}
                    {categories.length > 0 && (
                        <div className="flex items-center gap-2 px-5 pt-3 pb-3 border-b border-gray-100">
                            <span className="text-xs font-semibold text-gray-700 shrink-0">Account Category:</span>
                            <div className="w-48">
                                <Combobox
                                    value={
                                        chartConfig.chartCategory
                                            ? (typeof chartConfig.chartCategory === 'object'
                                                ? chartConfig.chartCategory
                                                : categories.find(c => c._id === chartConfig.chartCategory) || null)
                                            : null
                                    }
                                    onChange={(val) => {
                                        // updateChartConfig handles reset + field fetch when chartCategory changes
                                        updateChartConfig(chartConfig.id, 'chartCategory', val || null);
                                    }}
                                    displayValue={(option) => option?.categoryName || ''}
                                    options={categories}
                                    placeholder="Select category..."
                                    dropdownClassName="z-50"
                                >
                                    {(option) => (
                                        <ComboboxOption key={`cat-${chartConfig.id}-${option._id}`} value={option}>
                                            <ComboboxLabel>{option.categoryName}</ComboboxLabel>
                                        </ComboboxOption>
                                    )}
                                </Combobox>
                            </div>
                            {chartConfig.chartCategory && (
                                <button
                                    onClick={() => updateChartConfig(chartConfig.id, 'chartCategory', null)}
                                    className="text-gray-400 hover:text-gray-700 transition-colors text-base leading-none px-1"
                                    title="Clear category filter"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Rest of controls — only shown when category is selected (or no categories exist) ── */}
                    {(categories.length === 0 || chartConfig.chartCategory) && (
                        <>
                            {/* ── Action buttons bar ── */}
                            <div className="flex items-center justify-end px-5 pt-3 pb-1 gap-1.5">

                                {/* Width toggle: Half / Full */}
                                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                    <button
                                        onClick={() => updateChartConfigBatch(chartConfig.id, { chartWidth: 'half', chartWidthPx: null })}
                                        title="Half width"
                                        className={`px-2 py-1 transition-all ${(chartConfig.chartWidth || 'half') === 'half' && !chartConfig.chartWidthPx
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-white text-gray-500 hover:bg-gray-100'
                                            }`}
                                    >
                                        ½
                                    </button>
                                    <button
                                        onClick={() => updateChartConfigBatch(chartConfig.id, { chartWidth: 'full', chartWidthPx: null })}
                                        title="Full width"
                                        className={`px-2 py-1 transition-all ${chartConfig.chartWidth === 'full' && !chartConfig.chartWidthPx
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-white text-gray-500 hover:bg-gray-100'
                                            }`}
                                    >
                                        ▬
                                    </button>
                                </div>

                                {/* Height stepper */}
                                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => updateChartConfig(chartConfig.id, 'chartHeight', Math.max(180, (chartConfig.chartHeight || 320) - 40))}
                                        title="Decrease height"
                                        className="px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 font-bold text-sm transition-all"
                                    >−</button>
                                    <span className="px-1.5 text-[10px] font-semibold text-gray-600 min-w-[44px] text-center border-x border-gray-200">
                                        {chartConfig.chartHeight || 320}px
                                    </span>
                                    <button
                                        onClick={() => updateChartConfig(chartConfig.id, 'chartHeight', Math.min(800, (chartConfig.chartHeight || 320) + 40))}
                                        title="Increase height"
                                        className="px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 font-bold text-sm transition-all"
                                    >+</button>
                                </div>
                            </div>

                            {/* ── Date filter row (can wrap freely) ── */}
                            <div className="flex items-center gap-2 mb-4 flex-wrap px-5">
                                <span className="text-xs font-semibold text-gray-700 shrink-0">Filter:</span>
                                {/* Today */}
                                <button
                                    onClick={() => {
                                        if (isToday) {
                                            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: '', dateFilterTo: '' });
                                        } else {
                                            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: todayStr, dateFilterTo: todayStr, _showCustom: false, _showLastN: false });
                                        }
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-all duration-150 ${isToday ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-700 hover:text-gray-900'}`}
                                >
                                    Today
                                </button>

                                {/* Yesterday */}
                                <button
                                    onClick={() => {
                                        if (isYesterday) {
                                            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: '', dateFilterTo: '' });
                                        } else {
                                            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: yesterdayStr, dateFilterTo: yesterdayStr, _showCustom: false, _showLastN: false });
                                        }
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-all duration-150 ${isYesterday ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-700 hover:text-gray-900'}`}
                                >
                                    Yesterday
                                </button>

                                {/* Last N Days button + inline number input */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            if (isLastN) {
                                                updateChartConfigBatch(chartConfig.id, { dateFilterFrom: '', dateFilterTo: '', _showLastN: false });
                                            } else {
                                                updateChartConfigBatch(chartConfig.id, { _showLastN: true, _showCustom: false });
                                                applyLastN(lastNDays);
                                            }
                                        }}
                                        className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-all duration-150 ${isLastN ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-700 hover:text-gray-900'}`}
                                    >
                                        Last
                                    </button>
                                    {chartConfig._showLastN && (
                                        <>
                                            <input
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={lastNDays}
                                                onChange={(e) => {
                                                    const n = Math.max(1, parseInt(e.target.value) || 1);
                                                    updateChartConfig(chartConfig.id, '_lastNDays', n);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') applyLastN(lastNDays);
                                                }}
                                                className="w-12 px-1.5 py-0.5 text-[11px] text-center border border-gray-300 rounded focus:outline-none focus:border-gray-700 transition-all"
                                            />
                                            <span className="text-[11px] text-gray-500">days</span>
                                            <button
                                                onClick={() => applyLastN(lastNDays)}
                                                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
                                            >
                                                Apply
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Custom date range button */}
                                <button
                                    onClick={() => {
                                        updateChartConfigBatch(chartConfig.id, { dateFilterFrom: '', dateFilterTo: '', _showLastN: false, _showCustom: !chartConfig._showCustom });
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-all duration-150 ${showCustomInputs ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-700 hover:text-gray-900'}`}
                                >
                                    Custom
                                </button>

                                {/* From/To inputs — only shown in custom mode */}
                                {showCustomInputs && (
                                    <>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[11px] text-gray-500">From:</span>
                                            <input
                                                type="date"
                                                value={chartConfig.dateFilterFrom}
                                                onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterFrom', e.target.value)}
                                                className="px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:border-gray-700 transition-all"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[11px] text-gray-500">To:</span>
                                            <input
                                                type="date"
                                                value={chartConfig.dateFilterTo}
                                                onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterTo', e.target.value)}
                                                className="px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:border-gray-700 transition-all"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Clear × — shown when any filter is active */}
                                {(isToday || isYesterday || isLastN || chartConfig.dateFilterFrom || chartConfig.dateFilterTo) && (
                                    <button
                                        onClick={() => {
                                            updateChartConfigBatch(chartConfig.id, { dateFilterFrom: '', dateFilterTo: '', _showCustom: false, _showLastN: false });
                                        }}
                                        className="text-gray-400 hover:text-gray-700 transition-colors text-base leading-none px-1"
                                        title="Clear date filters"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>

                            {/* Color picker — for line, heatmap, number charts */}
                            {['line', 'heatmap', 'number'].includes(chartConfig.chartType?.value) && (
                                <div className="flex items-center gap-2 mb-3 px-5">
                                    <span className="text-xs font-semibold text-gray-700 shrink-0">Color:</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {COLOR_OPTIONS.map(c => (
                                            <button
                                                key={c}
                                                title={c}
                                                onClick={() => updateChartConfig(chartConfig.id, 'chartColor', c)}
                                                className="w-5 h-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                                style={{
                                                    backgroundColor: c,
                                                    boxShadow: (chartConfig.chartColor || DEFAULT_CHART_COLOR) === c
                                                        ? `0 0 0 2px white, 0 0 0 4px ${c}`
                                                        : 'none'
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Auto-refresh interval control */}
                            <div className="flex items-center gap-2 mb-3 px-5">
                                <span className="text-xs font-semibold text-gray-700 shrink-0">Auto Refresh:</span>
                                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                    <button
                                        onClick={() => updateChartConfig(chartConfig.id, 'autoRefreshMins', null)}
                                        className={`px-2 py-1 transition-all ${!chartConfig.autoRefreshMins
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-white text-gray-500 hover:bg-gray-100'
                                            }`}
                                    >
                                        Off
                                    </button>
                                    {[
                                        { v: 10 / 60, label: '10s' },
                                        { v: 0.5, label: '30s' },
                                        { v: 1, label: '1m' },
                                        { v: 2, label: '2m' },
                                        { v: 3, label: '3m' },
                                        { v: 5, label: '5m' },
                                        { v: 10, label: '10m' },
                                        { v: 15, label: '15m' },
                                        { v: 30, label: '30m' },
                                        { v: 60, label: '1h' },
                                    ].map(({ v, label }) => (
                                        <button
                                            key={label}
                                            onClick={() => updateChartConfig(chartConfig.id, 'autoRefreshMins', v)}
                                            className={`px-2 py-1 transition-all ${chartConfig.autoRefreshMins === v
                                                ? 'bg-gray-900 text-white'
                                                : 'bg-white text-gray-500 hover:bg-gray-100'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Chart Mode toggle — Simple / Grouped / Stacked */}
                            {(chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') && (
                                <div className="flex items-center gap-2 mb-3 px-5">
                                    <span className="text-xs font-semibold text-gray-700 shrink-0">Mode:</span>
                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                        {[
                                            { v: null, label: 'Simple' },
                                            { v: 'grouped', label: 'Grouped' },
                                            { v: 'stacked', label: 'Stacked' }
                                        ].map(({ v, label }) => (
                                            <button
                                                key={label}
                                                onClick={() => updateChartConfig(chartConfig.id, 'chartMode', v)}
                                                className={`px-2.5 py-1 transition-all ${chartConfig.chartMode === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Bar orientation toggle — bar only */}
                            {chartConfig.chartType?.value === 'bar' && (
                                <div className="flex items-center gap-2 mb-3 px-5">
                                    <span className="text-xs font-semibold text-gray-700">Orientation:</span>
                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                        <button
                                            onClick={() => updateChartConfig(chartConfig.id, 'barOrientation', 'vertical')}
                                            title="Vertical bars"
                                            className={`flex items-center gap-1 px-2.5 py-1 transition-all ${(chartConfig.barOrientation || 'vertical') === 'vertical'
                                                ? 'bg-gray-900 text-white'
                                                : 'bg-white text-gray-500 hover:bg-gray-100'
                                                }`}
                                        >
                                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                                                <rect x="1" y="4" width="2.5" height="7" rx="0.5" />
                                                <rect x="4.75" y="2" width="2.5" height="9" rx="0.5" />
                                                <rect x="8.5" y="5.5" width="2.5" height="5.5" rx="0.5" />
                                            </svg>
                                            Vertical
                                        </button>
                                        <button
                                            onClick={() => updateChartConfig(chartConfig.id, 'barOrientation', 'horizontal')}
                                            title="Horizontal bars"
                                            className={`flex items-center gap-1 px-2.5 py-1 transition-all ${chartConfig.barOrientation === 'horizontal'
                                                ? 'bg-gray-900 text-white'
                                                : 'bg-white text-gray-500 hover:bg-gray-100'
                                                }`}
                                        >
                                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                                                <rect x="0" y="1" width="7" height="2.5" rx="0.5" />
                                                <rect x="0" y="4.75" width="9" height="2.5" rx="0.5" />
                                                <rect x="0" y="8.5" width="5.5" height="2.5" rx="0.5" />
                                            </svg>
                                            Horizontal
                                        </button>
                                    </div>
                                </div>
                            )}
                            {/* Chart Controls */}
                            <div className={`grid gap-3 mb-4 px-5 ${chartConfig.chartType?.value === 'number' ? 'grid-cols-3' :
                                ((chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') && (chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked')) ? 'grid-cols-5' :
                                    'grid-cols-4'
                                }`}>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Chart Type</label>
                                    <Combobox
                                        value={chartConfig.chartType}
                                        onChange={(val) => updateChartConfig(chartConfig.id, 'chartType', val)}
                                        displayValue={(option) => option?.label || 'Select...'}
                                        options={chartTypes}
                                        dropdownClassName="z-50"
                                    >
                                        {(option) => (
                                            <ComboboxOption key={`chart-type-${chartConfig.id}-${option.value}`} value={option}>
                                                <ComboboxLabel>{option.label}</ComboboxLabel>
                                            </ComboboxOption>
                                        )}
                                    </Combobox>
                                </div>
                                {chartConfig.chartType?.value !== 'number' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                            {chartConfig.chartType?.value === 'pie' ? 'Group By' : 'X Axis'}
                                        </label>
                                        <Combobox
                                            value={chartConfig.xAxis}
                                            onChange={(val) => updateChartConfig(chartConfig.id, 'xAxis', val)}
                                            displayValue={(option) => option?.label || 'Select...'}
                                            options={columns}
                                            dropdownClassName="z-50"
                                        >
                                            {(option) => (
                                                <ComboboxOption key={`x-axis-${chartConfig.id}-${option.value}`} value={option}>
                                                    <ComboboxLabel>{option.label}</ComboboxLabel>
                                                </ComboboxOption>
                                            )}
                                        </Combobox>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                        {chartConfig.chartType?.value === 'pie' ? 'Value' : chartConfig.chartType?.value === 'number' ? 'Value' : 'Y Axis'}
                                    </label>
                                    <Combobox
                                        value={chartConfig.yAxis}
                                        onChange={(val) => updateChartConfig(chartConfig.id, 'yAxis', val)}
                                        displayValue={(option) => option?.label || 'Select...'}
                                        options={columns}
                                        dropdownClassName="z-50"
                                    >
                                        {(option) => (
                                            <ComboboxOption key={`y-axis-${chartConfig.id}-${option.value}`} value={option}>
                                                <ComboboxLabel>{option.label}</ComboboxLabel>
                                            </ComboboxOption>
                                        )}
                                    </Combobox>
                                </div>
                                {/* Z Axis — for Grouped / Stacked modes */}
                                {(chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') && (chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                            Group By
                                        </label>
                                        <Combobox
                                            value={chartConfig.zAxis}
                                            onChange={(val) => updateChartConfig(chartConfig.id, 'zAxis', val)}
                                            displayValue={(option) => option?.label || 'None'}
                                            options={columns}
                                            dropdownClassName="z-50"
                                        >
                                            {(option) => (
                                                <ComboboxOption key={`z-axis-${chartConfig.id}-${option.value}`} value={option}>
                                                    <ComboboxLabel>{option.label}</ComboboxLabel>
                                                </ComboboxOption>
                                            )}
                                        </Combobox>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aggregation</label>
                                    <Combobox
                                        value={chartConfig.aggregation}
                                        onChange={(val) => updateChartConfig(chartConfig.id, 'aggregation', val)}
                                        displayValue={(option) => option?.label || 'Select...'}
                                        options={chartConfig.chartType?.value === 'number' ? aggregationTypesNumber : aggregationTypes}
                                        dropdownClassName="z-50"
                                    >
                                        {(option) => (
                                            <ComboboxOption key={`agg-${chartConfig.id}-${option.value}`} value={option}>
                                                <ComboboxLabel>{option.label}</ComboboxLabel>
                                            </ComboboxOption>
                                        )}
                                    </Combobox>
                                </div>
                            </div>
                            {/* end filter controls */}
                            <div className="pb-4"></div>
                        </>
                    )}

                    {/* ── Hint when category not yet selected ── */}
                    {categories.length > 0 && !chartConfig.chartCategory && (
                        <div className="px-5 pb-4 pt-1">
                            <p className="text-[11px] text-gray-400 italic">Select an account category above to configure this chart.</p>
                        </div>
                    )}
                </div>

                {/* Chart Display — fills remaining space */}
                <div
                    className="relative bg-gray-50 border-t-2 border-gray-100 flex-1 min-h-0 overflow-hidden"
                >
                    <div className="w-full h-full p-4">
                        {renderChart(chartConfig)}
                    </div>
                    {/* Drag capture overlay — sits above SVG so dragOver fires on the card */}
                    {isDraggingAny && draggedIdRef.current !== chartConfig.id && (
                        <div
                            className="absolute inset-0 z-20"
                            onDragOver={(e) => { e.preventDefault(); handleDragOverScroll(e.clientY); setDragOverId(chartConfig.id); }}
                        />
                    )}
                    {/* Right edge — horizontal resize */}
                    <div
                        className="absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-end pr-0.5 group/rh hover:bg-gray-100 transition-colors"
                        onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx ?? 500, 'x')}
                    >
                        <div className="h-10 w-1 rounded-full bg-gray-300 group-hover/rh:bg-gray-700 transition-colors" />
                    </div>
                    {/* Bottom-right corner — both directions */}
                    <div
                        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-30"
                        onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx ?? 500, 'both')}
                    >
                        <svg className="w-4 h-4 text-gray-400 hover:text-gray-700 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="5" cy="11" r="1.2" />
                            <circle cx="9" cy="11" r="1.2" />
                            <circle cx="13" cy="11" r="1.2" />
                            <circle cx="9" cy="7" r="1.2" />
                            <circle cx="13" cy="7" r="1.2" />
                            <circle cx="13" cy="3" r="1.2" />
                        </svg>
                    </div>
                </div>

                {/* Bottom edge — vertical resize */}
                <div
                    className="h-3 cursor-ns-resize flex items-center justify-center bg-white border-t border-gray-100 group/resize hover:bg-gray-100 transition-colors shrink-0 z-10"
                    onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, 0, 'y')}
                >
                    <div className="w-12 h-1 rounded-full bg-gray-300 group-hover/resize:bg-gray-700 transition-colors" />
                </div>
            </div>
        );
    };

    // Block the entire page until accounts are resolved
    if (!accountsLoaded) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4 p-8 bg-white rounded-2xl shadow-2xl border border-gray-200">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200"></div>
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent absolute top-0"></div>
                    </div>
                    <div className="text-center">
                        <span className="text-lg font-semibold text-gray-900">Loading Dashboard</span>
                        <p className="text-sm text-gray-500 mt-1">Fetching your categories and charts...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-gray-50 relative">
                <LoadingMask loading={loading} title="Loading..." message="Please wait while we fetch your data" />
                <div
                    className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30"
                    style={{
                        transform: headerVisible ? 'translateY(0)' : 'translateY(-110%)',
                        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <div className="container mx-auto px-4 py-2">
                        <div className="flex justify-between items-center">
                            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                Analytics Dashboard
                            </h1>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={refreshAllCharts}
                                    disabled={globalRefreshing}
                                    title="Refresh all charts"
                                    className="w-8 h-8 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all flex items-center justify-center disabled:opacity-50"
                                >
                                    <svg className={`w-4 h-4 ${globalRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="container mx-auto px-4 py-6">
                    {charts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                            <div className="w-12 h-12 mb-4 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">No Charts Yet</h3>
                            <p className="text-xs text-gray-400 mb-5">Add a chart to start visualizing your data</p>
                            <button
                                onClick={addChart}
                                className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Your First Chart
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-6 mb-6 items-start">
                                {charts.map(chart => renderChartCard(chart))}
                            </div>

                            {/* Floating Add Chart Button */}
                            <div className="flex justify-center mt-6">
                                <button
                                    onClick={addChart}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5 hover:scale-105"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Another Chart
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Delete confirmation dialog */}
            <DeleteConfirmation
                isOpen={pendingDeleteId !== null}
                onClose={() => setPendingDeleteId(null)}
                onConfirm={() => { removeChart(pendingDeleteId); setPendingDeleteId(null); }}
                title="Delete Chart"
                message="Are you sure you want to delete this chart? This action cannot be undone."
                confirmLabel="Delete"
            />
        </>
    );
};

export default AnalyticsDashboardPage;
