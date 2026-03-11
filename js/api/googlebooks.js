const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

export async function searchGoogleBooks(query) {
    try {
        // We filter for books and relevance. 
        // Google Books works well with titles like "Kuma Kuma Kuma Bear 1"
        const params = new URLSearchParams({
            q: query,
            maxResults: '10',
            printType: 'books',
            langRestrict: 'ja'
        });

        const response = await fetch(`${GOOGLE_BOOKS_URL}?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Google Books API Error');
        }

        if (!data.items) return [];

        return data.items.map(item => {
            const info = item.volumeInfo;
            return {
                id: item.id,
                title: info.title,
                titleJP: info.title, // Usually already Japanese if langRestrict works
                cover: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '',
                // Google Books doesn't have "chapters", but has pageCount. 
                // However, user wants "Characters" which is manual. 
                // We'll return null for totalUnits to let them fill it or leave it as "?" 
                // unless we find a better heuristic.
                totalUnits: null,
                source: 'google'
            };
        });
    } catch (err) {
        console.error('Google Books Search Error:', err);
        throw err;
    }
}
