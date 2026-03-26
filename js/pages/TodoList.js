import { defineComponent, ref, computed, onMounted, inject } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { getTodosAll, saveTodo, deleteTodo } from '../db.js';
import { getTodayDateString } from '../utils.js';

// --- Helpers ---

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Returns true if the given todo should appear on `dateStr` (YYYY-MM-DD).
 */
function isTodoActiveOnDate(todo, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun … 6=Sat

    switch (todo.repeat) {
        case 'daily':
            return true;
        case 'weekdays':
            return dow >= 1 && dow <= 5;
        case 'weekly':
            return Array.isArray(todo.repeatDays) && todo.repeatDays.includes(dow);
        case 'none':
        default:
            // one-time: show if dueDate matches, or always if no dueDate set
            if (!todo.dueDate) return true;
            return todo.dueDate === dateStr;
    }
}

const TYPE_OPTIONS = [
    { value: '', label: 'General', icon: '📋' },
    { value: 'anime', label: 'Anime', icon: '📺' },
    { value: 'manga', label: 'Manga', icon: '📖' },
    { value: 'ln', label: 'Light Novel', icon: '📚' },
    { value: 'vn', label: 'Visual Novel', icon: '🎮' },
    { value: 'podcast', label: 'Podcast', icon: '🎧' },
    { value: 'anki', label: 'Anki', icon: '📇' },
];

const TYPE_ICON_MAP = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.icon]));

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const emptyForm = () => ({
    title: '',
    note: '',
    type: '',
    repeat: 'daily',
    repeatDays: [],
    dueDate: '',
});

export default defineComponent({
    name: 'TodoList',
    setup() {
        const showToast = inject('showToast');
        const todayStr = getTodayDateString();

        const allTodos = ref([]);
        const isLoading = ref(true);
        const viewMode = ref('today'); // 'today' | 'all'

        // Modal state
        const showModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const form = ref(emptyForm());

        // Load
        const loadTodos = async () => {
            isLoading.value = true;
            allTodos.value = await getTodosAll();
            // Sort by createdAt ascending (stable order)
            allTodos.value.sort((a, b) => a.createdAt - b.createdAt);
            isLoading.value = false;
        };
        onMounted(loadTodos);

        // Today's active todos
        const todayTodos = computed(() =>
            allTodos.value.filter(t => isTodoActiveOnDate(t, todayStr))
        );

        const todayDone = computed(() =>
            todayTodos.value.filter(t => t.completions?.[todayStr]).length
        );

        const todayProgress = computed(() =>
            todayTodos.value.length === 0 ? 0 : Math.round((todayDone.value / todayTodos.value.length) * 100)
        );

        const activeTodos = computed(() => {
            const base = viewMode.value === 'today' ? todayTodos.value : allTodos.value;
            return base.filter(t => !t.completions?.[todayStr]);
        });

        const doneTodos = computed(() => {
            const base = viewMode.value === 'today' ? todayTodos.value : allTodos.value;
            return base.filter(t => t.completions?.[todayStr]);
        });

        // Strip Vue reactive proxy so IndexedDB can clone the object
        const toPlainObj = (obj) => JSON.parse(JSON.stringify(obj));

        // Check/uncheck
        const toggleDone = async (todo) => {
            try {
                const plain = toPlainObj(todo);
                const completions = { ...(plain.completions || {}) };
                if (completions[todayStr]) {
                    delete completions[todayStr];
                } else {
                    completions[todayStr] = true;
                }
                const updated = { ...plain, completions };
                await saveTodo(updated);
                const idx = allTodos.value.findIndex(t => t.id === todo.id);
                if (idx !== -1) allTodos.value.splice(idx, 1, updated);
            } catch (e) {
                console.error('toggleDone error:', e);
            }
        };

        // Modal helpers
        const openAdd = () => {
            isEditing.value = false;
            editingId.value = null;
            form.value = emptyForm();
            showModal.value = true;
        };

        const openEdit = (todo) => {
            isEditing.value = true;
            editingId.value = todo.id;
            form.value = {
                title: todo.title || '',
                note: todo.note || '',
                type: todo.type || '',
                repeat: todo.repeat || 'daily',
                repeatDays: [...(todo.repeatDays || [])],
                dueDate: todo.dueDate || '',
            };
            showModal.value = true;
        };

        const closeModal = () => { showModal.value = false; };

        const toggleRepeatDay = (dow) => {
            const idx = form.value.repeatDays.indexOf(dow);
            if (idx === -1) form.value.repeatDays.push(dow);
            else form.value.repeatDays.splice(idx, 1);
        };

        const saveForm = async () => {
            if (!form.value.title.trim()) {
                showToast?.('Judul tidak boleh kosong', 'error');
                return;
            }
            if (form.value.repeat === 'weekly' && form.value.repeatDays.length === 0) {
                showToast?.('Pilih minimal satu hari untuk pengulangan mingguan', 'error');
                return;
            }
            try {
                const now = Date.now();
                const existing = allTodos.value.find(t => t.id === editingId.value);
                const todo = {
                    id: isEditing.value ? editingId.value : generateId(),
                    title: form.value.title.trim(),
                    note: (form.value.note || '').trim(),
                    type: form.value.type,
                    repeat: form.value.repeat,
                    repeatDays: form.value.repeat === 'weekly' ? [...form.value.repeatDays].sort() : [],
                    dueDate: form.value.repeat === 'none' ? form.value.dueDate : '',
                    completions: isEditing.value ? ({ ...(existing?.completions || {}) }) : {},
                    createdAt: isEditing.value ? (existing?.createdAt || now) : now,
                };
                await saveTodo(todo);
                showModal.value = false;
                await loadTodos();
                showToast?.(isEditing.value ? 'Tugas diperbarui' : 'Tugas ditambahkan', 'success');
            } catch (e) {
                console.error('saveForm error:', e);
                showModal.value = false;
                showToast?.('Gagal menyimpan tugas: ' + e.message, 'error');
            }
        };

        const removeTodo = async (todo) => {
            if (!confirm(`Hapus tugas "${todo.title}"?`)) return;
            await deleteTodo(todo.id);
            allTodos.value = allTodos.value.filter(t => t.id !== todo.id);
            showToast('Tugas dihapus', 'success');
        };

        const repeatLabel = (todo) => {
            switch (todo.repeat) {
                case 'daily': return 'Setiap hari';
                case 'weekdays': return 'Senin–Jumat';
                case 'weekly': return 'Mingguan: ' + (todo.repeatDays || []).map(d => DAY_LABELS[d]).join(', ');
                case 'none': return todo.dueDate ? `Sekali · ${todo.dueDate}` : 'Sekali';
                default: return '';
            }
        };

        return {
            isLoading, todayStr, todayTodos, todayDone, todayProgress,
            activeTodos, doneTodos, viewMode, toPlainObj, toggleDone, removeTodo,
            showModal, isEditing, form, TYPE_OPTIONS, TYPE_ICON_MAP, DAY_LABELS,
            openAdd, openEdit, closeModal, toggleRepeatDay, saveForm, repeatLabel
        };
    },
    template: `
<div class="max-w-2xl mx-auto space-y-6 animate-fade-in pb-24">

  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">To-Do List</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ todayStr }}</p>
    </div>
    <button @click="openAdd"
      class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-colors whitespace-nowrap">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
      </svg>
      Tambah Tugas
    </button>
  </div>

  <!-- Progress Card -->
  <div v-if="todayTodos.length > 0"
    class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
    <div class="flex justify-between items-center mb-2">
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Progress Hari Ini</span>
      <span class="text-sm font-bold tabular-nums" :class="todayProgress === 100 ? 'text-green-500' : 'text-indigo-600 dark:text-indigo-400'">
        {{ todayDone }} / {{ todayTodos.length }}
      </span>
    </div>
    <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
      <div class="h-2 rounded-full transition-all duration-500"
        :class="todayProgress === 100 ? 'bg-green-500' : 'bg-indigo-500'"
        :style="{ width: todayProgress + '%' }">
      </div>
    </div>
    <p v-if="todayProgress === 100" class="text-center text-green-600 dark:text-green-400 font-semibold text-sm mt-2">
      ✅ Semua tugas hari ini selesai! Keren!
    </p>
  </div>

  <!-- View Toggle -->
  <div class="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
    <button @click="viewMode = 'today'"
      class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
      :class="viewMode === 'today' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
      Hari Ini
    </button>
    <button @click="viewMode = 'all'"
      class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
      :class="viewMode === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
      Semua Tugas
    </button>
  </div>

  <!-- Loading -->
  <div v-if="isLoading" class="flex justify-center py-12">
    <div class="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
  </div>

  <!-- Empty State -->
  <div v-else-if="activeTodos.length === 0 && doneTodos.length === 0"
    class="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-dashed border-gray-200 dark:border-gray-700">
    <div class="text-4xl mb-3">📋</div>
    <p class="text-gray-500 dark:text-gray-400 font-medium">
      {{ viewMode === 'today' ? 'Tidak ada tugas untuk hari ini.' : 'Belum ada tugas sama sekali.' }}
    </p>
    <button @click="openAdd" class="mt-4 text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline">
      + Tambah tugas pertama
    </button>
  </div>

  <!-- Todo List -->
  <div v-else class="space-y-6">
    <!-- Active Tasks -->
    <div v-if="activeTodos.length > 0" class="space-y-3">
      <div v-for="todo in activeTodos" :key="todo.id"
        class="group flex items-start gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">

        <!-- Checkbox -->
        <button @click="toggleDone(todo)"
          class="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500">
        </button>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span v-if="todo.type" class="text-lg leading-none">{{ TYPE_ICON_MAP[todo.type] }}</span>
            <span class="font-semibold text-gray-900 dark:text-white text-sm">
              {{ todo.title }}
            </span>
          </div>
          <p v-if="todo.note" class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{{ todo.note }}</p>
          <span class="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {{ repeatLabel(todo) }}
          </span>
        </div>

        <!-- Actions -->
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button @click="openEdit(todo)"
            class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button @click="removeTodo(todo)"
            class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Done Tasks -->
    <div v-if="doneTodos.length > 0">
      <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
        Selesai <span class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">{{ doneTodos.length }}</span>
      </h3>
      <div class="space-y-3">
        <div v-for="todo in doneTodos" :key="todo.id"
          class="group flex items-start gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl shadow-sm border border-transparent dark:border-transparent opacity-60 hover:opacity-100 transition-all">

          <!-- Checkbox Checked -->
          <button @click="toggleDone(todo)"
            class="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 border-green-500 bg-green-500 text-white flex items-center justify-center transition-all hover:bg-green-600 hover:border-green-600">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>
          </button>

          <!-- Content (Faded) -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap text-gray-400 dark:text-gray-500">
              <span class="font-semibold text-sm line-through">
                {{ todo.title }}
              </span>
            </div>
            <p v-if="todo.note" class="text-xs text-gray-400 dark:text-gray-600 mt-1 truncate line-through">{{ todo.note }}</p>
          </div>

          <!-- Actions -->
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button @click="openEdit(todo)"
              class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button @click="removeTodo(todo)"
              class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== Modal ===== -->
  <transition name="fade">
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" @click.self="closeModal">
      <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">

        <!-- Modal Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 class="font-bold text-gray-900 dark:text-white">
            {{ isEditing ? 'Edit Tugas' : 'Tugas Baru' }}
          </h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          <!-- Title -->
          <div>
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Judul *</label>
            <input v-model="form.title" type="text" placeholder="Cth: Nonton 1 episode anime"
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              @keyup.enter="saveForm">
          </div>

          <!-- Note -->
          <div>
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
            <input v-model="form.note" type="text" placeholder="Opsional"
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
          </div>

          <!-- Type -->
          <div>
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Tipe</label>
            <div class="grid grid-cols-4 gap-2">
              <button v-for="opt in TYPE_OPTIONS" :key="opt.value"
                @click="form.type = opt.value"
                class="flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-semibold transition-all"
                :class="form.type === opt.value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'">
                <span class="text-lg">{{ opt.icon }}</span>
                <span>{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- Repeat -->
          <div>
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Pengulangan</label>
            <div class="grid grid-cols-2 gap-2">
              <button v-for="opt in [
                  { value: 'daily', label: '🔁 Setiap Hari' },
                  { value: 'weekdays', label: '💼 Senin–Jumat' },
                  { value: 'weekly', label: '📅 Pilih Hari' },
                  { value: 'none', label: '1️⃣ Sekali' },
                ]" :key="opt.value"
                @click="form.repeat = opt.value"
                class="px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all text-left"
                :class="form.repeat === opt.value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'">
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Weekly days picker -->
          <div v-if="form.repeat === 'weekly'">
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Pilih Hari</label>
            <div class="flex gap-2 flex-wrap">
              <button v-for="(label, dow) in DAY_LABELS" :key="dow"
                @click="toggleRepeatDay(dow)"
                class="w-10 h-10 rounded-full border-2 text-xs font-bold transition-all"
                :class="form.repeatDays.includes(dow)
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-300'">
                {{ label }}
              </button>
            </div>
          </div>

          <!-- Due date for one-time -->
          <div v-if="form.repeat === 'none'">
            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Tanggal (opsional)</label>
            <input v-model="form.dueDate" type="date"
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
            <p class="text-xs text-gray-400 mt-1">Kosongkan agar selalu muncul.</p>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
          <button @click="closeModal"
            class="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
            Batal
          </button>
          <button @click="saveForm"
            class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            {{ isEditing ? 'Simpan Perubahan' : 'Tambah Tugas' }}
          </button>
        </div>

      </div>
    </div>
  </transition>

</div>
`
});
