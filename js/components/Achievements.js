import { defineComponent, inject, ref, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export default defineComponent({
    name: 'Achievements',
    setup() {
        const achievementState = inject('achievementState');
        const isVisible = ref(false);
        const activeAchievement = ref(null);

        watch(() => achievementState.current, (newVal) => {
            if (newVal) {
                activeAchievement.value = newVal;
                isVisible.value = true;

                // Auto hide
                setTimeout(() => {
                    isVisible.value = false;
                    // Clear state after animation
                    setTimeout(() => {
                        if (achievementState.current === newVal) {
                            achievementState.current = null;
                        }
                    }, 300);
                }, 4000);
            }
        });

        return {
            isVisible,
            activeAchievement
        };
    },
    template: `
    <transition name="slide-up">
      <div v-if="isVisible" class="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-yellow-400 dark:border-yellow-600 flex items-center max-w-sm w-full">
          <div class="bg-gradient-to-br from-yellow-400 to-yellow-600 p-4 flex items-center justify-center h-full">
            <span class="text-3xl filter drop-shadow">🏆</span>
          </div>
          <div class="p-4 flex-1">
            <p class="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-500 uppercase">Achievement Unlocked</p>
            <h3 class="text-gray-900 dark:text-white font-bold leading-tight mt-1">{{ activeAchievement?.name || 'Achievement' }}</h3>
            <p v-if="activeAchievement?.desc" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ activeAchievement.desc }}</p>
          </div>
        </div>
      </div>
    </transition>
  `
});
