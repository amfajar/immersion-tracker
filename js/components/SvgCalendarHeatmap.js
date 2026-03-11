import { defineComponent, computed, ref, onMounted, onUnmounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { formatDate } from '../utils.js';

export default defineComponent({
    name: 'SvgCalendarHeatmap',
    props: {
        data: { type: Array, required: true }, // Array of { date: 'YYYY-MM-DD', minutes: number }
        year: { type: Number, default: () => new Date().getFullYear() }
    },
    setup(props, { emit }) {
        const cellSize = 11;
        const cellGap = 2;
        const labelOffset = 20;

        const dataMap = computed(() => {
            const map = new Map();
            props.data.forEach(d => map.set(d.date, d.minutes));
            return map;
        });

        const getIntensity = (minutes) => {
            if (minutes <= 0) return 0;
            if (minutes <= 30) return 1;
            if (minutes <= 60) return 2;
            if (minutes <= 120) return 3;
            return 4;
        };

        const weeks = computed(() => {
            const yearStart = new Date(props.year, 0, 1);
            // Start from the Sunday of the week containing Jan 1st
            const startDate = new Date(yearStart);
            startDate.setDate(startDate.getDate() - startDate.getDay());

            const res = [];
            const todayStr = new Date().toISOString().split('T')[0];

            for (let w = 0; w < 53; w++) {
                const days = [];
                for (let d = 0; d < 7; d++) {
                    const current = new Date(startDate);
                    current.setDate(startDate.getDate() + (w * 7) + d);

                    if (current.getFullYear() !== props.year) {
                        days.push({ empty: true });
                        continue;
                    }

                    const dateStr = current.toISOString().split('T')[0];
                    const mins = dataMap.value.get(dateStr) || 0;

                    days.push({
                        date: dateStr,
                        minutes: mins,
                        intensity: getIntensity(mins),
                        isToday: dateStr === todayStr
                    });
                }
                res.push(days);
            }
            return res;
        });

        // Tooltip logic
        const tooltip = ref({ show: false, x: 0, y: 0, text: '', date: '' });
        const handleMouseEnter = (day, event) => {
            if (day.empty) return;
            const rect = event.target.getBoundingClientRect();
            tooltip.value = {
                show: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                text: `${Math.round(day.minutes)} menit`,
                date: formatDate(day.date)
            };
        };

        const handleMouseLeave = () => {
            tooltip.value.show = false;
        };

        const handleCellClick = (day) => {
            if (day.empty) return;
            emit('cell-click', day);
        };

        return {
            weeks,
            cellSize,
            cellGap,
            labelOffset,
            tooltip,
            handleMouseEnter,
            handleMouseLeave,
            handleCellClick
        };
    },
    template: `
    <div class="relative w-full overflow-hidden p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xs font-bold uppercase tracking-widest text-gray-400">Heatmap Konsistensi {{ year }}</h3>
        <div class="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
          <span>Kurang</span>
          <div class="flex gap-1">
            <div class="w-2.5 h-2.5 rounded-[2px] bg-gray-100 dark:bg-gray-700"></div>
            <div class="w-2.5 h-2.5 rounded-[2px] bg-indigo-200 dark:bg-indigo-900/60"></div>
            <div class="w-2.5 h-2.5 rounded-[2px] bg-indigo-400 dark:bg-indigo-700/80"></div>
            <div class="w-2.5 h-2.5 rounded-[2px] bg-indigo-500 dark:bg-indigo-500"></div>
            <div class="w-2.5 h-2.5 rounded-[2px] bg-indigo-600 dark:bg-indigo-400"></div>
          </div>
          <span>Banyak</span>
        </div>
      </div>

      <div class="overflow-x-auto pb-2 custom-scrollbar">
        <svg :width="53 * (cellSize + cellGap) + labelOffset" :height="7 * (cellSize + cellGap) + 20" class="mx-auto">
          <!-- Month labels (approximate) -->
          <g transform="translate(20, 12)">
            <text v-for="m in 12" :key="m" :x="(m-1) * 4.3 * (cellSize + cellGap)" y="0" class="text-[9px] fill-gray-400 dark:fill-gray-500 font-medium">
                {{ ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m-1] }}
            </text>
          </g>

          <!-- Day labels -->
          <g transform="translate(0, 25)">
            <text x="0" :y="0 * (cellSize + cellGap) + 8" class="text-[8px] fill-gray-400 dark:fill-gray-500 font-bold">S</text>
            <text x="0" :y="2 * (cellSize + cellGap) + 8" class="text-[8px] fill-gray-400 dark:fill-gray-500 font-bold">R</text>
            <text x="0" :y="4 * (cellSize + cellGap) + 8" class="text-[8px] fill-gray-400 dark:fill-gray-500 font-bold">J</text>
            <text x="0" :y="6 * (cellSize + cellGap) + 8" class="text-[8px] fill-gray-400 dark:fill-gray-500 font-bold">M</text>
          </g>

          <g transform="translate(20, 22)">
            <g v-for="(week, wIdx) in weeks" :key="wIdx" :transform="'translate(' + (wIdx * (cellSize + cellGap)) + ', 0)'">
              <rect 
                v-for="(day, dIdx) in week" :key="dIdx"
                :y="dIdx * (cellSize + cellGap)"
                :width="cellSize" :height="cellSize"
                rx="2"
                :class="[
                    'transition-all duration-300 cursor-pointer hover:stroke-indigo-500 hover:stroke-2',
                    day.empty ? 'fill-transparent' : (
                        day.intensity === 0 ? 'fill-gray-100 dark:fill-gray-700/50' :
                        day.intensity === 1 ? 'fill-indigo-200 dark:fill-indigo-900/60' :
                        day.intensity === 2 ? 'fill-indigo-400 dark:fill-indigo-700/80' :
                        day.intensity === 3 ? 'fill-indigo-500 dark:fill-indigo-500' :
                        'fill-indigo-600 dark:fill-indigo-400'
                    )
                ]"
                :style="{ animationDelay: (wIdx * 7 + dIdx) * 5 + 'ms' }"
                @mouseenter="handleMouseEnter(day, $event)"
                @mouseleave="handleMouseLeave"
                @click="handleCellClick(day)"
              />
            </g>
          </g>
        </svg>
      </div>

      <!-- Portal-like Tooltip -->
      <transition name="fade">
        <div v-if="tooltip.show" 
             class="fixed z-[100] px-3 py-2 bg-gray-900 dark:bg-black text-white text-[11px] rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 border border-white/10"
             :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
          <span class="font-bold">{{ tooltip.date }}</span>
          <span class="text-indigo-400">{{ tooltip.text }}</span>
        </div>
      </transition>
    </div>
    `
});
