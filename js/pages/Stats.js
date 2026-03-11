import { defineComponent, ref, computed, watch, onMounted, inject } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { getLogsAll, getMediaAll } from '../db.js';
import BaseChart from '../components/Charts.js';
import SvgCalendarHeatmap from '../components/SvgCalendarHeatmap.js';
import SvgActivityHeatmap from '../components/SvgActivityHeatmap.js';
import { convertToHours, formatDuration, formatChars, CATEGORY_COLORS, calcReadingSpeed, getTodayDateString } from '../utils.js';

export default defineComponent({
    name: 'Stats',
    components: { BaseChart, SvgCalendarHeatmap, SvgActivityHeatmap },
    setup() {
        const showToast = inject('showToast');
        const isLoading = ref(true);
        const allLogs = ref([]);
        const allMedia = ref([]);

        // FILTER BAR STATE
        const periodFilter = ref('current_month'); // 'current_week', 'current_month', '3months', 'year', 'all'
        const categoryFilters = ref(['anime', 'manga', 'ln', 'vn', 'podcast', 'anki']);
        const animeWatchMode = ref('all'); // 'all', 'raw', 'with_sub'

        const loadData = async () => {
            isLoading.value = true;
            try {
                allLogs.value = await getLogsAll();
                allMedia.value = await getMediaAll();
            } catch (e) {
                console.error(e);
            } finally {
                isLoading.value = false;
            }
        };
        onMounted(loadData);

        const resetFilters = () => {
            categoryFilters.value = ['anime', 'manga', 'ln', 'vn', 'podcast', 'anki'];
            animeWatchMode.value = 'all';
        };

        const toggleCategory = (cat) => {
            if (categoryFilters.value.includes(cat)) {
                categoryFilters.value = categoryFilters.value.filter(c => c !== cat);
            } else {
                categoryFilters.value.push(cat);
            }
        };

        // ─── HELPER: hitung rentang tanggal dari periodFilter ───────────────
        const getPeriodRange = () => {
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            let start = new Date();
            start.setHours(0, 0, 0, 0);
            let end = new Date(today);

            switch (periodFilter.value) {
                case '7days':
                    start.setDate(today.getDate() - 6);
                    break;
                case '30days':
                    start.setDate(today.getDate() - 29);
                    break;
                case '90days':
                    start.setDate(today.getDate() - 89);
                    break;
                case '365days':
                    start.setDate(today.getDate() - 364);
                    break;
                case 'current_week':
                    // Senin - Minggu
                    const day = today.getDay();
                    const diffToMon = today.getDate() - day + (day === 0 ? -6 : 1);
                    start.setDate(diffToMon);
                    end.setDate(diffToMon + 6);
                    break;
                case 'current_month':
                    // Tgl 1 - Akhir bulan
                    start.setDate(1);
                    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    break;
                case 'year':
                    // 1 Jan - 31 Des
                    start.setMonth(0, 1);
                    end = new Date(today.getFullYear(), 11, 31);
                    break;
                case 'all':
                    const firstLogDate = allLogs.value.length > 0 ? new Date(allLogs.value.sort((a, b) => a.date.localeCompare(b.date))[0].date) : today;
                    return { start: firstLogDate, end: today };
            }

            if (end) end.setHours(23, 59, 59, 999);
            return { start, end };
        };

        const getPeriodDates = () => {
            const { start, end } = getPeriodRange();
            const dates = [];
            let curr = new Date(start);
            while (curr <= end) {
                dates.push(curr.toISOString().split('T')[0]);
                curr.setDate(curr.getDate() + 1);
            }
            return dates;
        };

        // DATA FILTERING LOGIC
        const filteredLogs = computed(() => {
            let logs = allLogs.value;

            // Kategori
            logs = logs.filter(l => categoryFilters.value.includes(l.type));

            // Anime Mode
            if (categoryFilters.value.includes('anime') && animeWatchMode.value !== 'all') {
                logs = logs.filter(l => l.type !== 'anime' || l.watchMode === animeWatchMode.value);
            }

            // FIX 1: '30days' sekarang ditangani lewat getPeriodRange()
            const { start, end } = getPeriodRange();
            if (start) {
                logs = logs.filter(l => {
                    const d = new Date(l.date);
                    return d >= start && d <= end;
                });
            }

            return logs;
        });

        // FIX 2: prevPeriodLogs sekarang menghitung periode sebelumnya secara akurat
        const prevPeriodLogs = computed(() => {
            const { start, end } = getPeriodRange();
            if (!start) return []; // 'all' → tidak ada periode sebelumnya

            const duration = end - start;
            const prevEnd = new Date(start.getTime() - 1);
            const prevStart = new Date(prevEnd.getTime() - duration);

            return allLogs.value.filter(l => {
                const d = new Date(l.date);
                return d >= prevStart && d <= prevEnd &&
                    categoryFilters.value.includes(l.type) &&
                    (animeWatchMode.value === 'all' || l.type !== 'anime' || l.watchMode === animeWatchMode.value);
            });
        });

        const activityLogs = computed(() => allLogs.value.filter(l => !l.isAutoGenerated));

        // Animated Stats
        const animTotalMins = ref(0);
        const animActiveDays = ref(0);
        const animStreak = ref(0);

        // FIX 3: animateValue dengan cancel untuk mencegah race condition
        let animFrames = {};
        const animateValue = (key, refVar, target, duration = 1000) => {
            if (animFrames[key]) cancelAnimationFrame(animFrames[key]);
            const start = refVar.value;
            const startTime = performance.now();
            const tick = (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3);
                refVar.value = Math.floor(start + (target - start) * ease);
                if (progress < 1) {
                    animFrames[key] = requestAnimationFrame(tick);
                }
            };
            animFrames[key] = requestAnimationFrame(tick);
        };

        const summaryStats = computed(() => {
            const standardLogs = filteredLogs.value.filter(l => !l.isAutoGenerated);
            const totalMins = filteredLogs.value.reduce((sum, l) => sum + l.durationMinutes, 0);
            const activeDays = new Set(standardLogs.map(l => l.date)).size;

            // FIX 4: Streak dihitung dari filteredLogs agar konsisten dengan filter lainnya
            const dates = Array.from(new Set(filteredLogs.value.filter(l => !l.isAutoGenerated).map(l => l.date))).sort().reverse();
            let currentStreak = 0;
            if (dates.length > 0) {
                const todayStr = getTodayDateString();
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const pad = (n) => (n < 10 ? '0' + n : n);
                const yesterdayStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

                let checkDate = dates[0] === todayStr ? todayStr : (dates[0] === yesterdayStr ? yesterdayStr : null);
                if (checkDate) {
                    currentStreak = 1;
                    let last = new Date(checkDate);
                    for (let i = 1; i < dates.length; i++) {
                        let current = new Date(dates[i]);
                        const diff = (last - current) / 86400000;
                        if (diff === 1) {
                            currentStreak++;
                            last = current;
                        } else break;
                    }
                }
            }

            // FIX 5: activeDaysPercent dihitung untuk semua periode, bukan hanya '30days'
            const { start, end } = getPeriodRange();
            let totalDaysInPeriod = 0;
            if (start && end) { // Ensure both start and end are valid Date objects
                totalDaysInPeriod = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
            }
            const activeDaysPercent = totalDaysInPeriod > 0 ? Math.round((activeDays / totalDaysInPeriod) * 100) : 0;

            return {
                totalMins,
                totalTime: formatDuration(totalMins),
                avgPerDay: activeDays > 0 ? formatDuration(totalMins / activeDays) : '0m',
                activeDaysCount: activeDays,
                activeDaysPercent,
                streak: currentStreak
            };
        });

        watch(summaryStats, (newVal) => {
            animateValue('totalMins', animTotalMins, newVal.totalMins);
            animateValue('activeDays', animActiveDays, newVal.activeDaysCount);
            animateValue('streak', animStreak, newVal.streak);
        }, { immediate: true });

        // FIX 6: JOURNEY TIMELINE — daily hours chart (bukan cumulative karena cumulativeMins tidak dipakai)
        const journeyData = computed(() => {
            const { start: periodStart, end: periodEnd } = getPeriodRange();
            const datesMap = new Map();
            allLogs.value.forEach(l => {
                datesMap.set(l.date, (datesMap.get(l.date) || 0) + l.durationMinutes);
            });

            const timeline = [];
            let current = periodStart ? new Date(periodStart) : (allLogs.value.length > 0 ? new Date(allLogs.value[0].date) : new Date());
            const end = periodEnd || new Date();

            while (current <= end) {
                const ds = current.toISOString().split('T')[0];
                const dailyMins = datesMap.get(ds) || 0;
                timeline.push({ x: ds, y: dailyMins / 60 });
                current.setDate(current.getDate() + 1);
            }

            return {
                labels: timeline.map(t => t.x),
                datasets: [{
                    label: 'Jam Immersion per Hari',
                    data: timeline.map(t => t.y),
                    fill: true,
                    backgroundColor: (ctx) => {
                        const canvas = ctx.chart.ctx;
                        const gradient = canvas.createLinearGradient(0, 0, 0, 120);
                        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
                        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
                        return gradient;
                    },
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                }]
            };
        });

        const journeyOptions = computed(() => {
            const dataPts = journeyData.value?.datasets[0]?.data || [];
            const maxVal = dataPts.length > 0 ? Math.max(...dataPts) : 0;
            const annotations = {};

            const milestones = [1, 2, 4, 8];
            milestones.forEach(m => {
                if (m <= Math.max(maxVal * 1.5, 2)) {
                    annotations['line' + m] = {
                        type: 'line',
                        yMin: m, yMax: m,
                        borderColor: 'rgba(99,102,241,0.1)',
                        borderDash: [5, 5],
                        label: {
                            content: m + 'j',
                            display: true,
                            position: 'end',
                            backgroundColor: 'rgba(31, 41, 55, 0.6)',
                            color: 'rgba(129, 140, 248, 0.7)',
                            font: { size: 8, weight: 'bold' },
                            padding: 3,
                            borderRadius: 3
                        }
                    };
                }
            });

            return {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { bottom: 15, top: 10, left: 5, right: 5 }
                },
                scales: {
                    x: { display: false },
                    y: {
                        display: false,
                        min: 0,
                        suggestedMax: Math.max(maxVal * 1.2, 1)
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Durasi: ${ctx.parsed.y.toFixed(1)} jam`
                        }
                    },
                    annotation: { annotations }
                }
            };
        });

        // SECTION 2: TREND CHART
        const granularity = ref('daily');
        const trendChartData = computed(() => {
            const logs = filteredLogs.value;
            const groupsMap = new Map();

            // Populate groupsMap with all dates in the period to ensure empty periods are shown
            const { start: pStart, end: pEnd } = getPeriodRange();
            if (pStart && pEnd) { // Ensure both start and end are valid Date objects
                let curr = new Date(pStart);
                while (curr <= pEnd) {
                    let key = curr.toISOString().split('T')[0];
                    if (granularity.value === 'weekly') {
                        const d = new Date(curr);
                        d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
                        key = d.toISOString().split('T')[0];
                    } else if (granularity.value === 'monthly') {
                        key = curr.toISOString().substring(0, 7) + '-01';
                    }
                    if (!groupsMap.has(key)) groupsMap.set(key, { total: 0 });

                    if (granularity.value === 'daily') curr.setDate(curr.getDate() + 1);
                    else if (granularity.value === 'weekly') curr.setDate(curr.getDate() + 7);
                    else curr.setMonth(curr.getMonth() + 1);
                }
            }

            logs.forEach(l => {
                let key = l.date;
                if (granularity.value === 'weekly') {
                    const d = new Date(l.date);
                    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
                    key = d.toISOString().split('T')[0];
                } else if (granularity.value === 'monthly') {
                    key = l.date.substring(0, 7) + '-01';
                }

                if (!groupsMap.has(key)) groupsMap.set(key, { total: 0 });
                const obj = groupsMap.get(key);
                obj[l.type] = (obj[l.type] || 0) + convertToHours(l.durationMinutes);
                obj.total += convertToHours(l.durationMinutes);
            });

            const sortedKeys = Array.from(groupsMap.keys()).sort();
            const hexToRgba = (hex, alpha) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            const datasets = categoryFilters.value.map(cat => ({
                label: cat.toUpperCase(),
                data: sortedKeys.map(k => groupsMap.get(k)[cat] || 0),
                backgroundColor: (ctx) => {
                    const canvas = ctx.chart.ctx;
                    const hex = CATEGORY_COLORS[cat].border;
                    const gradient = canvas.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, hexToRgba(hex, 0.4));
                    gradient.addColorStop(1, hexToRgba(hex, 0.0));
                    return gradient;
                },
                borderColor: CATEGORY_COLORS[cat].border,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }));

            const cumulativeData = sortedKeys.map(k => {
                return Math.round(groupsMap.get(k).total * 10) / 10;
            });

            datasets.push({
                label: 'Total Hari Ini',
                data: cumulativeData,
                type: 'line',
                borderColor: 'rgba(148, 163, 184, 0.4)',
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'y2',
                fill: false,
                tension: 0.4
            });

            return { labels: sortedKeys, datasets };
        });

        const trendChartOptions = computed(() => {
            const data = trendChartData.value;
            let maxMins = 0;
            if (data && data.datasets) {
                data.datasets.forEach(ds => {
                    if (ds.yAxisID !== 'y2') { // Skip kumulatif
                        const localMax = Math.max(...ds.data.map(v => v || 0));
                        if (localMax > maxMins) maxMins = localMax;
                    }
                });
            }

            let maxCum = 0;
            const cumDs = data?.datasets.find(ds => ds.yAxisID === 'y2');
            if (cumDs) {
                maxCum = Math.max(...cumDs.data.map(v => v || 0));
            }

            return {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        stacked: false,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: { display: true, text: 'Jam per sesi', color: '#94a3b8', font: { size: 10, weight: 'bold' } },
                        suggestedMax: Math.max(maxMins * 1.2, 2)
                    },
                    y2: {
                        position: 'right',
                        grid: { display: false },
                        title: { display: true, text: 'Total kumulatif', color: '#94a3b8', font: { size: 10, weight: 'bold' } },
                        suggestedMax: maxCum * 1.1
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { size: 9 } }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, usePointStyle: true, pointStyle: 'circle', padding: 20 }
                    }
                }
            };
        });

        // SECTION 2B: RADAR CHART
        const radarChartData = computed(() => {
            const logs = filteredLogs.value;
            const categories = ['anime', 'manga', 'ln', 'vn', 'podcast', 'anki'];
            const data = categories.map(cat => {
                const mins = logs.filter(l => l.type === cat).reduce((sum, l) => sum + l.durationMinutes, 0);
                return convertToHours(mins);
            });

            return {
                labels: categories.map(c => c.toUpperCase()),
                datasets: [{
                    label: 'Jam Immersion',
                    data: data,
                    fill: true,
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: 'rgb(99, 102, 241)',
                    pointBackgroundColor: 'rgb(99, 102, 241)',
                }]
            };
        });

        // ANIME RAW vs SUB (STACKED BAR)
        const animeStackedData = computed(() => {
            const animeLogs = allLogs.value.filter(l => l.type === 'anime');
            const datesMap = new Map();
            animeLogs.forEach(l => {
                const d = l.date.substring(0, 7);
                if (!datesMap.has(d)) datesMap.set(d, { raw: 0, sub: 0 });
                if (l.watchMode === 'raw') datesMap.get(d).raw += l.durationMinutes;
                else datesMap.get(d).sub += l.durationMinutes;
            });

            const sortedMonths = Array.from(datesMap.keys()).sort();
            return {
                labels: sortedMonths,
                datasets: [
                    { label: 'Raw', data: sortedMonths.map(m => convertToHours(datesMap.get(m).raw)), backgroundColor: '#6366f1', stack: 'anime' },
                    { label: 'With Sub', data: sortedMonths.map(m => convertToHours(datesMap.get(m).sub)), backgroundColor: 'rgba(99,102,241,0.35)', stack: 'anime' }
                ]
            };
        });

        const animeRatioData = computed(() => {
            const data = animeStackedData.value;
            const ratios = data.labels.map((m, idx) => {
                const raw = data.datasets[0].data[idx];
                const sub = data.datasets[1].data[idx];
                const total = raw + sub;
                return total > 0 ? Math.round((raw / total) * 100) : 0;
            });
            return {
                labels: data.labels,
                datasets: [{
                    label: 'Raw Ratio %',
                    data: ratios,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            };
        });

        // FIX 7: animeRatioOptions sekarang include responsive: true & maintainAspectRatio: false
        const animeDonutOptions = {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false } }
        };

        const animeDonutData = computed(() => {
            const animeLogs = filteredLogs.value.filter(l => l.type === 'anime');
            const raw = animeLogs.filter(l => l.watchMode === 'raw').reduce((s, l) => s + l.durationMinutes, 0);
            const sub = animeLogs.filter(l => l.watchMode === 'with_sub').reduce((s, l) => s + l.durationMinutes, 0);
            return {
                labels: ['Raw', 'Sub'],
                datasets: [{
                    data: [convertToHours(raw), convertToHours(sub)],
                    backgroundColor: ['#6366f1', 'rgba(99,102,241,0.1)'],
                    borderWidth: 0, hoverOffset: 4
                }]
            };
        });

        const comprehensionBarData = computed(() => {
            const categories = ['anime', 'manga', 'ln', 'vn'];
            const labels = categories.map(c => c.toUpperCase());
            const data = categories.map(cat => {
                const logs = filteredLogs.value.filter(l => l.type === cat && l.comprehension !== undefined);
                if (logs.length === 0) return 0;
                return Math.round(logs.reduce((s, l) => s + l.comprehension, 0) / logs.length);
            });
            return {
                labels,
                datasets: [{
                    label: 'Avg Comprehension %',
                    data,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    borderRadius: 4
                }]
            };
        });

        const performanceTrendData = computed(() => {
            const dates = getPeriodDates();
            const compData = dates.map(d => {
                const logs = filteredLogs.value.filter(l => l.date === d && l.comprehension !== undefined);
                return logs.length > 0 ? Math.round(logs.reduce((s, l) => s + l.comprehension, 0) / logs.length) : null;
            });
            const focusData = dates.map(d => {
                const logs = filteredLogs.value.filter(l => l.date === d && l.focus !== undefined);
                return logs.length > 0 ? Math.round((logs.reduce((s, l) => s + l.focus, 0) / logs.length) * 20) : null;
            });
            const energyData = dates.map(d => {
                const logs = filteredLogs.value.filter(l => l.date === d && l.energy !== undefined);
                return logs.length > 0 ? Math.round((logs.reduce((s, l) => s + l.energy, 0) / logs.length) * 20) : null;
            });

            return {
                labels: dates,
                datasets: [
                    { label: 'Pemahaman %', data: compData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 0, spanGaps: true },
                    { label: 'Fokus %', data: focusData, borderColor: '#f97316', fill: false, tension: 0.4, pointRadius: 0, spanGaps: true, borderDash: [5, 5] },
                    { label: 'Energi %', data: energyData, borderColor: '#fbbf24', fill: false, tension: 0.4, pointRadius: 0, spanGaps: true, borderDash: [2, 2] }
                ]
            };
        });

        const animeSummary = computed(() => {
            const animeLogs = filteredLogs.value.filter(l => l.type === 'anime');
            const raw = animeLogs.filter(l => l.watchMode === 'raw').reduce((s, l) => s + l.durationMinutes, 0);
            const sub = animeLogs.filter(l => l.watchMode === 'with_sub').reduce((s, l) => s + l.durationMinutes, 0);
            const total = raw + sub;
            const ratio = total > 0 ? Math.round((raw / total) * 100) : 0;
            return {
                raw: Math.round(raw / 60) + 'j',
                sub: Math.round(sub / 60) + 'j',
                ratio,
                ratioColor: ratio > 70 ? 'text-emerald-500' : (ratio > 40 ? 'text-amber-500' : 'text-rose-500')
            };
        });

        // READING SPEED (LINE AREA)
        const readingSpeedData = computed(() => {
            const allLogsText = allLogs.value.filter(l => (l.type === 'ln' || l.type === 'vn') && l.chars && l.durationMinutes > 0);
            if (allLogsText.length === 0) return null;

            const dates = getPeriodDates();

            const getSpeedForType = (type) => {
                return dates.map(date => {
                    const logs = allLogsText.filter(l => l.date === date && l.type === type);
                    if (logs.length === 0) return null;
                    const totalChars = logs.reduce((s, l) => s + (Number(l.chars) || 0), 0);
                    const totalMins = logs.reduce((s, l) => s + l.durationMinutes, 0);
                    return Math.round(calcReadingSpeed(totalChars, totalMins));
                });
            };

            const lnData = getSpeedForType('ln');
            const vnData = getSpeedForType('vn');

            return {
                labels: dates,
                datasets: [
                    {
                        label: 'Light Novel',
                        data: lnData,
                        borderColor: '#10b981',
                        backgroundColor: (ctx) => {
                            const canvas = ctx.chart.ctx;
                            const gradient = canvas.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
                            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        spanGaps: true,
                        borderWidth: 3
                    },
                    {
                        label: 'Visual Novel',
                        data: vnData,
                        borderColor: '#ec4899',
                        backgroundColor: (ctx) => {
                            const canvas = ctx.chart.ctx;
                            const gradient = canvas.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, 'rgba(236, 72, 153, 0.4)');
                            gradient.addColorStop(1, 'rgba(236, 72, 153, 0.0)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        spanGaps: true,
                        borderWidth: 3
                    }
                ]
            };
        });

        const readingSpeedStats = computed(() => {
            const textLogs = allLogs.value.filter(l => (l.type === 'ln' || l.type === 'vn') && l.chars && l.durationMinutes > 0).sort((a, b) => a.date.localeCompare(b.date));
            if (textLogs.length === 0) return { avg: 0, pb: 0, trend: 0 };

            const speeds = textLogs.map(l => calcReadingSpeed(l.chars, l.durationMinutes));
            const avg = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
            const pb = Math.max(...speeds);

            let trend = 0;
            if (speeds.length >= 4) {
                const mid = Math.floor(speeds.length / 2);
                const recent = speeds.slice(-mid);
                const prev = speeds.slice(-mid * 2, -mid);
                const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
                const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
                trend = avgPrev > 0 ? Math.round(((avgRecent - avgPrev) / avgPrev) * 100) : 0;
            }

            return { avg: avg.toLocaleString(), pb: pb.toLocaleString(), trend };
        });

        // % HARI AKTIF PER BULAN
        const monthlyConsistencyData = computed(() => {
            const logs = allLogs.value.filter(l => !l.isAutoGenerated);
            const monthsMap = new Map();

            const now = new Date();
            for (let i = 0; i < 12; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = d.toISOString().substring(0, 7);
                monthsMap.set(key, new Set());
            }

            logs.forEach(l => {
                const key = l.date.substring(0, 7);
                if (monthsMap.has(key)) monthsMap.get(key).add(l.date);
            });

            const labels = Array.from(monthsMap.keys()).reverse();
            const data = labels.map(key => {
                const [year, month] = key.split('-').map(Number);
                const daysInMonth = new Date(year, month, 0).getDate();
                const activeDays = monthsMap.get(key).size;
                return Math.round((activeDays / daysInMonth) * 100);
            });

            return {
                labels,
                datasets: [{
                    data,
                    backgroundColor: data.map(v => v >= 70 ? '#10b981' : (v >= 40 ? '#f59e0b' : '#ef4444')),
                    borderRadius: 4
                }]
            };
        });

        const readingSpeedOptions = computed(() => {
            const data = readingSpeedData.value;
            let maxVal = 0;
            if (data && data.datasets) {
                data.datasets.forEach(ds => {
                    const localMax = Math.max(...ds.data.filter(v => v !== null), 0);
                    if (localMax > maxVal) maxVal = localMax;
                });
            }

            return {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 }
                    },
                    y: {
                        min: 0,
                        title: { display: true, text: 'Chars / Jam', color: '#94a3b8', font: { size: 10, weight: 'bold' } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        suggestedMax: Math.max(maxVal * 1.1, 20000)
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, usePointStyle: true, pointStyle: 'circle', padding: 20 }
                    }
                }
            };
        });

        // FIX 8: COMPARISON — menggunakan prevPeriodLogs yang real, bukan random
        const comparisonChartData = computed(() => {
            const categories = ['anime', 'manga', 'ln', 'vn', 'podcast', 'anki'];
            const currentData = categories.map(cat => {
                const mins = filteredLogs.value.filter(l => l.type === cat).reduce((sum, l) => sum + l.durationMinutes, 0);
                return convertToHours(mins);
            });

            const previousData = categories.map(cat => {
                const mins = prevPeriodLogs.value.filter(l => l.type === cat).reduce((sum, l) => sum + l.durationMinutes, 0);
                return convertToHours(mins);
            });

            return {
                labels: categories.map(c => c.toUpperCase()),
                datasets: [
                    { label: 'Periode Ini', data: currentData, backgroundColor: 'rgb(99, 102, 241)', borderRadius: 6 },
                    { label: 'Periode Lalu', data: previousData, backgroundColor: 'rgba(99, 102, 241, 0.2)', borderRadius: 6 }
                ]
            };
        });

        // FIX 9: mediaSortKey sekarang digunakan dalam perMediaStats
        const mediaSortKey = ref('time'); // 'time', 'sessions', 'speed', 'recent'
        const mediaSearch = ref('');
        const perMediaStats = computed(() => {
            const stats = allMedia.value.map(m => {
                const baseLogs = allLogs.value.filter(l => l.mediaId === m.id && !l.isAutoGenerated);
                const allLogsMedia = allLogs.value.filter(l => l.mediaId === m.id);
                const totalMins = allLogsMedia.reduce((sum, l) => sum + l.durationMinutes, 0);
                const totalChars = baseLogs.reduce((sum, l) => sum + (Number(l.chars) || 0), 0);
                return {
                    ...m,
                    totalMins,
                    sessionCount: baseLogs.length,
                    avgSpeed: calcReadingSpeed(totalChars, totalMins),
                    lastSession: baseLogs.length > 0 ? baseLogs.sort((a, b) => b.date.localeCompare(a.date))[0].date : null
                };
            }).filter(m => m.totalMins > 0);

            let filtered = stats;
            if (mediaSearch.value) {
                const q = mediaSearch.value.toLowerCase();
                filtered = stats.filter(s => (s.title || s.title_romaji || '').toLowerCase().includes(q));
            }

            // Sort berdasarkan mediaSortKey
            return filtered.sort((a, b) => {
                switch (mediaSortKey.value) {
                    case 'sessions': return b.sessionCount - a.sessionCount;
                    case 'speed': return b.avgSpeed - a.avgSpeed;
                    case 'recent': return (b.lastSession || '').localeCompare(a.lastSession || '');
                    case 'time':
                    default: return b.totalMins - a.totalMins;
                }
            });
        });

        // DRILL DOWN MODAL
        const selectedMedia = ref(null);
        const openDrillDown = (media) => {
            selectedMedia.value = media;
        };

        const selectedMediaBarData = computed(() => {
            if (!selectedMedia.value) return null;
            try {
                // Group by date
                const dailyStats = new Map();
                filteredLogs.value
                    .filter(l => l.mediaId === selectedMedia.value.id)
                    .forEach(log => {
                        if (!dailyStats.has(log.date)) dailyStats.set(log.date, { date: log.date, durationMinutes: 0 });
                        dailyStats.get(log.date).durationMinutes += log.durationMinutes;
                    });

                const logs = Array.from(dailyStats.values())
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                    .slice(-14);

                return {
                    labels: logs.map(l => {
                        const d = new Date(l.date);
                        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    }),
                    datasets: [{ label: 'Jam', data: logs.map(l => convertToHours(l.durationMinutes)), backgroundColor: '#6366f1', borderRadius: 4 }]
                };
            } catch (e) {
                console.error("Error computing bar data:", e);
                return null;
            }
        });

        const selectedMediaLineData = computed(() => {
            if (!selectedMedia.value) return null;
            try {
                // Group by date
                const dailyStats = new Map();
                filteredLogs.value
                    .filter(l => l.mediaId === selectedMedia.value.id)
                    .forEach(log => {
                        if (!dailyStats.has(log.date)) dailyStats.set(log.date, { date: log.date, durationMinutes: 0, chars: 0 });
                        dailyStats.get(log.date).durationMinutes += log.durationMinutes;
                        dailyStats.get(log.date).chars += log.chars || 0;
                    });

                const logs = Array.from(dailyStats.values())
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                    .slice(-14);

                return {
                    labels: logs.map(l => {
                        const d = new Date(l.date);
                        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    }),
                    datasets: [{
                        label: 'Chars/Jam',
                        data: logs.map(l => calcReadingSpeed(l.chars, l.durationMinutes)),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                };
            } catch (e) {
                console.error("Error computing line data:", e);
                return null;
            }
        });

        const selectedMediaRecentLogs = computed(() => {
            if (!selectedMedia.value) return [];
            try {
                return filteredLogs.value
                    .filter(l => l.mediaId === selectedMedia.value.id)
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 10);
            } catch (e) {
                console.error("Error computing recent logs:", e);
                return [];
            }
        });

        // Lock scroll when modal is open
        watch(selectedMedia, (val) => {
            if (val) document.body.classList.add('overflow-hidden');
            else document.body.classList.remove('overflow-hidden');
        });

        const yearlyHeatmapData = computed(() => {
            const hmap = new Map();
            allLogs.value.forEach(l => {
                hmap.set(l.date, (hmap.get(l.date) || 0) + l.durationMinutes);
            });
            return Array.from(hmap.entries()).map(([date, minutes]) => ({ date, minutes }));
        });

        return {
            isLoading,
            periodFilter,
            categoryFilters,
            animeWatchMode,
            toggleCategory,
            resetFilters,
            summaryStats,
            trendChartData,
            trendChartOptions,
            radarChartData,
            comparisonChartData,
            readingSpeedData,
            readingSpeedOptions,
            readingSpeedStats,
            monthlyConsistencyData,
            perMediaStats,
            mediaSearch,
            mediaSortKey,
            selectedMedia,
            selectedMediaBarData,
            selectedMediaLineData,
            selectedMediaRecentLogs,
            openDrillDown,
            allLogs,
            granularity,
            CATEGORY_COLORS,
            activityLogs,
            filteredLogs,
            yearlyHeatmapData,
            animTotalMins,
            animActiveDays,
            animStreak,
            journeyData,
            journeyOptions,
            animeDonutData,
            animeDonutOptions,
            comprehensionBarData,
            performanceTrendData,
            animeSummary,
            formatDuration,
            formatChars,
            calcReadingSpeed,
            convertToHours
        };
    },
    template: `
    <div class="max-w-7xl mx-auto space-y-8 pb-20 animate-fade-in px-4">
        
        <!-- STICKY FILTER BAR -->
        <div class="sticky top-0 z-[45] bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur-md py-4 border-b border-gray-200 dark:border-gray-800 -mx-4 md:-mx-8 px-4 md:px-8 print:hidden">
            <div class="flex flex-col md:flex-row items-start md:items-center gap-6 overflow-x-auto custom-scrollbar pb-2 md:pb-0">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Periode</span>
                    <select v-model="periodFilter" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500 transition-all outline-none">
                        <option value="7days">7 Hari Terakhir</option>
                        <option value="current_week">Minggu Ini</option>
                        <option value="30days">30 Hari Terakhir</option>
                        <option value="current_month">Bulan Ini</option>
                        <option value="90days">90 Hari Terakhir</option>
                        <option value="365days">365 Hari Terakhir</option>
                        <option value="year">Tahun Ini</option>
                        <option value="all">Semua Waktu</option>
                    </select>
                </div>

                <div class="flex items-center gap-2">
                    <button @click="resetFilters" class="px-2 py-1 text-[10px] font-black uppercase text-indigo-500 hover:bg-indigo-500/10 rounded transition-colors mr-1">Semua</button>
                    <div class="flex gap-1.5">
                        <button v-for="cat in ['anime','manga','ln','vn','podcast','anki']" :key="cat"
                            @click="toggleCategory(cat)"
                            :class="categoryFilters.includes(cat) ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500'"
                            class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter transition-all">
                            {{ cat }}
                        </button>
                    </div>
                </div>

                <div v-if="categoryFilters.includes('anime')" class="flex items-center gap-1.5 bg-gray-200 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-300 dark:border-gray-700">
                    <button @click="animeWatchMode='raw'" :class="animeWatchMode==='raw'?'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm':'text-gray-500'" class="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all">Raw</button>
                    <button @click="animeWatchMode='with_sub'" :class="animeWatchMode==='with_sub'?'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm':'text-gray-500'" class="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all">Sub</button>
                    <button @click="animeWatchMode='all'" :class="animeWatchMode==='all'?'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm':'text-gray-500'" class="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all">Keduanya</button>
                </div>
            </div>
        </div>

        <div v-if="isLoading" class="flex items-center justify-center h-80">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
        </div>

        <div v-else class="space-y-10">
            
            <!-- SECTION 1B: JOURNEY TIMELINE -->
            <div class="bg-white dark:bg-gray-800 rounded-[32px] p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 relative">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h3 class="text-sm font-black uppercase tracking-widest text-gray-400">Aktivitas Harian Immersion</h3>
                        <div class="text-[10px] text-gray-400 mt-1">
                            {{ journeyData?.labels[0] }} <span class="mx-2">→</span> Hari Ini
                        </div>
                    </div>
                    <div class="flex gap-6 md:gap-8 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                        <div class="shrink-0">
                            <div class="text-2xl font-black text-indigo-500 leading-tight">{{ animTotalMins }}</div>
                            <div class="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Total Menit</div>
                        </div>
                        <div class="shrink-0">
                            <div class="text-2xl font-black text-indigo-500 leading-tight">{{ formatDuration(animTotalMins) }}</div>
                            <div class="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Total Jam</div>
                        </div>
                        <div class="shrink-0">
                            <div class="text-2xl font-black text-indigo-500 leading-tight">{{ summaryStats.avgPerDay }}</div>
                            <div class="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Rata-rata/Hari</div>
                        </div>
                        <div class="shrink-0">
                            <div class="text-2xl font-black text-indigo-500 leading-tight">{{ animStreak }}<span class="text-sm">🔥</span></div>
                            <div class="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Streak Hari</div>
                        </div>
                    </div>
                </div>
                <div class="h-[120px] relative">
                    <BaseChart v-if="journeyData" type="line" :data="journeyData" :options="journeyOptions" />
                </div>
            </div>

            <!-- ROW 1: READING SPEED (LINE AREA) -->
            <div class="bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 class="text-sm font-black uppercase tracking-widest text-gray-400 mb-8">Kecepatan Baca (Trend)</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div class="p-4 rounded-3xl bg-gray-50 dark:bg-gray-900/50">
                        <div class="text-[9px] font-black uppercase text-gray-400 mb-1">Avg Speed</div>
                        <div class="text-xl font-black">{{ readingSpeedStats.avg }} <span class="text-[10px] opacity-50">c/j</span></div>
                    </div>
                    <div class="p-4 rounded-3xl bg-gray-50 dark:bg-gray-900/50">
                        <div class="text-[9px] font-black uppercase text-gray-400 mb-1">Personal Best</div>
                        <div class="text-xl font-black text-emerald-500">{{ readingSpeedStats.pb }}</div>
                    </div>
                    <div class="p-4 rounded-3xl bg-gray-50 dark:bg-gray-900/50">
                        <div class="text-[9px] font-black uppercase text-gray-400 mb-1">Trend</div>
                        <div class="text-xl font-black" :class="readingSpeedStats.trend > 0 ? 'text-emerald-500' : (readingSpeedStats.trend < 0 ? 'text-rose-500' : 'text-gray-400')">
                            <span v-if="readingSpeedStats.trend !== 0">{{ readingSpeedStats.trend > 0 ? '↑' : '↓' }}{{ Math.abs(readingSpeedStats.trend) }}%</span>
                            <span v-else>—</span>
                        </div>
                    </div>
                </div>

                <div class="h-[300px]">
                    <BaseChart v-if="readingSpeedData" type="line" :data="readingSpeedData" :options="readingSpeedOptions" />
                    <div v-else class="h-full flex items-center justify-center text-gray-400 text-sm">Belum ada data kecepatan baca</div>
                </div>
            </div>

            <!-- ROW 2: 3x2 INSIGHT GRID REFINED -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                <!-- LEFT & MIDDLE: Insight Boxes -->
                <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    
                    <!-- BOX 1: ANIME RAW vs SUB (DONUT) -->
                    <div class="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400">Anime: Raw vs Sub</h3>
                            <div class="text-[10px] font-black text-indigo-500">{{ animeSummary.ratio }}% RAW</div>
                        </div>
                        <div class="flex-1 flex items-center justify-center relative mt-4">
                            <div class="relative w-44 h-44 sm:w-48 sm:h-48">
                                <BaseChart type="doughnut" :data="animeDonutData" :options="animeDonutOptions" />
                                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span class="text-2xl font-black leading-none mb-1">{{ animeSummary.raw }}</span>
                                    <span class="text-[9px] uppercase font-bold text-gray-400">Total Raw</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- BOX 2: COMPREHENSION PER CATEGORY -->
                    <div class="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                        <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Pemahaman per Kategori</h3>
                        <div class="flex-1 h-[110px] relative">
                            <BaseChart type="bar" :data="comprehensionBarData" :options="{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, interaction: { mode: 'nearest', axis: 'y', intersect: false }, scales: { x: { max: 100, display: false }, y: { ticks: { font: { size: 9, weight: 'bold' }, color: '#94a3b8' } } }, plugins: { legend: { display: false } } }" />
                        </div>
                    </div>

                    <!-- BOX 3 (SPAN 2): PERFORMANCE & CONDITION TREND -->
                    <div class="sm:col-span-2 bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400">Trend: Performa & Kondisi</h3>
                            <div class="flex gap-4">
                                <span class="text-[8px] font-bold text-indigo-500">Solid: Pemahaman</span>
                                <span class="text-[8px] font-bold text-orange-500">Dash: Fokus</span>
                                <span class="text-[8px] font-bold text-amber-500">Dot: Energi</span>
                            </div>
                        </div>
                        <div class="flex-1 h-[110px] relative">
                            <BaseChart type="line" :data="performanceTrendData" :options="{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 100, ticks: { font: { size: 8 } }, grid: { color: 'rgba(255,255,255,0.02)' } }, x: { display: false } }, plugins: { legend: { display: false } } }" />
                        </div>
                    </div>

                </div>

                <!-- RIGHT: Pola Aktivitas (7x24) -->
                <div class="lg:col-span-4 bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col min-h-[380px]">
                    <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Pola Jam Immersion</h3>
                    <div class="flex-1 w-full flex items-center justify-center">
                        <SvgActivityHeatmap :data="filteredLogs" />
                    </div>
                </div>

            </div>

            <!-- ROW 3: RADAR & CATEGORY CARDS -->
            <div class="flex flex-col xl:flex-row gap-6">
                <div class="xl:w-1/3 bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center">
                    <h3 class="text-sm font-black uppercase tracking-widest text-gray-400 mb-8 self-start">Keseimbangan Skill</h3>
                    <div class="w-full aspect-square max-w-[280px]">
                        <BaseChart type="radar" :data="radarChartData" :options="{ scales: { r: { ticks: { display: false } } } }" />
                    </div>
                </div>
                <div class="xl:w-2/3 grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="cat in ['anime','manga','ln','vn','podcast','anki']" :key="cat" class="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-center">
                        <div class="flex items-center gap-2 mb-2">
                            <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: CATEGORY_COLORS[cat].border }"></div>
                            <div class="text-[9px] font-black uppercase text-gray-400">{{ cat }}</div>
                        </div>
                        <div class="text-lg font-black text-gray-900 dark:text-white leading-none">
                            {{ formatDuration(filteredLogs.filter(l => l.type === cat).reduce((s,l) => s+l.durationMinutes, 0)) }}
                        </div>
                        <div class="text-[10px] font-bold text-gray-400 mt-1">
                            {{ summaryStats.totalMins > 0 ? Math.round((filteredLogs.filter(l => l.type === cat).reduce((s,l) => s+l.durationMinutes,0) / summaryStats.totalMins) * 100) : 0 }}% dari total
                        </div>
                    </div>
                </div>
            </div>

            <!-- ROW 4: CALENDAR HEATMAPS -->
            <div class="space-y-6">
                <SvgCalendarHeatmap :data="yearlyHeatmapData" :year="new Date().getFullYear()" />
                
                <div class="bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">% Hari Aktif per Bulan</h3>
                    <div class="h-[250px]">
                        <BaseChart type="bar" :data="monthlyConsistencyData" :options="{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { max: 100, ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: false } } }" />
                    </div>
                </div>
            </div>

            <!-- ROW 5: TREND JAM IMMERSION -->
            <div class="bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <h3 class="text-sm font-black uppercase tracking-widest text-gray-400">Trend Jam Immersion</h3>
                    <div class="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                        <button @click="granularity='daily'" :class="granularity==='daily'?'bg-white dark:bg-gray-800 shadow-sm text-indigo-500':'text-gray-400'" class="px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase">Harian</button>
                        <button @click="granularity='weekly'" :class="granularity==='weekly'?'bg-white dark:bg-gray-800 shadow-sm text-indigo-500':'text-gray-400'" class="px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase">Mingguan</button>
                        <button @click="granularity='monthly'" :class="granularity==='monthly'?'bg-white dark:bg-gray-800 shadow-sm text-indigo-500':'text-gray-400'" class="px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase">Bulanan</button>
                    </div>
                </div>
                <div class="h-[400px]">
                    <BaseChart type="line" :data="trendChartData" :options="trendChartOptions" />
                </div>
            </div>

            <!-- ROW 6: COMPARISON -->
            <div class="bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 class="text-sm font-black uppercase tracking-widest text-gray-400 mb-8">Perbandingan dengan Periode Lalu</h3>
                <div class="h-[300px]">
                    <BaseChart type="bar" :data="comparisonChartData" :options="{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'group' } }" />
                </div>
            </div>

            <!-- SECTION 8: PER-MEDIA TABLE -->
            <div class="bg-white dark:bg-gray-800 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div class="p-8 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 class="text-sm font-black uppercase tracking-widest text-gray-400">Statistik per Media</h3>
                    <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <!-- FIX 9: Sort selector yang sebelumnya tidak berfungsi -->
                        <select v-model="mediaSortKey" class="bg-gray-100 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500 outline-none">
                            <option value="time">Urutkan: Total Waktu</option>
                            <option value="sessions">Urutkan: Jumlah Sesi</option>
                            <option value="speed">Urutkan: Kecepatan Baca</option>
                            <option value="recent">Urutkan: Terbaru</option>
                        </select>
                        <div class="relative w-full sm:w-64">
                            <input v-model="mediaSearch" placeholder="Cari judul..." class="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 ring-indigo-500 outline-none">
                        </div>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                            <tr>
                                <th class="px-8 py-4">Media</th>
                                <th class="px-4 py-4">Tipe</th>
                                <th class="px-4 py-4">Total Waktu</th>
                                <th class="px-4 py-4">Sesi</th>
                                <th class="px-4 py-4">Reading Speed</th>
                                <th class="px-4 py-4">Last Active</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            <tr v-for="media in perMediaStats" :key="media.id" @click="openDrillDown(media)" class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group">
                                <td class="px-8 py-4">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                                            <img :src="media.coverUrl" class="w-full h-full object-cover">
                                        </div>
                                        <div>
                                            <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-500 transition-colors">{{ media.title_romaji || media.title }}</div>
                                            <div class="text-[10px] text-gray-400 font-medium">{{ media.title_jp || media.title }}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-4">
                                    <span class="px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase">{{ media.type }}</span>
                                </td>
                                <td class="px-4 py-4 font-mono text-sm">{{ formatDuration(media.totalMins) }}</td>
                                <td class="px-4 py-4 text-sm">{{ media.sessionCount }}</td>
                                <td class="px-4 py-4 text-sm">
                                    <span v-if="media.avgSpeed > 0" class="text-emerald-500 font-bold">{{ media.avgSpeed.toLocaleString() }} <span class="text-[9px] opacity-60">char/j</span></span>
                                    <span v-else class="text-gray-300">-</span>
                                </td>
                                <td class="px-4 py-4 text-xs text-gray-500">{{ media.lastSession || '-' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        <!-- DRILL DOWN MODAL -->
        <teleport to="body">
            <transition name="fade">
                <div v-if="selectedMedia" class="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="selectedMedia = null"></div>
                    <div class="relative z-10 w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto custom-scrollbar animate-scale-in">
                        <div class="flex justify-between items-start mb-6">
                            <div class="flex items-center gap-5">
                                <div class="w-20 h-28 rounded-2xl shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-800 shrink-0">
                                    <img :src="selectedMedia.coverUrl" class="w-full h-full object-cover">
                                </div>
                                <div>
                                    <h2 class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2 leading-tight">{{ selectedMedia.title_romaji || selectedMedia.title }}</h2>
                                    <div class="flex flex-wrap gap-2">
                                        <span class="px-2.5 py-1 rounded-full bg-indigo-500 text-white text-[9px] font-black uppercase">{{ selectedMedia.type }}</span>
                                        <span class="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-[9px] font-black uppercase">{{ formatDuration(selectedMedia.totalMins) }} TOTAL</span>
                                    </div>
                                </div>
                            </div>
                            <button @click="selectedMedia = null" class="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
                            <div class="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-3xl border border-gray-100 dark:border-gray-800">
                                <h4 class="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-4">Total per Hari</h4>
                                <div class="h-[160px] relative">
                                    <BaseChart v-if="selectedMediaBarData" type="bar" :data="selectedMediaBarData" :options="{ responsive: true, maintainAspectRatio: false }" />
                                </div>
                            </div>
                            <div v-if="selectedMedia.avgSpeed > 0" class="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-3xl border border-gray-100 dark:border-gray-800">
                                <h4 class="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-4">Kecepatan Baca</h4>
                                <div class="h-[160px] relative">
                                    <BaseChart v-if="selectedMediaLineData" type="line" :data="selectedMediaLineData" :options="{ responsive: true, maintainAspectRatio: false }" />
                                </div>
                            </div>
                        </div>

                        <div class="space-y-3">
                            <h4 class="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Riwayat Sesi Terakhir</h4>
                            <div class="space-y-2">
                                <div v-for="log in selectedMediaRecentLogs" :key="log.id" class="flex flex-wrap justify-between items-center p-3 sm:p-4 bg-gray-50 dark:bg-gray-800/30 rounded-2xl gap-3">
                                    <div class="flex items-center gap-3">
                                        <div class="text-[10px] sm:text-[11px] font-bold text-gray-400">{{ log.date }}</div>
                                        <div v-if="selectedMedia.type === 'anime'" class="text-xs font-bold px-2 py-0.5 rounded-md" :class="log.watchMode === 'raw' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'">
                                            {{ log.watchMode === 'raw' ? 'RAW' : 'SUB' }}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-4 sm:gap-6">
                                        <div v-if="log.chars" class="text-[11px] sm:text-xs text-emerald-500 font-bold">{{ Number(log.chars).toLocaleString() }} <span class="opacity-50">char</span></div>
                                        <div class="text-sm font-black text-indigo-500">{{ formatDuration(log.durationMinutes) }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </transition>
        </teleport>

    </div>
  `
});