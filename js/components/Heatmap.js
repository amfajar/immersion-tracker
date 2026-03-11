import { defineComponent, computed, ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export default defineComponent({
    name: 'Heatmap',
    props: {
        // Array of { date: 'YYYY-MM-DD', minutes: 120 }
        data: {
            type: Array,
            default: () => []
        },
        year: {
            type: Number,
            default: () => new Date().getFullYear()
        }
    },
    setup(props) {
        const WEEKS = 53;
        const DAYS = 7;

        const dataMap = computed(() => {
            const map = new Map();
            props.data.forEach(d => map.set(d.date, d));
            return map;
        });

        const grid = computed(() => {
            const yearStart = new Date(props.year, 0, 1);
            const startDate = new Date(yearStart);
            startDate.setDate(startDate.getDate() - startDate.getDay()); // Start on Sunday

            const result = [];
            const todayStr = new Date().toISOString().split('T')[0];

            for (let w = 0; w < WEEKS; w++) {
                const week = [];
                for (let d = 0; d < DAYS; d++) {
                    const currentDate = new Date(startDate);
                    currentDate.setDate(startDate.getDate() + (w * 7) + d);

                    if (currentDate.getFullYear() !== props.year) {
                        week.push({ empty: true });
                        continue;
                    }

                    const pad = n => n.toString().padStart(2, '0');
                    const dateStr = `${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())}`;

                    const record = dataMap.value.get(dateStr);
                    let intensity = 0;
                    let min = 0;

                    if (record) {
                        min = record.minutes;
                        if (min > 0 && min <= 30) intensity = 1;
                        else if (min > 30 && min <= 60) intensity = 2;
                        else if (min > 60 && min <= 120) intensity = 3;
                        else if (min > 120) intensity = 4;
                    }

                    week.push({
                        date: dateStr,
                        minutes: min,
                        intensity,
                        isToday: dateStr === todayStr,
                        label: `${dateStr}: ${Math.round(min)} menit`
                    });
                }
                result.push(week);
            }
            return result;
        });

        const activeTooltip = ref(null);
        const tooltipPos = ref({ x: 0, y: 0 });
        const containerRef = ref(null);

        const showTooltip = (cell, event) => {
            if (cell.future || !cell.date) {
                hideTooltip();
                return;
            }
            activeTooltip.value = cell.label;
            const rect = event.target.getBoundingClientRect();
            const containerRect = containerRef.value.getBoundingClientRect();

            // Position relative to container
            tooltipPos.value = {
                x: rect.left - containerRect.left + (rect.width / 2),
                y: rect.top - containerRect.top - 8
            };
        };

        const hideTooltip = () => {
            activeTooltip.value = null;
        };

        return {
            grid,
            showTooltip,
            hideTooltip,
            activeTooltip,
            tooltipPos,
            containerRef
        };
    },
    template: `
    <div class="relative w-full pb-2" ref="containerRef" @mouseleave="hideTooltip">
      <div class="grid grid-cols-[repeat(53,minmax(0,1fr))] gap-[3px] sm:gap-[4px] w-full p-1">
        <div v-for="(week, wIdx) in grid" :key="wIdx" class="flex flex-col gap-[3px] sm:gap-[4px]">
          <div 
            v-for="(cell, dIdx) in week" :key="dIdx"
            @mouseenter="showTooltip(cell, $event)"
            :class="[
              'w-full aspect-square rounded-[2px] sm:rounded-[3px] transition-all duration-300 custom-transition cursor-crosshair hover:scale-125 hover:z-20',
              cell.empty ? 'bg-transparent' : (
                cell.intensity === 0 ? 'bg-gray-100 dark:bg-gray-900/50' :
                cell.intensity === 1 ? 'bg-indigo-200 dark:bg-indigo-900/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' :
                cell.intensity === 2 ? 'bg-indigo-400 dark:bg-indigo-700 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' :
                cell.intensity === 3 ? 'bg-indigo-500 dark:bg-indigo-500 shadow-sm' :
                'bg-indigo-600 dark:bg-indigo-400 shadow-md ring-1 ring-indigo-400/30'
              ),
              cell.isToday ? 'ring-[1.5px] ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ring-indigo-500 dark:ring-indigo-300 z-10' : ''
            ]"
          ></div>
        </div>
      </div>
      
      <!-- Tooltip -->
      <transition name="fade">
          <div v-if="activeTooltip" 
               class="absolute z-50 px-2.5 py-1.5 text-[10px] font-bold tracking-tight text-white bg-gray-900 dark:bg-black rounded-lg shadow-2xl pointer-events-none whitespace-nowrap transform -translate-x-1/2 -translate-y-full flex items-center gap-2 border border-white/10 mb-2 backdrop-blur-md"
               :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
            <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
            {{ activeTooltip }}
          </div>
      </transition>
    </div>
  `
});
