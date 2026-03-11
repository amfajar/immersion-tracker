import { defineComponent } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export default defineComponent({
    name: 'Toast',
    props: {
        message: String,
        type: {
            type: String,
            default: 'success'
        }
    },
    setup() {
        return {};
    },
    template: `
    <div :class="[
      'px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-3 transition-all duration-300 pointer-events-auto',
      type === 'success' ? 'bg-indigo-600 dark:bg-indigo-500' : type === 'error' ? 'bg-red-500' : 'bg-gray-800 dark:bg-gray-700'
    ]">
      <div class="flex-shrink-0">
          <svg v-if="type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          <svg v-else-if="type === 'error'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </div>
      <div>{{ message }}</div>
    </div>
  `
});
