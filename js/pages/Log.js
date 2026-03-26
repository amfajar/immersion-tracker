import { defineComponent, ref, computed, inject, onMounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import Timer from '../components/Timer.js';
import { getMediaAll, saveLog, getLogsAll, deleteLog, saveMedia, getTodosAll, saveTodo } from '../db.js';
import { convertToMinutes, getTodayDateString, getCurrentTimeHHMM, generateUUID } from '../utils.js';
import { checkAchievements } from '../gamification.js';
import { searchAniList } from '../api/anilist.js';
import { searchVNDB } from '../api/vndb.js';
import { searchGoogleBooks } from '../api/googlebooks.js';

export default defineComponent({
    name: 'Log',
    components: { Timer },
    setup() {
        const showToast = inject('showToast');
        const showAchievement = inject('showAchievement');

        // === TODO POPUP ===
        const todayStr = getTodayDateString();
        const showTodoPopup = ref(false);
        const popupTodos = ref([]); // active todos for today

        function isTodoActiveOnDate(todo, dateStr) {
            const d = new Date(dateStr + 'T00:00:00');
            const dow = d.getDay();
            switch (todo.repeat) {
                case 'daily': return true;
                case 'weekdays': return dow >= 1 && dow <= 5;
                case 'weekly': return Array.isArray(todo.repeatDays) && todo.repeatDays.includes(dow);
                case 'none':
                default:
                    if (!todo.dueDate) return true;
                    return todo.dueDate === dateStr;
            }
        }

        const toggleTodoDone = async (todo) => {
            try {
                const plain = JSON.parse(JSON.stringify(todo));
                const completions = { ...(plain.completions || {}) };
                if (completions[todayStr]) { delete completions[todayStr]; }
                else { completions[todayStr] = true; }
                const updated = { ...plain, completions };
                await saveTodo(updated);
                const idx = popupTodos.value.findIndex(t => t.id === todo.id);
                if (idx !== -1) popupTodos.value.splice(idx, 1, updated);
            } catch (e) {
                console.error('toggleTodoDone error:', e);
            }
        };

        const closeTodoPopup = () => { showTodoPopup.value = false; };

        const mediaList = ref([]);
        const recentLogs = ref([]);
        const isLoading = ref(true);

        const activeTab = ref('timer');

        const form = ref({
            type: 'anime',
            mediaId: '',
            mediaTitle: '',
            date: getTodayDateString(),
            startTime: '',

            episodes: null,
            watchMode: 'raw',
            pages: null,
            chars: null,
            minutes: null, // This will be the computed total
            durationHH: null,
            durationMM: null,
            note: '',
            purpose: 'fun',
            comprehension: 50,
            focus: 5,
            energy: 5
        });

        const isEditing = ref(false);
        const editingLogId = ref(null);
        const originalLogData = ref(null); // To calc progress diff

        const isTimerSession = ref(false);
        const showForm = ref(false);

        // API Search States
        const apiLoading = ref(false);
        const searchApiQuery = ref('');
        const searchApiResults = ref([]);
        const showDropdown = ref(false);

        const loadData = async () => {
            isLoading.value = true;
            try {
                const m = await getMediaAll();
                mediaList.value = m.filter(x => x.status === 'watching' || x.status === 'backlog');

                const logs = await getLogsAll();
                recentLogs.value = logs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
            } catch (e) {
                console.error(e);
            } finally {
                isLoading.value = false;
            }
        };

        onMounted(loadData);

        const handleTimerStop = ({ minutes, startTime }) => {
            activeTab.value = 'timer';
            isTimerSession.value = true;

            form.value.minutes = minutes;
            form.value.durationHH = Math.floor(minutes / 60);
            form.value.durationMM = minutes % 60;
            form.value.startTime = startTime;

            showForm.value = true;
        };

        const openManualForm = () => {
            activeTab.value = 'manual';
            isTimerSession.value = false;
            isEditing.value = false; // Reset edit state
            editingLogId.value = null;
            originalLogData.value = null;

            form.value.startTime = getCurrentTimeHHMM();
            form.value.date = getTodayDateString();
            form.value.mediaId = '';
            form.value.mediaTitle = '';
            form.value.type = 'anime';
            form.value.episodes = null;
            form.value.pages = null;
            form.value.chars = null;
            form.value.minutes = null;
            form.value.durationHH = null;
            form.value.durationMM = null;
            form.value.note = '';
            form.value.watchMode = 'raw';

            searchApiQuery.value = '';
            searchApiResults.value = [];

            showForm.value = true;
        };

        const closeManualForm = () => {
            showForm.value = false;
        };

        const modalTitle = computed(() => {
            if (isEditing.value) return 'Edit Log Sesi';
            if (activeTab.value === 'timer') return 'Simpan Sesi Timer';
            return 'Input Log Manual';
        });

        // Body scroll lock
        watch(showForm, (val) => {
            if (val) {
                document.body.classList.add('overflow-hidden');
            } else {
                document.body.classList.remove('overflow-hidden');
            }
        });

        const previewMinutes = computed(() => {
            let base = 0;
            if (form.value.type === 'anime' && form.value.episodes) {
                base = convertToMinutes('anime', form.value.episodes);
            } else if (isTimerSession.value) {
                base = form.value.minutes || 0;
            } else {
                const hh = form.value.durationHH || 0;
                const mm = form.value.durationMM || 0;
                base = (hh * 60) + mm;
            }

            // Double immersion time if with_sub (for total stats)
            if (form.value.type === 'anime' && form.value.watchMode === 'with_sub') {
                return base * 2;
            }
            return base;
        });

        // Search logic combining local media and API
        let searchTimeout = null;
        watch(() => searchApiQuery.value, (newQ) => {
            if (searchTimeout) clearTimeout(searchTimeout);

            // Immediate DB/local items for the current category
            const localOfCategory = mediaList.value.filter(m =>
                m.type === form.value.type && ['anime', 'manga', 'ln', 'vn'].includes(m.type)
            );

            if (!newQ) {
                // Show library items of this type as default
                searchApiResults.value = localOfCategory.map(m => ({ ...m, source: 'local' }));
                return;
            }

            if (newQ.length < 2) {
                searchApiResults.value = [];
                return;
            }

            const localMatches = localOfCategory.filter(m =>
                m.title.toLowerCase().includes(newQ.toLowerCase()) ||
                (m.titleJP && m.titleJP.toLowerCase().includes(newQ.toLowerCase()))
            ).map(m => ({ ...m, source: 'local' }));

            searchApiResults.value = localMatches;

            // Don't search API if it's podcast/anki
            if (form.value.type === 'podcast' || form.value.type === 'anki') return;

            // The actual API Search
            searchTimeout = setTimeout(async () => {
                apiLoading.value = true;
                try {
                    let apiRes = [];
                    if (form.value.type === 'vn') {
                        const res = await searchVNDB(newQ);
                        apiRes = res.map(r => ({
                            id: r.id,
                            title: r.title,
                            titleJP: r.titles?.find(t => t.lang === 'ja')?.title || '',
                            cover: r.image?.url || '',
                            totalUnits: null,
                            source: 'api'
                        }));
                    } else if (form.value.type === 'ln') {
                        const res = await searchGoogleBooks(newQ);
                        apiRes = res.map(r => ({
                            id: r.id,
                            title: r.title,
                            titleJP: r.titleJP,
                            cover: r.cover,
                            totalUnits: null,
                            source: 'api'
                        }));
                    } else {
                        const typeQuery = form.value.type === 'anime' ? 'ANIME' : 'MANGA';
                        const formatQuery = form.value.type === 'ln' ? 'NOVEL' : null;
                        const res = await searchAniList(newQ, typeQuery, formatQuery);
                        apiRes = res.map(r => ({
                            id: r.id,
                            title: r.title.romaji || r.title.english,
                            titleJP: r.title.native || '',
                            cover: r.coverImage?.medium || '',
                            totalUnits: r.episodes || r.chapters || r.volumes || (r.nextAiringEpisode ? r.nextAiringEpisode.episode - 1 : null),
                            source: 'api'
                        }));
                    }

                    // Filter out api results that are already in local matches
                    const localTitles = localMatches.map(m => m.title.toLowerCase());
                    const filteredApiRes = apiRes.filter(a => !localTitles.includes(a.title.toLowerCase()));

                    searchApiResults.value = [...localMatches, ...filteredApiRes];
                } catch (e) {
                    console.error('API search failed', e);
                } finally {
                    apiLoading.value = false;
                }
            }, 500);
        });

        const selectMediaResult = (res) => {
            if (res.source === 'local') {
                form.value.mediaId = res.id;
                form.value.mediaTitle = res.title;
            } else {
                form.value.mediaId = '';
                form.value.mediaTitle = res.title;
                // Pre-fill some info if it's from API
                form.value.tempCover = res.cover;
                form.value.tempTitleJP = res.titleJP;
                form.value.tempTotalUnits = res.totalUnits;
                form.value.anilistId = form.value.type !== 'vn' ? res.id : null;
                form.value.vndbId = form.value.type === 'vn' ? res.id : null;
            }
            searchApiQuery.value = res.title;
            showDropdown.value = false;
        };

        // Hide dropdown when clicking outside (simulated by checking blur but letting clicks register)
        const hideDropdown = () => {
            setTimeout(() => { showDropdown.value = false; }, 200);
        };

        watch(() => form.value.type, () => {
            form.value.mediaId = '';
            form.value.mediaTitle = '';
            searchApiQuery.value = '';
            searchApiResults.value = [];
        });

        const formatShortDur = (min) => {
            if (!min) return '0m';
            const h = Math.floor(min / 60);
            const m = Math.floor(min % 60);
            if (h === 0) return `${m}m`;
            return `${h}j ${m}m`;
        };

        const saveSession = async () => {
            const wasEditing = isEditing.value; // capture before it's cleared later
            const durationMin = previewMinutes.value;
            if (durationMin <= 0 && form.value.type !== 'manga') {
                showToast('Durasi/Menit wajib diisi dan lebih dari 0', 'error');
                return;
            }
            if (form.value.type === 'manga' && !form.value.pages) {
                showToast('Jumlah Chapter/Halaman wajib diisi untuk Manga', 'error');
                return;
            }
            if ((form.value.type === 'ln' || form.value.type === 'vn') && !form.value.chars) {
                showToast('Jumlah karakter wajib diisi untuk LN/VN', 'error');
                return;
            }

            if (!form.value.mediaTitle) {
                form.value.mediaTitle = searchApiQuery.value.trim() || 'Tanpa Judul';
            }

            const logA = {
                id: isEditing.value ? editingLogId.value : generateUUID(),
                mediaId: form.value.mediaId || null,
                mediaTitle: form.value.mediaTitle,
                type: form.value.type,
                date: form.value.date,
                startTime: form.value.startTime || null,

                episodes: form.value.type === 'anime' ? form.value.episodes : null,
                pages: form.value.type === 'manga' ? form.value.pages : null,
                chars: (form.value.type === 'ln' || form.value.type === 'vn') ? form.value.chars : null,
                minutes: durationMin,

                durationMinutes: durationMin,

                watchMode: form.value.type === 'anime' ? form.value.watchMode : null,
                isAutoGenerated: false,
                pairedLogId: isEditing.value ? originalLogData.value.pairedLogId : null,

                note: form.value.note,
                purpose: form.value.purpose,
                comprehension: form.value.comprehension,
                focus: form.value.focus,
                energy: form.value.energy,
                createdAt: isEditing.value ? originalLogData.value.createdAt : Date.now(),
                isTimerSession: isTimerSession.value
            };

            try {
                // Handle deletion of old pair if watchMode changed OR if editing and now it's with_sub
                if (isEditing.value && originalLogData.value.pairedLogId) {
                     // Always delete old pair when editing for simplicity
                     await deleteLog(originalLogData.value.pairedLogId);
                     logA.pairedLogId = null; 
                }

                if (form.value.type === 'anime' && form.value.watchMode === 'with_sub') {
                    const baseDur = durationMin / 2;
                    logA.minutes = baseDur;
                    logA.durationMinutes = baseDur;

                    const logB = {
                        ...logA,
                        id: generateUUID(),
                        watchMode: 'raw',
                        isAutoGenerated: true,
                        pairedLogId: logA.id
                    };
                    logA.pairedLogId = logB.id;
                    await saveLog(logB);
                }

                await saveLog(logA);

                // Helper to update progress
                const updateMediaProgress = async (mediaId, diff) => {
                    const media = await getMediaAll().then(list => list.find(m => m.id === mediaId));
                    if (media) {
                        if (media.type === 'anime') media.currentUnit = Math.max(0, (media.currentUnit || 0) + (diff.episodes || 0));
                        else if (media.type === 'manga') media.currentUnit = Math.max(0, (media.currentUnit || 0) + (diff.pages || 0));
                        else if (media.type === 'ln' || media.type === 'vn') {
                            media.totalChars = Math.max(0, (media.totalChars || 0) + (diff.chars || 0));
                            media.currentUnit = media.totalChars;
                        }
                        await saveMedia(media);
                    }
                };

                let mediaProgressAlreadyUpdated = false;

                // Auto-add to media library if it doesn't exist
                if (!form.value.mediaId && ['anime', 'manga', 'ln', 'vn'].includes(form.value.type)) {
                    const newMedia = {
                        id: generateUUID(),
                        title: form.value.mediaTitle,
                        titleJP: form.value.tempTitleJP || '',
                        type: form.value.type,
                        status: 'watching',
                        coverUrl: form.value.tempCover || '',
                        totalUnits: form.value.tempTotalUnits || null,
                        currentUnit: 0,
                        createdAt: Date.now(),
                        anilistId: form.value.anilistId || null,
                        vndbId: form.value.vndbId || null
                    };

                    if (newMedia.type === 'anime' && logA.episodes) newMedia.currentUnit = Number(logA.episodes);
                    else if (newMedia.type === 'manga' && logA.pages) newMedia.currentUnit = Number(logA.pages);
                    else if ((newMedia.type === 'ln' || newMedia.type === 'vn') && logA.chars) {
                        newMedia.totalChars = Number(logA.chars);
                        newMedia.currentUnit = newMedia.totalChars;
                    }

                    await saveMedia(newMedia);
                    logA.mediaId = newMedia.id;
                    await saveLog(logA);
                    mediaProgressAlreadyUpdated = true;
                }

                // Sync progress for existing media
                if (!mediaProgressAlreadyUpdated && logA.mediaId && ['anime', 'manga', 'ln', 'vn'].includes(logA.type)) {
                    const diff = {
                        episodes: Number(logA.episodes || 0) - Number(isEditing.value ? (originalLogData.value.episodes || 0) : 0),
                        pages: Number(logA.pages || 0) - Number(isEditing.value ? (originalLogData.value.pages || 0) : 0),
                        chars: Number(logA.chars || 0) - Number(isEditing.value ? (originalLogData.value.chars || 0) : 0)
                    };
                    await updateMediaProgress(logA.mediaId, diff);
                }

                await checkAchievements(showAchievement);

                showToast(wasEditing ? 'Log diperbarui!' : 'Sesi berhasil disimpan!', 'success');
                showForm.value = false;
                isEditing.value = false;
                loadData();

                // Show todo quick-check popup (only for new logs, not edits)
                if (!wasEditing) {
                    const allTodos = await getTodosAll();
                    const active = allTodos.filter(t => isTodoActiveOnDate(t, todayStr));
                    if (active.length > 0) {
                        popupTodos.value = active;
                        showTodoPopup.value = true;
                    }
                }

            } catch (e) {
                console.error(e);
                showToast('Gagal menyimpan sesi', 'error');
            }
        };

        const confirmDeletePair = async (log, pairedId) => {
            if (!confirm('Hapus log ini? Progress di Library juga akan berkurang otomatis.')) return;
            try {
                // 1. Revert Progress in Library
                if (log.mediaId) {
                    const media = await getMediaAll().then(list => list.find(m => m.id === log.mediaId));
                    if (media) {
                        if (media.type === 'anime' && log.episodes) media.currentUnit = Math.max(0, (media.currentUnit || 0) - Number(log.episodes));
                        else if (media.type === 'manga' && log.pages) media.currentUnit = Math.max(0, (media.currentUnit || 0) - Number(log.pages));
                        else if ((media.type === 'ln' || media.type === 'vn') && log.chars) {
                            media.totalChars = Math.max(0, (media.totalChars || 0) - Number(log.chars));
                            media.currentUnit = media.totalChars;
                        }
                        await saveMedia(media);
                    }
                }

                // 2. Delete Logs
                await deleteLog(log.id);
                if (pairedId) await deleteLog(pairedId);
                
                showToast('Log dihapus & progress dikoreksi', 'success');
                loadData();
            } catch (e) {
                console.error(e);
                showToast('Gagal hapus log', 'error');
            }
        };

        const openEditLog = (log) => {
            isEditing.value = true;
            editingLogId.value = log.id;
            originalLogData.value = { ...log };

            form.value = {
                type: log.type,
                mediaId: log.mediaId,
                mediaTitle: log.mediaTitle,
                date: log.date,
                startTime: log.startTime || '',
                episodes: log.episodes,
                watchMode: log.watchMode || 'raw',
                pages: log.pages,
                chars: log.chars,
                minutes: log.minutes,
                durationHH: Math.floor(log.durationMinutes / 60),
                durationMM: Math.round(log.durationMinutes % 60),
                note: log.note || '',
                purpose: log.purpose || 'fun',
                comprehension: log.comprehension || 50,
                focus: log.focus || 5,
                energy: log.energy || 5
            };

            searchApiQuery.value = log.mediaTitle;
            showForm.value = true;
        };

        return {
            isLoading, mediaList, recentLogs, activeTab, showForm, isTimerSession, isEditing,
            form, previewMinutes, formatShortDur, handleTimerStop, openManualForm, closeManualForm, modalTitle,
            saveSession, confirmDeletePair, openEditLog,
            apiLoading, searchApiQuery, searchApiResults, showDropdown, selectMediaResult, hideDropdown,
            showTodoPopup, popupTodos, toggleTodoDone, closeTodoPopup, todayStr,
        };
    },
    template: `
    <div class="relative">
      <div class="max-w-4xl mx-auto space-y-10 pb-12 animate-fade-in">
        <!-- Top Section -->
        <div class="flex flex-col md:flex-row gap-8 items-stretch">
            <div class="w-full md:w-1/2">
                <Timer @stop="handleTimerStop" class="h-full" />
            </div>
            
            <div class="w-full md:w-1/2">
                <div class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col items-center justify-center text-center transform hover:-translate-y-1 transition-all duration-300">
                    <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-[1.5rem] flex items-center justify-center text-indigo-500 mb-6 rotate-3">
                        <svg class="w-10 h-10 -rotate-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Input Manual</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-[250px]">Lupa menyalakan timer? Tambahkan log sesi secara manual ke riwayatmu.</p>
                    <button @click="openManualForm" class="px-8 py-3.5 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-bold tracking-tight rounded-xl transition-colors shadow-lg w-full mt-auto">
                        Tambah Log Manual
                    </button>
                </div>
            </div>
        </div>

        <!-- Recent Log History -->
        <div>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold dark:text-white flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Riwayat 30 Hari Terakhir
                </h2>
            </div>
            
            <div v-if="isLoading" class="animate-pulse space-y-3">
                <div v-for="i in 3" :key="i" class="h-20 bg-white dark:bg-gray-800 rounded-xl"></div>
            </div>
            <div v-else-if="recentLogs.length === 0" class="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-750">
                <div class="w-16 h-16 mx-auto mb-4 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-700">
                    <svg class="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <p class="text-gray-500 dark:text-gray-400 font-medium">Belum ada sesi log yang tercatat.</p>
            </div>
            <div v-else class="space-y-3">
                <div v-for="log in recentLogs" :key="log.id" v-show="!log.isAutoGenerated" class="group flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-750 transition-all">
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center shrink-0 uppercase font-bold text-gray-500 dark:text-gray-400 text-xs shadow-inner">
                         {{ log.type.slice(0,2) }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2 mb-1">
                            <h4 class="font-bold text-gray-900 dark:text-white truncate">{{ log.mediaTitle }}</h4>
                            <span class="text-[10px] text-gray-400 font-medium shrink-0 tracking-wider">{{ log.date }} {{ log.startTime || '' }}</span>
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5 flex-wrap">
                            <span class="font-semibold text-indigo-600 dark:text-indigo-400">{{ formatShortDur(log.watchMode === 'with_sub' ? log.durationMinutes * 2 : log.durationMinutes) }}</span>
                            <span class="text-gray-300 dark:text-gray-600">•</span>
                            <span v-if="log.episodes">{{ log.episodes }} Ep</span>
                            <span v-if="log.pages">{{ log.pages }} Hal</span>
                            <span v-if="log.chars">{{ log.chars }} Chr</span>
                            <span v-if="log.type === 'podcast' || log.type === 'anki'">{{ log.type }}</span>
                            
                            <span v-if="log.watchMode === 'with_sub'" class="ml-1 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-[9px] uppercase font-bold" title="Log ganda (raw & sub)">Sub</span>
                            <span v-else-if="log.watchMode === 'raw'" class="ml-1 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] uppercase font-bold">Raw</span>
                            
                            <span v-if="log.note" class="ml-2 text-gray-400 font-normal italic line-clamp-1 flex-1">"{{ log.note }}"</span>
                        </div>
                    </div>
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button @click="openEditLog(log)" class="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Edit">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button @click="confirmDeletePair(log, log.pairedLogId)" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Hapus">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <!-- Form Modal Layout -->
      <transition name="fade">
      <div v-if="showForm" class="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <!-- Backdrop with Blur -->
          <div class="absolute inset-0 bg-black/60 backdrop-blur-md" @click="closeManualForm"></div>
          
          <div class="bg-gray-50 dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl relative z-20 flex flex-col max-h-[90vh] border border-gray-200 dark:border-gray-800 animate-scale-in">
              <!-- Header -->
              <div class="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900 sticky top-0 rounded-t-2xl z-30">
                  <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      {{ modalTitle }}
                  </h2>
                  <button @click="closeManualForm" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
              </div>
              
              <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                  <div class="grid grid-cols-2 gap-4">
                      <!-- Date -->
                      <div>
                          <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
                          <input type="date" v-model="form.date" required class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow">
                      </div>
                      <!-- Start Time -->
                      <div>
                          <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Jam Mulai</label>
                          <input type="time" v-model="form.startTime" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow">
                      </div>
                  </div>
                  
                  <!-- Type (Kategori) First -->
                  <div>
                      <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Kategori</label>
                      <select v-model="form.type" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow">
                          <option value="anime">Anime</option>
                          <option value="manga">Manga</option>
                          <option value="ln">Light Novel</option>
                          <option value="vn">Visual Novel</option>
                          <option value="podcast">Podcast</option>
                          <option value="anki">Anki</option>
                      </select>
                  </div>

                  <!-- Judul Media (Autocomplete) -->
                  <div class="relative">
                       <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 flex justify-between">
                           <span>{{ (form.type === 'podcast' || form.type === 'anki') ? 'Topik / Judul Sesi' : 'Judul Media / Tokoh' }}</span>
                           <span v-if="['anime','manga','ln','vn'].includes(form.type)" class="text-[10px] text-indigo-500 font-bold">Auto-Search API</span>
                       </label>
                       <div class="relative">
                           <input type="text" v-model="searchApiQuery" @focus="showDropdown = true" @blur="hideDropdown" autocomplete="off" :placeholder="(form.type === 'podcast' || form.type === 'anki') ? 'Misal: Tataba Podcast Ep 10' : 'Ketik untuk mencari...'" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow pr-10">
                           <svg v-if="apiLoading" class="w-4 h-4 absolute right-3 top-3 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                       </div>

                      <!-- Search Results Dropdown -->
                      <div v-if="showDropdown && searchApiResults.length > 0" class="absolute mt-1 w-full bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700/50 rounded-xl max-h-48 overflow-y-auto flex flex-col shadow-xl z-50">
                          <div v-for="res in searchApiResults" :key="res.id" @mousedown.prevent="selectMediaResult(res)" class="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer flex gap-3 items-center border-b border-gray-50 dark:border-gray-800 last:border-0">
                              <img v-if="res.cover" :src="res.cover" class="w-8 h-12 object-cover rounded opacity-90" />
                              <div v-else-if="res.source === 'api'" class="w-8 h-12 bg-gray-100 dark:bg-gray-800 rounded"></div>
                              <div class="flex-1 min-w-0">
                                  <div class="text-[13px] font-bold text-gray-900 dark:text-white truncate">{{ res.title }}</div>
                                  <div class="text-[10px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                                      <span :class="res.source === 'local' ? 'text-emerald-500' : 'text-indigo-500'">{{ res.source === 'local' ? 'Library ' : 'Global API ' }}</span>
                                      <span v-if="res.totalUnits"> • {{ res.totalUnits }} {{ form.type === 'anime' ? 'eps' : 'units' }}</span>
                                      <span v-else-if="form.type === 'ln' || form.type === 'vn'"> • Character Based</span>
                                      <span v-if="res.titleJP"> • {{ res.titleJP }}</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  <!-- Dynamic Unit Input -->
                  <div class="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                      
                      <!-- For Text Content Input -->
                      <div v-if="form.type === 'ln' || form.type === 'vn'" class="mb-4">
                          <label class="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1.5 flex justify-between">
                              <span>{{ form.type === 'vn' ? 'Karakter (Sesi Ini)' : 'Jumlah Karakter Dibaca' }}</span>
                              <span class="text-red-500">*wajib</span>
                          </label>
                          <input type="number" v-model.number="form.chars" min="1" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="Misal: 12500">
                      </div>

                      <div v-if="form.type === 'anime'">
                          <label class="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1.5 flex justify-between">
                              <span>Jumlah Episode</span>
                              <span class="text-red-500">*wajib</span>
                          </label>
                          <input type="number" v-model.number="form.episodes" min="1" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-4 shadow-sm" placeholder="Misal: 2">
                          
                          <label class="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-2">Mode Menonton</label>
                          <div class="flex flex-col sm:flex-row gap-3">
                              <label class="flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors" :class="form.watchMode === 'raw' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-700 dark:bg-gray-900'">
                                  <input type="radio" v-model="form.watchMode" value="raw" class="hidden">
                                  <span class="text-sm font-medium dark:text-white">Raw (Tanpa Sub)</span>
                              </label>
                              <label class="flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors relative" :class="form.watchMode === 'with_sub' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-700 dark:bg-gray-900'">
                                  <input type="radio" v-model="form.watchMode" value="with_sub" class="hidden">
                                  <span class="text-sm font-medium dark:text-white">Dengan Sub</span>
                                  <span v-if="form.watchMode === 'with_sub'" class="absolute -top-2 -right-2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">2x Log</span>
                              </label>
                          </div>
                      </div>
                      
                      <div v-else-if="form.type === 'manga'">
                          <label class="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1.5 flex justify-between">
                              <span>Jumlah Chapter / Halaman</span>
                              <span class="text-red-500">*wajib</span>
                          </label>
                          <input type="number" v-model.number="form.pages" min="1" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="Misal: 1">
                      </div>

                      <!-- Manual Minutes override / input (FOR ALL NON-ANIME) -->
                      <div v-if="form.type !== 'anime'" :class="{'mt-4 border-t border-indigo-200 dark:border-indigo-800/50 pt-4': form.type === 'ln' || form.type === 'vn' || form.type === 'manga'}">
                          <label class="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1.5 flex justify-between">
                              <span>Waktu Sesi</span>
                              <span class="text-red-500" v-if="!isTimerSession">*wajib</span>
                          </label>
                          <div v-if="isTimerSession" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2.5 text-sm dark:text-white font-bold opacity-70">
                              {{ formatShortDur(form.minutes) }}
                          </div>
                          <div v-else class="flex gap-2">
                              <div class="flex-1">
                                  <div class="relative">
                                      <input type="number" v-model.number="form.durationHH" min="0" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg pl-3 pr-8 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="0">
                                      <span class="absolute right-3 top-3 text-[10px] font-bold text-gray-400">jam</span>
                                  </div>
                              </div>
                              <div class="flex-1">
                                  <div class="relative">
                                      <input type="number" v-model.number="form.durationMM" min="0" max="59" class="w-full bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded-lg pl-3 pr-8 py-2.5 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="0">
                                      <span class="absolute right-3 top-3 text-[10px] font-bold text-gray-400">menit</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div v-else-if="previewMinutes > 0" class="text-center py-2 mt-4">
                          <p class="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300 font-bold">Durasi Otomatis: {{ previewMinutes }} Menit</p>
                      </div>
                  </div>

                  <!-- ADVANCED FIELDS SECTION -->
                  <div class="pt-4 border-t border-gray-100 dark:border-gray-800">
                      <div class="flex items-center gap-2 mb-6">
                          <span class="text-[11px] font-black uppercase text-indigo-500 tracking-widest">Detail Sesi</span>
                          <span class="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Opsional</span>
                          <div class="h-px bg-gray-100 dark:bg-gray-800 flex-1"></div>
                      </div>

                      <div class="space-y-6">
                          <!-- Tujuan (Purpose) -->
                          <div>
                              <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 whitespace-nowrap">Tujuan</label>
                          <div class="flex flex-wrap gap-2">
                              <button v-for="p in [{id:'fun', lab:'🥳 Fun'}, {id:'study', lab:'📚 Study'}, {id:'mining', lab:'⛏️ Mining'}, {id:'review', lab:'🔄 Review'}]"
                                  :key="p.id" @click="form.purpose = p.id"
                                  :class="form.purpose === p.id ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'"
                                  class="px-4 py-2 rounded-xl text-xs font-bold border transition-all">
                                  {{ p.lab }}
                              </button>
                          </div>
                      </div>

                      <!-- Comprehension Slider -->
                      <div>
                          <div class="flex justify-between items-center mb-2">
                              <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Comprehension</label>
                              <span class="text-indigo-500 font-black text-lg">{{ form.comprehension }}</span>
                          </div>
                          <input type="range" v-model.number="form.comprehension" min="0" max="100" class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500">
                          <div class="flex justify-between mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                              <span>Tidak mengerti</span>
                              <span class="text-indigo-400">Sedang</span>
                              <span>Paham penuh</span>
                          </div>
                      </div>

                      <!-- Focus & Energy -->
                      <div class="grid grid-cols-2 gap-8">
                          <div>
                              <div class="flex justify-between items-center mb-3">
                                  <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Fokus</label>
                              </div>
                              <div class="flex gap-2">
                                  <button v-for="i in 5" :key="i" @click="form.focus = i" class="transition-transform active:scale-90">
                                      <svg class="w-6 h-6" :class="i <= form.focus ? 'text-orange-500 fill-orange-500' : 'text-gray-300 dark:text-gray-600'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                  </button>
                              </div>
                              <div class="mt-2 text-[9px] font-bold text-gray-400 uppercase">1 terganggu • 5 penuh</div>
                          </div>
                          <div>
                              <div class="flex justify-between items-center mb-3">
                                  <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Energi</label>
                              </div>
                              <div class="flex gap-2">
                                  <button v-for="i in 5" :key="i" @click="form.energy = i" class="transition-transform active:scale-90">
                                      <svg class="w-6 h-6" :class="i <= form.energy ? 'text-emerald-500 fill-emerald-500' : 'text-gray-300 dark:text-gray-600'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><path d="M22 11v2"/></svg>
                                  </button>
                              </div>
                              <div class="mt-2 text-[9px] font-bold text-gray-400 uppercase">1 lelah • 5 berenergi</div>
                          </div>
                      </div>

                      <!-- Enhanced Note -->
                      <div>
                          <div class="flex justify-between items-center mb-2">
                              <label class="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Catatan</label>
                              <span class="text-[10px] font-bold" :class="form.note.length > 450 ? 'text-rose-500' : 'text-gray-400'">{{ form.note.length }} / 500</span>
                          </div>
                          <textarea v-model="form.note" maxlength="500" rows="3" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" placeholder="Catatan sesi ini..."></textarea>
                      </div>
                  </div>
              </div>
              </div>
              
              <div class="px-6 py-5 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
                  <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                          {{ form.watchMode === 'with_sub' && form.type === 'anime' ? 'Total (Sub + Raw)' : 'Total Durasi' }}
                      </span>
                      <span class="font-bold text-indigo-600 dark:text-indigo-400 text-xl">{{ formatShortDur(previewMinutes) }}</span>
                  </div>
                  <button @click="saveSession" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-none" :disabled="previewMinutes <= 0">
                      Simpan Log
                  </button>
              </div>
          </div>
      </div>
      </transition>

      <!-- ===== Todo Quick-Check Popup ===== -->
      <transition name="slide-up">
        <div v-if="showTodoPopup" class="fixed inset-x-0 bottom-0 z-[200] flex justify-center px-4 pb-4 md:items-center md:inset-0">
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeTodoPopup"></div>
          <div class="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 animate-scale-in overflow-hidden">

            <!-- Header -->
            <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 class="font-bold text-gray-900 dark:text-white text-sm">Centang tugas yang selesai?</h3>
                <p class="text-xs text-gray-400 mt-0.5">Tugas aktif hari ini</p>
              </div>
              <button @click="closeTodoPopup" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Todo list -->
            <div class="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
              <button v-for="todo in popupTodos" :key="todo.id"
                @click="toggleTodoDone(todo)"
                class="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                :class="todo.completions?.[todayStr]
                  ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'">
                <!-- Circle check -->
                <span class="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                  :class="todo.completions?.[todayStr]
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 dark:border-gray-600'">
                  <svg v-if="todo.completions?.[todayStr]" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                  </svg>
                </span>
                <span class="flex-1 text-sm font-semibold"
                  :class="todo.completions?.[todayStr] ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'">
                  {{ todo.title }}
                </span>
              </button>
            </div>

            <!-- Footer -->
            <div class="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <span class="text-xs text-gray-400">
                {{ popupTodos.filter(t => t.completions?.[todayStr]).length }} / {{ popupTodos.length }} selesai
              </span>
              <button @click="closeTodoPopup"
                class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors">
                Selesai
              </button>
            </div>
          </div>
        </div>
      </transition>

    </div>
  `
});
