import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { resolveActiveAcctNo } from '../utils/accountHelpers';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import LoadingMask from '../components/LoadingMask';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const { acctNo, acctId } = useAccount();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fields, setFields] = useState([]);

    // Chart types
    const chartTypes = [
        { value: 'pie', label: 'Pie Chart' },
        { value: 'bar', label: 'Bar Chart' },
        { value: 'line', label: 'Line Chart' }
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
        dateFilterTo: ''
    };

    const getStorageKey = (acct) =>
        `analyticsDashboard_charts_${acct || 'default'}`;

    const loadSavedCharts = (acct) => {
        try {
            const saved = localStorage.getItem(getStorageKey(acct));
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    };

    // State for charts — fully restored from localStorage (all filters + axes)
    const [charts, setCharts] = useState(() => {
        const initAcctNo = resolveActiveAcctNo();
        const saved = loadSavedCharts(initAcctNo);
        return saved.map(entry => ({
            ...defaultChartConfig,
            ...entry,
            id: entry.id
        }));
    });
    const [nextChartId, setNextChartId] = useState(() => {
        const initAcctNo = resolveActiveAcctNo();
        const saved = loadSavedCharts(initAcctNo);
        return saved.length > 0 ? Math.max(...saved.map(c => c.id)) + 1 : 1;
    });
    const [chartDataCache, setChartDataCache] = useState({});
    const [chartLoadingState, setChartLoadingState] = useState({});

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

    // Fetch chart data from backend API
    const fetchChartDataFromBackend = async (chartId, chartConfig) => {
        if (!chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation) {
            return;
        }

        setChartLoadingState(prev => ({ ...prev, [chartId]: true }));
        try {
            const params = {
                xAxis: chartConfig.xAxis.value,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value,
                ...(acctId && { acctId }),
                ...(chartConfig.dateFilterFrom && { dateFrom: chartConfig.dateFilterFrom }),
                ...(chartConfig.dateFilterTo && { dateTo: chartConfig.dateFilterTo })
            };

            const response = await api.get('/api/ui/analytics/chart-data', { params });
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
            setChartLoadingState(prev => ({ ...prev, [chartId]: false }));
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
        const configured = charts.filter(c => c.xAxis && c.yAxis && c.aggregation);
        if (!configured.length) return;
        setGlobalRefreshing(true);
        await Promise.all(configured.map(c => fetchChartDataFromBackend(c.id, c)));
        setGlobalRefreshing(false);
    };

    // Persist all chart config to localStorage whenever charts change (keyed by account)
    useEffect(() => {
        try {
            const chartsToSave = charts.map(chart => ({
                id: chart.id,
                chartType: chart.chartType,
                xAxis: chart.xAxis,
                yAxis: chart.yAxis,
                aggregation: chart.aggregation,
                dateFilterFrom: chart.dateFilterFrom,
                dateFilterTo: chart.dateFilterTo,
                _lastNDays: chart._lastNDays,
                _showLastN: chart._showLastN,
                _showCustom: chart._showCustom
            }));
            localStorage.setItem(getStorageKey(acctNo), JSON.stringify(chartsToSave));
        } catch {
            // ignore storage errors
        }
    }, [charts, acctNo]);

    // Reload charts from localStorage when the active account changes
    useEffect(() => {
        if (!acctNo) return;
        const saved = loadSavedCharts(acctNo);
        const restored = saved.map(entry => ({ ...defaultChartConfig, ...entry, id: entry.id }));
        setCharts(restored);
        setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
        setChartDataCache({});
    }, [acctNo]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch fields for dropdowns — re-runs when acctNo is resolved/changes
    useEffect(() => {
        if (!acctNo) return;
        fetchFieldsData();
    }, [acctNo]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-fetch chart data for charts restored from localStorage once fields are loaded
    useEffect(() => {
        if (fields.length === 0) return;
        charts.forEach(chart => {
            if (chart.xAxis && chart.yAxis && chart.aggregation) {
                fetchChartDataFromBackend(chart.id, chart);
            }
        });
    }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchFieldsData = async () => {
        setLoading(true);
        try {
            const params = { ...(acctId && { acctId }) };
            const response = await api.get('/api/ui/leads', { params });

            const excludeFields = ['__v', 'updatedAt', '_id'];
            if (response.data.fields && response.data.fields.length > 0) {
                const displayFields = response.data.fields.filter(field => !excludeFields.includes(field));
                setFields(displayFields);
            } else if ((response.data.data || []).length > 0) {
                const firstLead = response.data.data[0];
                const displayFields = Object.keys(firstLead).filter(field => !excludeFields.includes(field));
                setFields(displayFields);
            }
        } catch (err) {
            console.error('Error fetching fields:', err);
        } finally {
            setLoading(false);
        }
    };

    // Get chart data from cache
    const getChartData = (chartConfig, chartId) => {
        return chartDataCache[chartId] || [];
    };

    // Colors for charts - Grayscale palette
    const COLORS = [
        '#1a1a1a', '#2d2d2d', '#3d3d3d', '#525252', '#666666',
        '#7a7a7a', '#8f8f8f', '#a3a3a3', '#b8b8b8', '#cccccc',
        '#000000', '#404040', '#595959', '#737373', '#8c8c8c'
    ];

    // Render Pie Chart with Recharts
    const renderPieChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #e0e0e0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value, name) => [value, yAxisLabel]}
                />
                <Legend />
            </PieChart>
        </ResponsiveContainer>
    );

    // Render Bar Chart with Recharts
    const renderBarChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #e0e0e0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value) => [value, yAxisLabel]}
                />
                <Legend />
                <Bar
                    dataKey="value"
                    name={yAxisLabel}
                    fill="#1a1a1a"
                    radius={[8, 8, 0, 0]}
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    // Render Line Chart with Recharts
    const renderLineChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #e0e0e0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value) => [value, yAxisLabel]}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="value"
                    name={yAxisLabel}
                    stroke="#1a1a1a"
                    strokeWidth={3}
                    dot={{ fill: '#1a1a1a', strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 7, fill: '#3d3d3d' }}
                />
            </LineChart>
        </ResponsiveContainer>
    );

    const renderChart = (chartConfig) => {
        const isLoading = chartLoadingState[chartConfig.id];
        const chartData = getChartData(chartConfig, chartConfig.id);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';

        if (isLoading) return (
            <div className="relative py-12">
                <LoadingMask loading={true} title="Loading chart data..." message="Please wait..." />
            </div>
        );

        if (!chartConfig.chartType) return <div className="text-center py-12 text-gray-500 text-sm">Select chart type to begin</div>;
        if (!chartConfig.xAxis) return <div className="text-center py-12 text-gray-500 text-sm">Select X axis</div>;
        if (!chartConfig.yAxis) return <div className="text-center py-12 text-gray-500 text-sm">Select Y axis</div>;
        if (!chartConfig.aggregation) return <div className="text-center py-12 text-gray-500 text-sm">Select aggregation type</div>;
        if (!chartData.length) return <div className="text-center py-12 text-gray-500 text-sm">No data available</div>;

        switch (chartConfig.chartType.value) {
            case 'pie':
                return renderPieChart(chartData, yAxisLabel);
            case 'bar':
                return renderBarChart(chartData, yAxisLabel);
            case 'line':
                return renderLineChart(chartData, yAxisLabel);
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

        const applyLastN = (n) => {
            const d = new Date(today); d.setDate(d.getDate() - n);
            updateChartConfig(chartConfig.id, 'dateFilterFrom', toISO(d));
            updateChartConfig(chartConfig.id, 'dateFilterTo', todayStr);
        };

        return (
            <div key={chartConfig.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-md hover:shadow-lg transition-all duration-300 animate-scale-in">

                {/* ── Top bar: title + pinned action buttons (never wraps) ── */}
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-black shrink-0"></div>
                        <span className="shrink-0">Chart {chartConfig.id}</span>
                        {chartConfig.xAxis && chartConfig.yAxis && chartConfig.aggregation && (
                            <span className="font-normal text-gray-400 text-xs truncate">
                                {chartConfig.xAxis.label} vs {chartConfig.yAxis.label} ({chartConfig.aggregation.label})
                            </span>
                        )}
                    </h4>

                    {/* Action buttons — only Delete now; global Refresh is in the page header */}
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                        {/* Delete */}
                        <button
                            onClick={() => removeChart(chartConfig.id)}
                            title="Delete chart"
                            className="p-1.5 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Date filter row (can wrap freely) ── */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {/* Today */}
                    <button
                        onClick={() => {
                            if (isToday) {
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                                updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                            } else {
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', todayStr);
                                updateChartConfig(chartConfig.id, 'dateFilterTo', todayStr);
                                updateChartConfig(chartConfig.id, '_showCustom', false);
                                updateChartConfig(chartConfig.id, '_showLastN', false);
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
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                                updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                            } else {
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', yesterdayStr);
                                updateChartConfig(chartConfig.id, 'dateFilterTo', yesterdayStr);
                                updateChartConfig(chartConfig.id, '_showCustom', false);
                                updateChartConfig(chartConfig.id, '_showLastN', false);
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
                                    updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                                    updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                                    updateChartConfig(chartConfig.id, '_showLastN', false);
                                } else {
                                    updateChartConfig(chartConfig.id, '_showLastN', true);
                                    updateChartConfig(chartConfig.id, '_showCustom', false);
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
                            updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                            updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                            updateChartConfig(chartConfig.id, '_showLastN', false);
                            updateChartConfig(chartConfig.id, '_showCustom', !chartConfig._showCustom);
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
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                                updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                                updateChartConfig(chartConfig.id, '_showCustom', false);
                                updateChartConfig(chartConfig.id, '_showLastN', false);
                            }}
                            className="text-gray-400 hover:text-gray-700 transition-colors text-base leading-none px-1"
                            title="Clear date filters"
                        >
                            ×
                        </button>
                    )}
                </div>


                {/* Chart Controls */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Chart Type</label>
                        <Combobox
                            value={chartConfig.chartType}
                            onChange={(val) => updateChartConfig(chartConfig.id, 'chartType', val)}
                            displayValue={(option) => option?.label || 'Select...'}
                            options={chartTypes}
                        >
                            {(option) => (
                                <ComboboxOption key={`chart-type-${chartConfig.id}-${option.value}`} value={option}>
                                    <ComboboxLabel>{option.label}</ComboboxLabel>
                                </ComboboxOption>
                            )}
                        </Combobox>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">X Axis</label>
                        <Combobox
                            value={chartConfig.xAxis}
                            onChange={(val) => updateChartConfig(chartConfig.id, 'xAxis', val)}
                            displayValue={(option) => option?.label || 'Select...'}
                            options={columns}
                        >
                            {(option) => (
                                <ComboboxOption key={`x-axis-${chartConfig.id}-${option.value}`} value={option}>
                                    <ComboboxLabel>{option.label}</ComboboxLabel>
                                </ComboboxOption>
                            )}
                        </Combobox>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Y Axis</label>
                        <Combobox
                            value={chartConfig.yAxis}
                            onChange={(val) => updateChartConfig(chartConfig.id, 'yAxis', val)}
                            displayValue={(option) => option?.label || 'Select...'}
                            options={columns}
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
                        >
                            {(option) => (
                                <ComboboxOption key={`agg-${chartConfig.id}-${option.value}`} value={option}>
                                    <ComboboxLabel>{option.label}</ComboboxLabel>
                                </ComboboxOption>
                            )}
                        </Combobox>
                    </div>
                </div>

                {/* Chart Display */}
                <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100">
                    {renderChart(chartConfig)}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                <svg className={`w-4 h-4 ${globalRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </button>
                            <button
                                onClick={() => navigate('/leads')}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all font-medium text-sm flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-4 py-6">
                {charts.length === 0 ? (
                    <div className="text-center py-20 animate-fade-in">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center border-2 border-gray-300">
                            <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-3">No Charts Yet</h3>
                        <p className="text-gray-500 mb-8 text-lg">Get started by adding your first chart to visualize your data</p>
                        <button
                            onClick={addChart}
                            className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-all font-medium inline-flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Your First Chart
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            {charts.map(chart => renderChartCard(chart))}
                        </div>

                        {/* Floating Add Chart Button */}
                        <div className="flex justify-center mt-8">
                            <button
                                onClick={addChart}
                                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg transition-all font-medium inline-flex items-center gap-2 hover:scale-105"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
