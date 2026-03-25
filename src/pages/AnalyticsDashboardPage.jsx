import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { resolveActiveAcctNo, getAcctIdFromLocalStorage } from '../utils/accountHelpers';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import LoadingMask from '../components/LoadingMask';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const { acctNo, acctId, accountsLoaded } = useAccount();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fields, setFields] = useState([]);

    // Category state
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [categoryLoading, setCategoryLoading] = useState(false);
    // True once fetchCategories has resolved for the current account
    const [categoriesChecked, setCategoriesChecked] = useState(false);

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

    // Generate columns from fields
    const columns = fields.map(field => ({
        value: field,
        label: formatFieldName(field)
    }));

    // Aggregation types
    const aggregationTypes = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' }
    ];

    // Default chart configuration
    const defaultChartConfig = {
        chartType: null,
        xAxis: null,
        yAxis: null,
        aggregation: null,
        dateFilterFrom: '',
        dateFilterTo: '',
        chartWidth: 'half',
        chartHeight: 320,
        chartWidthPx: null,
        chartName: '',
        barOrientation: 'vertical',
        chartColor: null,
        autoRefreshMins: 5
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

    const loadChartsForCategory = (acct, categoryId) => {
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
            const catKey = categoryId || '';
            return store[acctKey]?.[catKey]?.filters || [];
        } catch {
            return [];
        }
    };

    const saveChartsForCategory = (acct, categoryId, chartsData) => {
        try {
            const store = readStore();
            const acctKey = acct || 'default';
            const catKey = categoryId || '';
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
                autoRefreshMins: chart.autoRefreshMins ?? 5
            }));
            store[acctKey] = store[acctKey] || {};
            store[acctKey][catKey] = { filters: chartsToSave };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch {
            // ignore storage errors
        }
    };

    // State for charts — per-category, reloaded whenever category or account changes
    const [charts, setCharts] = useState(() => {
        const initAcctId = getAcctIdFromLocalStorage();
        const saved = loadChartsForCategory(initAcctId, '');
        return saved.map(entry => ({ ...defaultChartConfig, ...entry, id: entry.id }));
    });
    const [nextChartId, setNextChartId] = useState(() => {
        const initAcctId = getAcctIdFromLocalStorage();
        const saved = loadChartsForCategory(initAcctId, '');
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

    // Refs to coordinate per-category save without spurious writes on load
    const skipSaveRef = React.useRef(false);
    const selectedCategoryRef = React.useRef('');
    // chartsRef lets fetchFieldsData always see the latest charts without being a dep
    const chartsRef = React.useRef(charts);
    // fieldsFetchIdRef cancels stale fetchFieldsData completions
    const fieldsFetchIdRef = React.useRef(0);

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                const updatedChart = { ...chart, [field]: value };
                // Fetch data when X, Y, aggregation, or date filters change
                if (['xAxis', 'yAxis', 'aggregation', 'dateFilterFrom', 'dateFilterTo'].includes(field)) {
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
                    ['xAxis', 'yAxis', 'aggregation', 'dateFilterFrom', 'dateFilterTo'].includes(f)
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
            const params = {
                xAxis: xAxisValue,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value,
                ...(acctId && { acctId }),
                ...(selectedCategory && { categoryId: selectedCategory }),
                ...(chartConfig.dateFilterFrom && { dateFrom: chartConfig.dateFilterFrom }),
                ...(chartConfig.dateFilterTo && { dateTo: chartConfig.dateFilterTo })
            };

            const response = await api.post('/api/ui/analytics/chart-data', params);
            setChartDataCache(prev => ({
                ...prev,
                [chartId]: response.data.data || []
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
        const newChart = {
            ...defaultChartConfig,
            id: nextChartId
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

    // Keep selectedCategoryRef in sync so the save effect always writes to the right bucket
    useEffect(() => {
        selectedCategoryRef.current = selectedCategory;
    }, [selectedCategory]);

    // Keep chartsForTimerRef current so the interval callbacks always use latest chart state
    useEffect(() => {
        chartsForTimerRef.current = charts;
    }, [charts]);

    // Auto-refresh timer manager — starts/restarts a countdown for each chart
    useEffect(() => {
        const activeIds = new Set(charts.map(c => c.id));

        // Clear intervals for removed charts
        Object.keys(autoRefreshIntervalsRef.current).forEach(id => {
            if (!activeIds.has(Number(id))) {
                clearInterval(autoRefreshIntervalsRef.current[id]);
                delete autoRefreshIntervalsRef.current[id];
                setAutoRefreshCountdown(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
        });

        charts.forEach(chart => {
            const mins = chart.autoRefreshMins ?? 5;
            const totalSecs = mins * 60;
            const existingInterval = autoRefreshIntervalsRef.current[chart.id];

            // Reset timer if interval changed or not yet started
            const currentCountdown = autoRefreshIntervalsRef.current[`${chart.id}_total`];
            if (existingInterval && currentCountdown === totalSecs) return;

            // Clear old interval
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

        return () => {
            Object.values(autoRefreshIntervalsRef.current).forEach(v => {
                if (typeof v === 'number') clearInterval(v);
            });
        };
    }, [charts.map(c => `${c.id}:${c.autoRefreshMins}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load charts for the active category whenever account or category changes
    useEffect(() => {
        if (!acctId) return;
        skipSaveRef.current = true;
        const saved = loadChartsForCategory(acctId, selectedCategory);
        const restored = saved.map(entry => ({ ...defaultChartConfig, ...entry, id: entry.id }));
        chartsRef.current = restored; // update ref immediately so fetchFieldsData sees correct charts
        setCharts(restored);
        setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
        setChartDataCache({});
    }, [acctId, selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist charts for the active category whenever they change (skip on load)
    useEffect(() => {
        chartsRef.current = charts; // always keep ref current
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (!acctId) return;
        saveChartsForCategory(acctId, selectedCategoryRef.current, charts);
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
            const stored = localStorage.getItem(`selectedCategory_${acctId}`);
            const storedCat = stored && filtered.find(c => c._id === stored);
            const activeCat = storedCat || filtered.find(c => c.default === true);
            if (activeCat) setSelectedCategory(activeCat._id);
        } catch (err) {
            console.error('Error fetching categories:', err);
        } finally {
            setCategoryLoading(false);
            setCategoriesChecked(true); // unblock fetchFieldsData now that category is known
        }
    };

    const handleCategoryChange = (value) => {
        setSelectedCategory(value);
        if (value) localStorage.setItem(`selectedCategory_${acctId}`, value);
        else localStorage.removeItem(`selectedCategory_${acctId}`);
    };

    // Fetch categories when acctId changes — also resets the gate for the new account
    useEffect(() => {
        setCategoriesChecked(false);
        fetchCategories();
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch fields only after categories are resolved, then re-run if category changes
    useEffect(() => {
        if (!acctNo || !categoriesChecked) return;
        fetchFieldsData();
    }, [acctNo, selectedCategory, categoriesChecked]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchFieldsData = async () => {
        fieldsFetchIdRef.current += 1;
        const myId = fieldsFetchIdRef.current;
        setLoading(true);
        try {
            const params = { ...(acctId && { acctId }), ...(selectedCategory && { categoryId: selectedCategory }) };
            const response = await api.get('/api/ui/leads', { params });

            // A newer call started — discard this result to avoid double chart fetch
            if (myId !== fieldsFetchIdRef.current) return;

            const excludeFields = ['__v', 'updatedAt', '_id'];
            let displayFields = [];
            if (response.data.fields && response.data.fields.length > 0) {
                displayFields = response.data.fields.filter(field => !excludeFields.includes(field));
            } else if ((response.data.data || []).length > 0) {
                const firstLead = response.data.data[0];
                displayFields = Object.keys(firstLead).filter(field => !excludeFields.includes(field));
            }
            setFields(displayFields);

            // Fetch chart data once — use chartsRef so we always get the correct category's charts
            if (displayFields.length > 0) {
                chartsRef.current.forEach(chart => {
                    const isNum = chart.chartType?.value === 'number';
                    if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                        fetchChartDataFromBackend(chart.id, chart);
                    }
                });
            }
        } catch (err) {
            console.error('Error fetching fields:', err);
        } finally {
            if (myId === fieldsFetchIdRef.current) setLoading(false);
        }
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
        if (chartConfig.chartType?.value !== 'number' && !chartConfig.xAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Category' : 'Select X axis'}</div>;
        if (!chartConfig.yAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Value' : chartConfig.chartType?.value === 'number' ? 'Select Value' : 'Select Y axis'}</div>;
        if (!chartConfig.aggregation) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select aggregation type</div>;
        if (!chartData.length) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">No data available</div>;

        const chartColor = chartConfig.chartColor || DEFAULT_CHART_COLOR;
        switch (chartConfig.chartType.value) {
            case 'pie':
                return renderPieChart(chartData, yAxisLabel);
            case 'bar':
                return renderBarChart(chartData, yAxisLabel, chartConfig.barOrientation || 'vertical');
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
                    if (e.clientY - rect.top < 80) {
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
                    {/* Auto-refresh countdown arc */}
                    {(() => {
                        const mins = chartConfig.autoRefreshMins ?? 5;
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
                                title={`Auto-refresh in ${fmt} (every ${mins} min${mins !== 1 ? 's' : ''})`}
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

                        {/* Delete */}
                        <button
                            onClick={() => removeChart(chartConfig.id)}
                            title="Delete chart"
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* ── Date filter row (can wrap freely) ── */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap px-5">
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
                                            applyLastN(n);
                                        }}
                                        className="w-12 px-1.5 py-0.5 text-[11px] text-center border border-gray-300 rounded focus:outline-none focus:border-gray-700 transition-all"
                                    />
                                    <span className="text-[11px] text-gray-500">days</span>
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
                            {[1, 2, 5, 10, 15, 30, 60].map(mins => (
                                <button
                                    key={mins}
                                    onClick={() => updateChartConfig(chartConfig.id, 'autoRefreshMins', mins)}
                                    className={`px-2 py-1 transition-all ${(chartConfig.autoRefreshMins ?? 5) === mins
                                        ? 'bg-gray-900 text-white'
                                        : 'bg-white text-gray-500 hover:bg-gray-100'
                                        }`}
                                >
                                    {mins < 60 ? `${mins}m` : '1h'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Bar orientation toggle — only for bar charts */}
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
                    <div className={`grid gap-3 mb-4 px-5 ${chartConfig.chartType?.value === 'number' ? 'grid-cols-3' : 'grid-cols-4'}`}>
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
                                    {chartConfig.chartType?.value === 'pie' ? 'Category' : 'X Axis'}
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
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aggregation</label>
                            <Combobox
                                value={chartConfig.aggregation}
                                onChange={(val) => updateChartConfig(chartConfig.id, 'aggregation', val)}
                                displayValue={(option) => option?.label || 'Select...'}
                                options={aggregationTypes}
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

    // Block the entire page until accounts + categories + initial fields are resolved
    if (!accountsLoaded || !categoriesChecked) {
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
        <div className="min-h-screen bg-gray-50 relative">
            <LoadingMask loading={loading} title="Loading..." message="Please wait while we fetch your data" />
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            Analytics Dashboard
                        </h1>
                        <div className="flex items-center gap-2">
                            {/* Category Combobox */}
                            <Combobox
                                value={
                                    (selectedCategory ? categories.find(c => c._id === selectedCategory) : null)
                                    ?? { _id: '', categoryName: 'All Categories' }
                                }
                                onChange={(val) => handleCategoryChange(val?._id || '')}
                                displayValue={(option) => option?.categoryName || 'All Categories'}
                                options={[{ _id: '', categoryName: 'All Categories' }, ...categories]}
                                disabled={categoryLoading || !acctId}
                                placeholder="All Categories"
                                className="w-44"
                                dropdownClassName="!min-w-0"
                            >
                                {(option) => (
                                    <ComboboxOption key={option._id || 'all'} value={option}>
                                        <ComboboxLabel>{option.categoryName}</ComboboxLabel>
                                    </ComboboxOption>
                                )}
                            </Combobox>
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
    );
};

export default AnalyticsDashboardPage;
