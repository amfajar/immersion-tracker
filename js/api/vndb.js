const VNDB_API_URL = 'https://api.vndb.org/kana/vn';

export async function searchVNDB(query) {
    try {
        const response = await fetch(VNDB_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filters: ["search", "=", query],
                fields: "id, title, titles.title, titles.lang, image.url, length_minutes",
                results: 8,
                sort: "searchrank"
            })
        });

        if (!response.ok) {
            throw new Error(`VNDB API HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        return data.results;
    } catch (err) {
        console.error('VNDB Search Error:', err);
        throw err;
    }
}
