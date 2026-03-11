import { defineComponent, computed, ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export default defineComponent({
  name: 'SvgActivityHeatmap',
  props: {
    data: { type: Array, required: true } // Array of logs with startTime
  },
  setup(props) {
    const cellSize = 19;
    const cellGap = 3;
    const leftPadding = 35;
    const topPadding = 18;

    const activityGrid = computed(() => {
      // grid[day][hour] = minutes
      const grid = Array.from({ length: 7 }, () => Array(24).fill(0));

      props.data.forEach(log => {
        if (!log.startTime || !log.date) return;
        const hour = parseInt(log.startTime.split(':')[0]);
        const date = new Date(log.date);
        let day = date.getDay(); // 0 is Sunday
        day = (day + 6) % 7; // Convert to 0=Monday, 6=Sunday

        if (hour >= 0 && hour < 24) {
          grid[day][hour] += log.durationMinutes;
        }
      });
      return grid;
    });

    const maxActivity = computed(() => {
      let max = 0;
      activityGrid.value.forEach(day => {
        day.forEach(val => { if (val > max) max = val; });
      });
      return max || 1;
    });

    const getIntensity = (minutes) => {
      if (minutes === 0) return 0;
      const ratio = minutes / maxActivity.value;
      if (ratio < 0.25) return 1;
      if (ratio < 0.5) return 2;
      if (ratio < 0.75) return 3;
      return 4;
    };

    const tooltip = ref({ show: false, x: 0, y: 0, day: '', hour: '', value: '' });
    const daysLabel = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    const handleMouseEnter = (dayIdx, hour, val, event) => {
      const rect = event.target.getBoundingClientRect();
      tooltip.value = {
        show: true,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        day: daysLabel[dayIdx],
        hour: `${hour.toString().padStart(2, '0')}:00`,
        value: `${Math.round(val)} menit`
      };
    };

    const handleMouseLeave = () => { tooltip.value.show = false; };

    return {
      activityGrid,
      cellSize,
      cellGap,
      leftPadding,
      topPadding,
      daysLabel,
      getIntensity,
      tooltip,
      handleMouseEnter,
      handleMouseLeave
    };
  },
  template: `
    <div class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      <div class="w-full overflow-x-auto pb-4 custom-scrollbar flex justify-center">
          <svg :width="7 * (cellSize + cellGap) + leftPadding + 20" :height="24 * (cellSize + cellGap) + topPadding + 10" class="mx-auto">
            <!-- Day Labels -->
            <g :transform="'translate(' + leftPadding + ', 15)'">
              <text v-for="(day, i) in daysLabel" :key="i"
                :x="i * (cellSize + cellGap) + cellSize/2"
                y="0"
                text-anchor="middle"
                class="text-[9px] fill-gray-400 dark:fill-gray-500 font-bold uppercase"
              >{{ day }}</text>
            </g>

            <!-- Hour Labels -->
            <g :transform="'translate(0, ' + topPadding + ')'">
              <text v-for="h in [0,3,6,9,12,15,18,21]" :key="h"
                x="28"
                :y="h * (cellSize + cellGap) + cellSize/2 + 4"
                text-anchor="end"
                class="text-[9px] fill-gray-400 dark:fill-gray-500 font-medium"
              >{{ h.toString().padStart(2, '0') }}:00</text>
            </g>

            <!-- Grid -->
            <g :transform="'translate(' + leftPadding + ', ' + topPadding + ')'">
              <g v-for="(day, dIdx) in activityGrid" :key="dIdx" :transform="'translate(' + (dIdx * (cellSize + cellGap)) + ', 0)'">
                <rect v-for="(val, hIdx) in day" :key="hIdx"
                  :y="hIdx * (cellSize + cellGap)"
                  :width="cellSize" :height="cellSize"
                  rx="3"
                  :class="[
                      'transition-colors duration-200 cursor-crosshair',
                      val === 0 ? 'fill-gray-50 dark:fill-gray-700/30' : (
                        getIntensity(val) === 1 ? 'fill-indigo-100 dark:fill-indigo-900/40' :
                        getIntensity(val) === 2 ? 'fill-indigo-300 dark:fill-indigo-700/60' :
                        getIntensity(val) === 3 ? 'fill-indigo-500 dark:fill-indigo-500' :
                        'fill-indigo-600 dark:fill-indigo-400'
                      )
                  ]"
                  @mouseenter="handleMouseEnter(dIdx, hIdx, val, $event)"
                  @mouseleave="handleMouseLeave"
                />
              </g>
            </g>
          </svg>
      </div>

      <!-- Tooltip -->
      <transition name="fade">
        <div v-if="tooltip.show" 
             class="fixed z-[100] px-3 py-2 bg-gray-900 dark:bg-black text-white text-[10px] rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col items-center border border-white/10"
             :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
          <span class="font-bold opacity-70">{{ tooltip.day }}, {{ tooltip.hour }}</span>
          <span class="text-indigo-400 font-bold text-xs mt-0.5">{{ tooltip.value }}</span>
        </div>
      </transition>
    </div>
    `
});
