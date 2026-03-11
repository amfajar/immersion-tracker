import { defineComponent, computed, ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { formatDuration } from '../utils.js';

export default defineComponent({
    name: 'MediaCard',
    props: {
        media: {
            type: Object,
            required: true
        },
        totalMinutes: {
            type: Number,
            default: 0
        },
        estimatedCompletion: {
            type: String,
            default: null
        }
    },
    emits: ['click'],
    setup(props) {
        const typeColors = {
            anime: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            manga: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            ln: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            vn: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
            podcast: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
            anki: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300'
        };

        const statusColors = {
            watching: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
            completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
            paused: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
            dropped: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            backlog: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
        };

        const typeBadges = {
            anime: 'Anime', manga: 'Manga', ln: 'Light Novel', vn: 'Visual Novel', podcast: 'Podcast', anki: 'Anki'
        };

        const statusBadges = {
            watching: 'Aktif', completed: 'Selesai', paused: 'Jeda', dropped: 'Drop', backlog: 'Backlog'
        };

        const progressPercentage = computed(() => {
            if (!props.media.totalUnits || !props.media.currentUnit) return 0;
            return Math.min(100, Math.round((props.media.currentUnit / props.media.totalUnits) * 100));
        });

        const displaySubtitle = computed(() => {
            if (props.media.titleJP && props.media.titleJP !== props.media.title) return props.media.titleJP;
            return '';
        });

        return {
            typeColors,
            statusColors,
            typeBadges,
            statusBadges,
            progressPercentage,
            formatDuration,
            displaySubtitle
        };
    },
    template: `
    <div @click="$emit('click')" class="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer border border-gray-100 dark:border-gray-750 flex flex-col h-full transform hover:-translate-y-1">
      <div class="relative h-48 sm:h-56 bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
        <img v-if="media.coverUrl" :src="media.coverUrl" :alt="media.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
            <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span class="text-sm font-medium">Brak Obrazu</span>
        </div>
        
        <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
        
        <div class="absolute top-3 right-3 flex gap-2 flex-col items-end">
            <span :class="['text-[10px] uppercase tracking-wider font-bold px-2 py-1.5 rounded-md shadow-sm border border-black/5', typeColors[media.type]]">{{ typeBadges[media.type] }}</span>
            <span :class="['text-[10px] uppercase tracking-wider font-bold px-2 py-1.5 rounded-md shadow-sm border border-black/5', statusColors[media.status]]">{{ statusBadges[media.status] }}</span>
        </div>
      </div>
      
      <div class="p-5 flex flex-col flex-1">
        <h3 class="font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug">{{ media.title }}</h3>
        <p v-if="displaySubtitle" class="text-xs text-gray-400 mt-1 line-clamp-1 block">{{ displaySubtitle }}</p>
        <p v-else class="text-xs text-transparent mt-1 line-clamp-1 block select-none">-</p>
        
        <div class="mt-auto pt-6">
            <div class="flex justify-between items-end mb-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>
                    <span class="text-gray-900 dark:text-white font-bold">{{ media.currentUnit || 0 }}</span> / {{ media.totalUnits || '?' }} 
                    <span class="text-[10px] ml-0.5 opacity-70">{{ media.type === 'anime' ? 'eps' : media.type === 'manga' ? 'ch' : (media.type === 'ln' || media.type === 'vn') ? 'chars' : 'unit' }}</span>
                </span>
                <span v-if="progressPercentage > 0" class="text-indigo-600 dark:text-indigo-400">{{ progressPercentage }}%</span>
            </div>
            <div class="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-1.5 mb-4 overflow-hidden">
              <div class="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" :style="{ width: progressPercentage + '%' }"></div>
            </div>
            
            <div class="flex justify-between items-center text-xs">
                <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-medium bg-gray-50 dark:bg-gray-800/80 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                    <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    {{ formatDuration(totalMinutes) }}
                </div>
                <div v-if="estimatedCompletion && media.status === 'watching'" class="text-indigo-600 dark:text-indigo-400 font-medium tracking-tight">
                    {{ estimatedCompletion }}
                </div>
            </div>
        </div>
      </div>
    </div>
  `
});
