export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Convert different immersion units into duration (minutes)
 * @param {string} type - anime, manga, ln, vn, podcast, anki
 * @param {number} rawValue - number of episodes, pages, chars, minutes
 * @param {Object} options - { episodeDuration: 24, readingSpeedMultiplier: 1 } etc.
 */
export function convertToMinutes(type, rawValue, options = {}) {
  const num = Number(rawValue);
  if (isNaN(num) || num <= 0) return 0;

  let minutes = 0;
  switch (type) {
    case 'anime':
      const epDur = options.episodeDuration || 24;
      minutes = num * epDur;
      break;
    case 'manga':
      // default 1.5 min per page
      minutes = num * (options.mangaPageSpeed || 1.5);
      break;
    case 'ln':
      // default 350 chars per minute
      minutes = num / (options.lnSpeed || 350);
      break;
    case 'vn':
      // default 400 chars per minute
      minutes = num / (options.vnSpeed || 400);
      break;
    case 'podcast':
    case 'anki':
      minutes = num;
      break;
    default:
      minutes = num;
  }
  return Math.round(minutes * 10) / 10;
}

export function convertToHours(minutes) {
  if (!minutes) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  minutes = Math.round(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}

export function formatChars(chars) {
  if (!chars && chars !== 0) return "0";
  return new Intl.NumberFormat('id-ID').format(chars);
}

export function calcReadingSpeed(chars, minutes) {
  if (!chars || !minutes || minutes <= 0) return 0;
  return Math.round((chars / minutes) * 60); // chars per hour
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Convert YYYY-MM-DD to basic object { y, m, d }
export function parseDate(dateStr) {
  if (!dateStr) return new Date();
  return new Date(dateStr);
}

// Generate simple string YYYY-MM-DD
export function getTodayDateString() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getCurrentTimeHHMM() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function estimateCompletion(media, recentLogs) {
  if (!media.totalUnits || !media.currentUnit) return null;
  const remaining = media.totalUnits - media.currentUnit;
  if (remaining <= 0) return "Selesai";

  if (!recentLogs || recentLogs.length === 0) return "Tidak ada data 7 hari terakhir";

  const activeDates = new Set();
  let totalLogsContent = 0;

  for (const log of recentLogs) {
    let unitDone = 0;
    if (media.type === 'anime') unitDone = log.episodes;
    else if (media.type === 'manga') unitDone = log.pages;
    else if (media.type === 'ln' || media.type === 'vn') unitDone = log.chars;
    else unitDone = log.minutes;

    if (unitDone) {
      totalLogsContent += unitDone;
      activeDates.add(log.date);
    }
  }

  if (activeDates.size === 0 || totalLogsContent === 0) return "Tidak ada progress 7 hari terakhir";

  const avgUnitPerActiveDay = totalLogsContent / activeDates.size;
  if (avgUnitPerActiveDay <= 0) return null;

  const daysNeeded = Math.ceil(remaining / avgUnitPerActiveDay);

  if (daysNeeded === 1) return "~1 hari aktif lagi";
  if (daysNeeded > 30) {
    const weeks = Math.round(daysNeeded / 7);
    return `~${weeks} minggu aktif lagi`;
  }
  return `~${daysNeeded} hari aktif lagi`;
}

export const CATEGORY_COLORS = {
  anime: { border: '#6366f1', bg: 'rgba(99,  102, 241, 0.7)' },  // indigo
  manga: { border: '#f59e0b', bg: 'rgba(245, 158,  11, 0.7)' },  // amber
  ln: { border: '#10b981', bg: 'rgba( 16, 185, 129, 0.7)' },  // emerald
  vn: { border: '#ec4899', bg: 'rgba(236,  72, 153, 0.7)' },  // pink
  podcast: { border: '#f97316', bg: 'rgba(249, 115,  22, 0.7)' },  // orange
  anki: { border: '#8b5cf6', bg: 'rgba(139,  92, 246, 0.7)' },  // violet
};

export function formatDurationHMM(minutes) {
  if (!minutes || minutes <= 0) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}
