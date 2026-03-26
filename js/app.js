import { createApp, ref, computed, provide, onMounted, reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

import Dashboard from './pages/Dashboard.js';
import Log from './pages/Log.js';
import Library from './pages/Library.js';
import Stats from './pages/Stats.js';
import Settings from './pages/Settings.js';
import TodoList from './pages/TodoList.js';
import Toast from './components/Toast.js';

import AchievementsComponent from './components/Achievements.js';
import { initDB } from './db.js';

const App = {
  components: {
    Toast,
    Achievements: AchievementsComponent,
    Dashboard,
    Log,
    Library,
    Stats,
    Settings,
    TodoList
  },
  setup() {
    const currentRoute = ref(window.location.hash || '#/dashboard');
    const dbInitialized = ref(false);

    // Global toast state
    const toasts = ref([]);
    const showToast = (message, type = 'success') => {
      const id = Date.now();
      toasts.value.push({ id, message, type });
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, 3000);
    };
    provide('showToast', showToast);

    // Global achievement state
    const achievementState = reactive({ current: null });
    const showAchievement = (achievement) => {
      achievementState.current = achievement;
      // The component will handle hiding it after delay
    };
    provide('achievementState', achievementState);
    provide('showAchievement', showAchievement);

    onMounted(async () => {
      window.addEventListener('hashchange', () => {
        currentRoute.value = window.location.hash || '#/dashboard';
      });
      try {
        await initDB();
        dbInitialized.value = true;
      } catch (err) {
        showToast('Gagal memuat database', 'error');
        console.error(err);
      }
    });

    const currentView = computed(() => {
      switch (currentRoute.value) {
        case '#/dashboard': return 'Dashboard';
        case '#/log': return 'Log';
        case '#/library': return 'Library';
        case '#/stats': return 'Stats';
        case '#/settings': return 'Settings';
        case '#/todos': return 'TodoList';
        default: return 'Dashboard';
      }
    });

    // Theme toggle
    const isDark = ref(document.documentElement.classList.contains('dark'));
    const toggleTheme = () => {
      if (isDark.value) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
        isDark.value = false;
      } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
        isDark.value = true;
      }
    };

    return {
      currentRoute,
      currentView,
      dbInitialized,
      toasts,
      isDark,
      toggleTheme,
      achievementState
    };
  },
  template: `
    <div v-if="dbInitialized" class="flex flex-col md:flex-row min-h-screen">
      <!-- Navbar/Sidebar -->
      <nav class="md:fixed md:top-0 md:left-0 md:w-64 md:h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div class="p-6 hidden md:flex items-center justify-between">
          <h1 class="text-xl font-bold text-indigo-600 dark:text-indigo-400">Immersion Tracker</h1>
        </div>
        
        <div class="flex md:flex-col fixed bottom-0 md:static w-full bg-white dark:bg-gray-900 border-t md:border-none border-gray-200 dark:border-gray-800 z-40">
          <a href="#/dashboard" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/dashboard', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/dashboard' }">
            <span class="block">Dashboard</span>
          </a>
          <a href="#/log" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/log', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/log' }">
            <span class="block">Log</span>
          </a>
          <a href="#/library" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/library', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/library' }">
            <span class="block">Library</span>
          </a>
          <a href="#/stats" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/stats', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/stats' }">
            <span class="block">Stats</span>
          </a>
          <a href="#/todos" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/todos', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/todos' }">
            <span class="block">Todos</span>
          </a>
           <a href="#/settings" class="flex-1 md:flex-none p-4 text-center md:text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" :class="{ 'text-indigo-600 dark:text-indigo-400 font-semibold border-t-2 md:border-t-0 md:border-l-4 border-indigo-600 dark:border-indigo-400': currentRoute === '#/settings', 'text-gray-500 dark:text-gray-400': currentRoute !== '#/settings' }">
            <span class="block">Settings</span>
          </a>
          
          <div class="hidden md:block absolute bottom-6 left-6">
             <button @click="toggleTheme" class="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <span v-if="isDark">☀️ Light Mode</span>
                <span v-else>🌙 Dark Mode</span>
             </button>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="flex-1 md:ml-64 p-4 md:p-8 pb-32 md:pb-8 overflow-y-auto w-full">
        <!-- Mobile Top Bar for Theme Toggle -->
        <div class="md:hidden flex justify-end mb-4">
            <button @click="toggleTheme" class="p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-500 dark:text-gray-300">
                <span v-if="isDark">☀️</span>
                <span v-else>🌙</span>
            </button>
        </div>
        
        <component :is="currentView"></component>
      </main>

      <!-- Global Overlays -->
      <div class="fixed top-4 md:top-8 right-4 md:right-8 z-50 flex flex-col gap-2 pointer-events-none">
        <transition-group name="fade">
          <Toast v-for="toast in toasts" :key="toast.id" :message="toast.message" :type="toast.type" />
        </transition-group>
      </div>
      
      <Achievements />
    </div>
    
    <div v-else class="flex items-center justify-center min-h-screen">
      <div class="animate-pulse flex flex-col items-center">
        <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="mt-4 text-gray-500 dark:text-gray-400">Memuat database...</p>
      </div>
    </div>
  `
};

createApp(App).mount('#app');
