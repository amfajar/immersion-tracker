import { saveLog, saveMedia, getLogsAll, getMediaAll } from './db.js';

export async function loadDummyData() {
    // Check if data already exists to avoid duplication
    const existingLogs = await getLogsAll();
    const existingMedia = await getMediaAll();
    if (existingLogs.length > 10) {
        console.log("Dummy data already loaded or real data exists. Skipping.");
        return;
    }

    console.log("Loading realistic dummy data (180 days)...");

    const mediaList = [
        { id: 101, title: "Spy x Family", title_romaji: "Spy x Family", title_jp: "スパイファミリー", type: "anime", status: "completed", totalUnits: 25, currentUnit: 25, episodeDuration: 24, coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Y949S9of49nS.jpg" },
        { id: 102, title: "Bocchi the Rock!", title_romaji: "Bocchi the Rock!", title_jp: "ぼっち・ざ・ろっく", type: "anime", status: "watching", totalUnits: 12, currentUnit: 8, episodeDuration: 24, coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-5Y8r69of69nS.jpg" },
        { id: 103, title: "Yotsuba&!", title_romaji: "Yotsuba&!", title_jp: "よつばと！", type: "manga", status: "watching", totalUnits: 150, currentUnit: 67, coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30104-pU6Sdf3JvOa1.jpg" },
        { id: 104, title: "Kuma Kuma Kuma Bear", title_romaji: "Kuma Kuma Kuma Bear", title_jp: "くまクマ熊ベアー", type: "ln", status: "watching", totalUnits: null, currentUnit: 0, coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx86623-G7I6Sdf3JvOa1.jpg" },
        { id: 105, title: "Steins;Gate", title_romaji: "Steins;Gate", title_jp: "シュタインズ・ゲート", type: "vn", status: "completed", totalUnits: null, currentUnit: 0, coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx35828-pY8fRkMvYn8k.jpg" },
        { id: 106, title: "Tobira Podcast", type: "podcast", status: "watching", totalUnits: null, currentUnit: 0 },
        { id: 107, title: "Anki Core 2k", type: "anki", status: "watching", totalUnits: 2000, currentUnit: 847 },
        { id: 108, title: "Dungeon Meshi", title_romaji: "Dungeon Meshi", title_jp: "ダンジョン飯", type: "manga", status: "watching", totalUnits: 97, currentUnit: 34, coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85539-7nBy0DMa9Xv9y.jpg" },
        { id: 109, title: "Mushishi", title_romaji: "Mushishi", title_jp: "蟲師", type: "anime", status: "completed", totalUnits: 26, currentUnit: 26, episodeDuration: 24, coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx457-3nBy0DMa9Xv9y.jpg" },
        { id: 110, title: "Makeine", title_romaji: "Makeine", title_jp: "負けインヒロインが多すぎる", type: "ln", status: "watching", totalUnits: null, currentUnit: 0, coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx163013-nBy0DMa9Xv9y.jpg" }
    ];

    for (const m of mediaList) {
        await saveMedia(m);
    }

    const logs = [];
    const now = new Date();

    for (let i = 180; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayOfWeek = date.getDay(); // 0 is Sunday
        const dateStr = date.toISOString().split('T')[0];

        // Skip 1-2 days per week randomly
        if (Math.random() < 0.15) continue;

        const sessionsCount = Math.random() < 0.3 ? 3 : 2;

        // Progress tracking for dynamic stats
        const monthRatio = (180 - i) / 180; // 0 to 1 over 6 months
        const readingSpeed = 800 + (600 * monthRatio); // 800 to 1400 chars/hour
        const rawRatio = 0.2 + (0.6 * monthRatio); // 20% to 80% raw

        for (let j = 0; j < sessionsCount; j++) {
            const hour = Math.random() < 0.7 ? (19 + Math.floor(Math.random() * 5)) % 24 : (12 + Math.floor(Math.random() * 3));
            const startTime = `${String(hour).padStart(2, '0')}:${Math.random() < 0.5 ? '00' : '30'}`;

            // Randomly select category based on requested distribution
            const roll = Math.random();
            let type, mediaId, mediaTitle, durationMinutes, chars = null, watchMode = null;

            if (roll < 0.25) { // Anime
                type = 'anime';
                const m = mediaList.find(m => m.type === 'anime' && (roll < 0.12 ? m.id === 101 : m.id === 102));
                mediaId = m.id;
                mediaTitle = m.title;
                durationMinutes = 24 * (1 + Math.floor(Math.random() * 3));
                watchMode = Math.random() < rawRatio ? 'raw' : 'with_sub';
            } else if (roll < 0.45) { // Manga
                type = 'manga';
                const m = mediaList.find(m => m.type === 'manga' && (roll < 0.35 ? m.id === 103 : m.id === 108));
                mediaId = m.id;
                mediaTitle = m.title;
                durationMinutes = 20 + Math.floor(Math.random() * 40);
            } else if (roll < 0.65) { // LN
                type = 'ln';
                const m = mediaList.find(m => m.type === 'ln' && (roll < 0.55 ? m.id === 104 : m.id === 110));
                mediaId = m.id;
                mediaTitle = m.title;
                durationMinutes = 30 + Math.floor(Math.random() * 60);
                chars = Math.round((durationMinutes / 60) * (readingSpeed + (Math.random() * 200 - 100)));
            } else if (roll < 0.75) { // VN
                type = 'vn';
                mediaId = 105;
                mediaTitle = "Steins;Gate";
                durationMinutes = 45 + Math.floor(Math.random() * 90);
                chars = Math.round((durationMinutes / 60) * (readingSpeed + (Math.random() * 200 - 100)));
            } else if (roll < 0.85) { // Podcast
                type = 'podcast';
                mediaTitle = "Tobira Podcast";
                durationMinutes = 20 + Math.floor(Math.random() * 25);
            } else { // Anki
                type = 'anki';
                mediaTitle = "Anki Core 2k";
                durationMinutes = 15 + Math.floor(Math.random() * 15);
            }

            const log = {
                date: dateStr,
                startTime,
                type,
                mediaId,
                mediaTitle,
                durationMinutes,
                chars,
                watchMode,
                isAutoGenerated: false
            };

            await saveLog(log);

            // Double log logic for with_sub anime
            if (type === 'anime' && watchMode === 'with_sub') {
                await saveLog({
                    ...log,
                    id: undefined, // Let DB generate new ID
                    watchMode: 'raw',
                    isAutoGenerated: true
                });
            }
        }
    }
    console.log("Dummy data loaded successfully.");
}
