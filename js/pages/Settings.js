import { ref, inject } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { clearAllData } from '../db.js';

export default {
    name: 'Settings',
    setup() {
        const showToast = inject('showToast');
        const isResetting = ref(false);
        const isLoadingDemo = ref(false);

        const handleResetDatabase = async () => {
            const confirmed = confirm('PERINGATAN: Seluruh data log, media, dan statistik kamu akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.\n\nApakah kamu yakin ingin melanjutkan?');

            if (!confirmed) return;

            isResetting.value = true;
            try {
                await clearAllData();
                showToast('Database berhasil di-reset!', 'success');

                // Reload after a short delay to ensure clean state
                setTimeout(() => {
                    window.location.hash = '#/dashboard';
                    window.location.reload();
                }, 1500);
            } catch (err) {
                console.error('Reset failed:', err);
                showToast('Gagal mereset database', 'error');
            } finally {
                isResetting.value = false;
            }
        };

        const handleLoadDemoData = async () => {
            isLoadingDemo.value = true;
            try {
                const { loadDummyData } = await import('../dummyData.js');
                await loadDummyData();
                showToast('Data demo berhasil dimuat!', 'success');

                setTimeout(() => {
                    window.location.hash = '#/dashboard';
                    window.location.reload();
                }, 1500);
            } catch (err) {
                console.error('Demo loading failed:', err);
                showToast('Gagal memuat data demo', 'error');
            } finally {
                isLoadingDemo.value = false;
            }
        };

        return {
            handleResetDatabase,
            handleLoadDemoData,
            isResetting,
            isLoadingDemo
        };
    },
    template: `
    <div class="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
        <div class="border-b border-gray-200 dark:border-gray-800 pb-5">
            <h2 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Settings</h2>
            <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Kelola preferensi dan data aplikasi.</p>
        </div>

        <div class="grid grid-cols-1 gap-8">
            <!-- Data Management Section -->
            <section class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-750 overflow-hidden shadow-sm">
                <div class="p-6 border-b border-gray-50 dark:border-gray-700/50">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        Manajemen Data
                    </h3>
                </div>
                
                <div class="p-8 space-y-8 divide-y divide-gray-100 dark:divide-gray-800">
                    <!-- Load Demo Data -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div class="flex-1">
                            <h4 class="font-bold text-gray-900 dark:text-white mb-1">Muat Data Demo</h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Isi database dengan data simulasi selama 180 hari terakhir. Berguna untuk mencoba visualisasi statistik dan fitur aplikasi tanpa harus menginput data sendiri.
                            </p>
                        </div>
                        <button 
                            @click="handleLoadDemoData" 
                            :disabled="isLoadingDemo || isResetting"
                            class="px-6 py-3 bg-indigo-600 dark:bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-xl transition-all shadow-sm focus:ring-4 focus:ring-indigo-500/20 whitespace-nowrap"
                        >
                            <span v-if="isLoadingDemo" class="flex items-center gap-2">
                                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                Memuat Demo...
                            </span>
                            <span v-else>Muat Data Demo</span>
                        </button>
                    </div>

                    <!-- Reset Database -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-8">
                        <div class="flex-1">
                            <h4 class="font-bold text-gray-900 dark:text-white mb-1">Reset Database</h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Hapus secara permanen semua media, log aktivitas, pencapaian, dan pengaturan. Gunakan ini jika kamu ingin menghapus semua data dan memulai dari nol.
                            </p>
                        </div>
                        <button 
                            @click="handleResetDatabase" 
                            :disabled="isResetting || isLoadingDemo"
                            class="px-6 py-3 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-xl transition-all shadow-sm focus:ring-4 focus:ring-red-500/20 whitespace-nowrap"
                        >
                            <span v-if="isResetting" class="flex items-center gap-2">
                                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                Sedang Menghapus...
                            </span>
                            <span v-else>Reset Database</span>
                        </button>
                    </div>
                </div>

                <div class="px-8 py-4 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/20">
                    <p class="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                        Tindakan Reset berbahaya dan tidak dapat dibatalkan. Pastikan kamu sudah yakin.
                    </p>
                </div>
            </section>

            <!-- App Info Section -->
            <section class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-750 overflow-hidden shadow-sm p-8 text-center">
                <div class="text-indigo-600 dark:text-indigo-400 font-bold text-xl mb-2">Immersion Tracker</div>
                <p class="text-gray-500 dark:text-gray-400 text-sm">v1.1.0 • Build for Language Learners</p>
                <div class="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-medium">
                    Made with ❤️ for the language community
                </div>
            </section>
        </div>
    </div>
    `
};
