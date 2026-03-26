const DB_NAME = 'ImmersionTrackerDB';
const DB_VERSION = 2;

let dbInstance = null;

export async function initDB() {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('media')) {
                const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
                mediaStore.createIndex('type', 'type', { unique: false });
                mediaStore.createIndex('status', 'status', { unique: false });
            }

            if (!db.objectStoreNames.contains('logs')) {
                const logsStore = db.createObjectStore('logs', { keyPath: 'id' });
                logsStore.createIndex('mediaId', 'mediaId', { unique: false });
                logsStore.createIndex('date', 'date', { unique: false });
                logsStore.createIndex('type', 'type', { unique: false });
            }

            if (!db.objectStoreNames.contains('achievements')) {
                db.createObjectStore('achievements', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains('todos')) {
                const todosStore = db.createObjectStore('todos', { keyPath: 'id' });
                todosStore.createIndex('repeat', 'repeat', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error('IndexedDB Error:', event.target.error);
            reject(event.target.error);
        };
    });
}

function executeTransaction(storeName, mode, callback) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initDB();
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);

            const request = callback(store);
            if (request) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            }
        } catch (err) {
            reject(err);
        }
    });
}

// === MEDIA ===
export function getMediaAll() {
    return executeTransaction('media', 'readonly', (store) => store.getAll());
}

export function getMediaById(id) {
    return executeTransaction('media', 'readonly', (store) => store.get(id));
}

export function saveMedia(mediaObj) {
    return executeTransaction('media', 'readwrite', (store) => store.put(mediaObj));
}

export function deleteMedia(id) {
    return executeTransaction('media', 'readwrite', (store) => store.delete(id));
}

// === LOGS ===
export function getLogsAll() {
    return executeTransaction('logs', 'readonly', (store) => store.getAll());
}

export function getLogById(id) {
    return executeTransaction('logs', 'readonly', (store) => store.get(id));
}

export function saveLog(logObj) {
    return executeTransaction('logs', 'readwrite', (store) => store.put(logObj));
}

export function deleteLog(id) {
    return executeTransaction('logs', 'readwrite', (store) => store.delete(id));
}

// === ACHIEVEMENTS ===
export function getAchievements() {
    return executeTransaction('achievements', 'readonly', (store) => store.getAll());
}

export function saveAchievement(achievementObj) {
    return executeTransaction('achievements', 'readwrite', (store) => store.put(achievementObj));
}

// === SETTINGS ===
export function getSettings() {
    return executeTransaction('settings', 'readonly', (store) => store.getAll());
}

export function saveSetting(key, value) {
    return executeTransaction('settings', 'readwrite', (store) => store.put({ key, value }));
}

export function getSetting(key) {
    return executeTransaction('settings', 'readonly', (store) => store.get(key));
}

// === TODOS ===
export function getTodosAll() {
    return executeTransaction('todos', 'readonly', (store) => store.getAll());
}

export function getTodoById(id) {
    return executeTransaction('todos', 'readonly', (store) => store.get(id));
}

export function saveTodo(todoObj) {
    return executeTransaction('todos', 'readwrite', (store) => store.put(todoObj));
}

export function deleteTodo(id) {
    return executeTransaction('todos', 'readwrite', (store) => store.delete(id));
}

// Data Export/Import
export async function exportData() {
    const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        media: await getMediaAll(),
        logs: await getLogsAll(),
        achievements: await getAchievements(),
        settings: await getSettings(),
        todos: await getTodosAll()
    };
    return data;
}

export async function importData(data) {
    if (!data || (data.version !== 1 && data.version !== 2)) throw new Error("Format JSON tidak valid");

    const db = await initDB();

    // Using simple approach: clear all then put
    return new Promise((resolve, reject) => {
        const stores = ['media', 'logs', 'achievements', 'settings', 'todos'];
        const tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        stores.forEach(s => tx.objectStore(s).clear());

        data.media?.forEach(m => tx.objectStore('media').put(m));
        data.logs?.forEach(l => tx.objectStore('logs').put(l));
        data.achievements?.forEach(a => tx.objectStore('achievements').put(a));
        data.settings?.forEach(s => tx.objectStore('settings').put(s));
        data.todos?.forEach(t => tx.objectStore('todos').put(t));
    });
}

export async function clearAllData() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const stores = ['media', 'logs', 'achievements', 'settings', 'todos'];
        const tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        stores.forEach(s => tx.objectStore(s).clear());
    });
}
