import { defineComponent, ref, onMounted, onUnmounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export default defineComponent({
    name: 'BaseChart',
    props: {
        type: { type: String, required: true },
        data: { type: Object, required: true },
        options: { type: Object, default: () => ({}) }
    },
    setup(props, { emit }) {
        const canvasRef = ref(null);
        let chartInstance = null;

        const getChartDefaults = (isDark) => {
            return {
                color: isDark ? '#9ca3af' : '#6b7280',
                borderColor: isDark ? '#374151' : '#f3f4f6',
                font: { family: "'Inter', sans-serif", size: 12 },
                plugins: {
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                        titleColor: isDark ? '#f3f4f6' : '#111827',
                        bodyColor: isDark ? '#d1d5db' : '#374151',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                        titleFont: { size: 13, family: 'Inter', weight: 'bold' },
                        bodyFont: { size: 12, family: 'Inter' }
                    },
                    legend: {
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { family: 'Inter', weight: '600', size: 11 },
                            color: isDark ? '#9ca3af' : '#6b7280'
                        }
                    }
                }
            };
        };

        const renderChart = () => {
            if (chartInstance) {
                chartInstance.destroy();
            }

            const isDark = document.documentElement.classList.contains('dark');
            const defaults = getChartDefaults(isDark);

            // Assign defaults
            Chart.defaults.color = defaults.color;
            Chart.defaults.borderColor = defaults.borderColor;
            Chart.defaults.font = defaults.font;

            if (canvasRef.value) {
                const config = {
                    type: props.type,
                    data: props.data,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: {
                            duration: 1000,
                            easing: 'easeOutQuart'
                        },
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 11, weight: '500' } }
                            },
                            y: {
                                border: { display: false },
                                grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                                ticks: { font: { size: 11 } }
                            }
                        },
                        elements: {
                            line: { tension: 0.4, borderWidth: 2.5, capStyle: 'round' },
                            point: { radius: 0, hitRadius: 12, hoverRadius: 6, hoverBorderWidth: 2 },
                            bar: { borderRadius: 6, borderSkipped: false }
                        },
                        ...props.options,
                        plugins: {
                            ...defaults.plugins,
                            ...(props.options.plugins || {})
                        }
                    }
                };

                chartInstance = new Chart(canvasRef.value, config);
            }
        };

        onMounted(() => {
            renderChart();
            const observer = new MutationObserver(() => renderChart());
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

            // Clean up observer on unmount
            onUnmounted(() => observer.disconnect());
        });

        watch(() => props.data, () => renderChart(), { deep: true });
        watch(() => props.type, () => renderChart());

        onUnmounted(() => {
            if (chartInstance) {
                chartInstance.destroy();
            }
        });

        return { canvasRef };
    },
    template: `
    <div class="relative w-full h-full animate-fade-in">
      <canvas ref="canvasRef"></canvas>
    </div>
  `
});
