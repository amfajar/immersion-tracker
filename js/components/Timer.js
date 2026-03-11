import { defineComponent, ref, computed, onMounted, onUnmounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { getCurrentTimeHHMM } from '../utils.js';

export default defineComponent({
    name: 'Timer',
    emits: ['stop'],
    setup(props, { emit }) {
        const isRunning = ref(false);
        const elapsedMs = ref(0);
        const startTimestamp = ref(null);
        let intervalId = null;
        const startTimeStr = ref(null);

        // POMODORO SETTINGS
        const WORK_TIME = 25 * 60 * 1000;
        const SHORT_BREAK = 5 * 60 * 1000;
        const LONG_BREAK = 15 * 60 * 1000;

        // POMODORO STATE
        const isPomodoroMode = ref(false);
        const pomodoroPhase = ref('work'); // 'work', 'break', 'long_break'
        const focusCount = ref(0); // tracks how many focus sessions completed
        const phaseStartTime = ref(null);
        const phaseElapsedMs = ref(0);

        const loadState = () => {
            const stateStr = localStorage.getItem('timerState');
            if (stateStr) {
                try {
                    const state = JSON.parse(stateStr);
                    isRunning.value = state.isRunning;
                    elapsedMs.value = state.elapsedMs;
                    startTimestamp.value = state.startTimestamp;
                    startTimeStr.value = state.startTimeStr;

                    isPomodoroMode.value = state.isPomodoroMode || false;
                    pomodoroPhase.value = state.pomodoroPhase || 'work';
                    focusCount.value = state.focusCount || 0;
                    phaseStartTime.value = state.phaseStartTime;
                    phaseElapsedMs.value = state.phaseElapsedMs || 0;

                    if (isRunning.value) {
                        const now = Date.now();
                        if (startTimestamp.value) {
                            elapsedMs.value = now - startTimestamp.value;
                        }
                        if (phaseStartTime.value) {
                            phaseElapsedMs.value = now - phaseStartTime.value;
                        }
                    } else {
                        // Reset Pomodoro progress if reloaded while STOPPED
                        if (isPomodoroMode.value) {
                            focusCount.value = 0;
                            pomodoroPhase.value = 'work';
                            phaseElapsedMs.value = 0;
                            elapsedMs.value = 0;
                            startTimeStr.value = null;
                        }
                    }
                } catch (e) { }
            }
        };

        const saveState = () => {
            localStorage.setItem('timerState', JSON.stringify({
                isRunning: isRunning.value,
                elapsedMs: elapsedMs.value,
                startTimestamp: startTimestamp.value,
                startTimeStr: startTimeStr.value,
                isPomodoroMode: isPomodoroMode.value,
                pomodoroPhase: pomodoroPhase.value,
                focusCount: focusCount.value,
                phaseStartTime: phaseStartTime.value,
                phaseElapsedMs: phaseElapsedMs.value
            }));
        };

        const formatTime = (ms) => {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            const pad = (n) => n.toString().padStart(2, '0');
            if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
            return `${pad(m)}:${pad(s)}`;
        };

        const playNotification = () => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
                osc.start();
                osc.stop(ctx.currentTime + 1);
            } catch (e) {
                console.warn('Audio play blocked or failed', e);
            }
        };

        const getTargetDur = () => {
            if (pomodoroPhase.value === 'work') return WORK_TIME;
            if (pomodoroPhase.value === 'long_break') return LONG_BREAK;
            return SHORT_BREAK;
        };

        const tick = () => {
            if (isRunning.value) {
                const now = Date.now();
                if (startTimestamp.value) {
                    elapsedMs.value = now - startTimestamp.value;
                }
                if (phaseStartTime.value) {
                    phaseElapsedMs.value = now - phaseStartTime.value;
                }

                // Automatic Phase Switching
                if (isPomodoroMode.value) {
                    const target = getTargetDur();
                    if (phaseElapsedMs.value >= target) {
                        nextPhase();
                    }
                }
            }
        };

        const nextPhase = () => {
            playNotification();
            const now = Date.now();

            if (pomodoroPhase.value === 'work') {
                focusCount.value++;
                if (focusCount.value % 4 === 0) {
                    pomodoroPhase.value = 'long_break';
                } else {
                    pomodoroPhase.value = 'break';
                }
            } else {
                // Was break or long_break
                pomodoroPhase.value = 'work';
            }

            phaseElapsedMs.value = 0;
            if (isRunning.value) {
                phaseStartTime.value = now;
            }
            saveState();
        };

        const toggleTimer = () => {
            if (isRunning.value) {
                isRunning.value = false;
                saveState();
            } else {
                isRunning.value = true;
                const now = Date.now();
                if (!startTimeStr.value && elapsedMs.value === 0) {
                    startTimeStr.value = getCurrentTimeHHMM();
                }
                startTimestamp.value = now - elapsedMs.value;
                phaseStartTime.value = now - phaseElapsedMs.value;
                saveState();
            }
        };

        const resetPomodoro = () => {
            isRunning.value = false;
            elapsedMs.value = 0;
            startTimestamp.value = null;
            startTimeStr.value = null;
            phaseStartTime.value = null;
            phaseElapsedMs.value = 0;
            focusCount.value = 0;
            pomodoroPhase.value = 'work';
            saveState();
        };

        const stopTimer = () => {
            isRunning.value = false;
            const totalMinutes = Math.floor(elapsedMs.value / 60000);

            emit('stop', {
                minutes: Math.max(1, totalMinutes),
                startTime: startTimeStr.value || getCurrentTimeHHMM()
            });

            resetPomodoro();
        };

        const togglePomodoro = () => {
            isPomodoroMode.value = !isPomodoroMode.value;
            // When enabling, start fresh work phase
            if (isPomodoroMode.value) {
                resetPomodoro();
            }
            saveState();
        };

        onMounted(() => {
            loadState();
            intervalId = setInterval(tick, 1000);
            window.addEventListener('beforeunload', saveState);
        });

        onUnmounted(() => {
            if (intervalId) clearInterval(intervalId);
            window.removeEventListener('beforeunload', saveState);
            saveState();
        });

        const displayTime = computed(() => {
            if (!isPomodoroMode.value) return elapsedMs.value;
            const target = getTargetDur();
            return Math.max(0, target - phaseElapsedMs.value);
        });

        return {
            isRunning,
            elapsedMs,
            isPomodoroMode,
            pomodoroPhase,
            focusCount,
            displayTime,
            toggleTimer,
            stopTimer,
            resetPomodoro,
            formatTime,
            togglePomodoro,
            nextPhase
        };
    },
    template: `
    <div class="bg-indigo-900 shadow-xl rounded-[2rem] p-8 flex flex-col items-center text-white w-full relative overflow-hidden transition-all duration-500 border border-white/10 h-full" :class="isPomodoroMode && (pomodoroPhase.includes('break')) ? 'bg-emerald-900 ring-4 ring-emerald-500/20' : ''">
      <!-- Decor -->
      <div class="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500 rounded-full mix-blend-multiply filter blur-2xl opacity-50"></div>
      <div class="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-700 rounded-full mix-blend-multiply filter blur-2xl opacity-50"></div>
      
      <!-- Top Bar Header -->
      <div class="relative z-20 w-full flex items-center justify-between mb-6 h-8">
          <!-- Pomodoro Toggle -->
          <button @click="togglePomodoro" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-tighter transition-all shrink-0" :class="isPomodoroMode ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/50 scale-105' : 'bg-indigo-800/50 text-indigo-300 hover:bg-indigo-800'">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              POMODORO {{ isPomodoroMode ? 'ON' : 'OFF' }}
          </button>

          <!-- Center Label (Absolutely Centered) -->
          <div class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tracking-[0.2em] uppercase">
              <span v-if="!isPomodoroMode" class="text-indigo-300">Real-time</span>
              <span v-else :class="pomodoroPhase === 'work' ? 'text-orange-400' : 'text-emerald-400'">
                  {{ pomodoroPhase === 'work' ? 'FOKUS #' + (focusCount + 1) : (pomodoroPhase === 'long_break' ? 'LONG BREAK' : 'SHORT BREAK') }}
              </span>
          </div>

          <!-- Reset Button (Balanced Right side) -->
          <div class="flex justify-end shrink-0">
              <button v-if="isPomodoroMode && !isRunning" @click="resetPomodoro" class="flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold bg-red-500/20 hover:bg-red-500/40 text-red-100 transition-all border border-red-500/20 uppercase tracking-tighter">
                  RESET SIKLUS
              </button>
              <div v-else class="w-10"></div> <!-- Placeholder to maintain balance if needed -->
          </div>
      </div>

      <div class="relative z-10 font-mono text-6xl md:text-7xl font-light tabular-nums tracking-tighter mb-2 text-white text-center mt-4">
        {{ formatTime(displayTime) }}
      </div>
      
      <div v-if="isPomodoroMode" class="relative z-10 text-[10px] text-white/50 mb-6 font-bold uppercase tracking-[0.15em]">
          Total Session: {{ formatTime(elapsedMs) }}
      </div>
      <div v-else class="mb-6"></div>

      <div class="relative z-10 flex gap-4 w-full justify-center mt-auto">
        <button @click="toggleTimer" class="flex-1 py-3.5 px-8 rounded-xl font-bold bg-white text-indigo-900 hover:bg-gray-100 transition-colors shadow-lg flex items-center justify-center gap-2 tracking-tight">
          <svg v-if="!isRunning" class="w-5 h-5 text-indigo-700" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" fill-rule="evenodd"></path></svg>
          <svg v-else class="w-5 h-5 text-indigo-700" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
          {{ isRunning ? 'JEDA' : (elapsedMs > 0 ? 'LANJUT' : 'MULAI') }}
        </button>
        <button v-if="elapsedMs > 0" @click="stopTimer" class="py-3.5 px-8 rounded-xl font-bold bg-red-500 hover:bg-red-400 text-white transition-colors shadow-lg flex items-center justify-center tracking-tight">
          STOP
        </button>
      </div>
    </div>
  `
});
