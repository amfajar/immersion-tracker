const ANILIST_URL = 'https://graphql.anilist.co';

export async function searchAniList(query, type = 'ANIME', format = null) {
  const graphqlQuery = `
    query ($search: String, $type: MediaType, $format: MediaFormat) {
      Page(perPage: 8) {
        media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
          id
          title { romaji native english }
          episodes
          chapters
          volumes
          nextAiringEpisode { episode }
          coverImage { medium }
          status
          averageScore
        }
      }
    }
  `;

  const variables = { search: query, type: type };
  if (format) variables.format = format;

  try {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: graphqlQuery, variables })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.errors?.[0]?.message || 'AniList API Error');
    }

    return body.data.Page.media;
  } catch (err) {
    console.error('AniList Search Error:', err);
    throw err;
  }
}

export async function importAniListUser(username) {
  const query = `
    query ($username: String) {
      MediaListCollection(userName: $username, type: ANIME, status: CURRENT) {
        lists {
          entries {
            media {
              id
              title { romaji native }
              episodes
              coverImage { medium }
            }
            progress
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables: { username } })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.errors?.[0]?.message || 'AniList API Error');
    }

    let entries = [];
    if (body.data.MediaListCollection && body.data.MediaListCollection.lists) {
      body.data.MediaListCollection.lists.forEach(list => {
        entries = entries.concat(list.entries);
      });
    }
    return entries;
  } catch (err) {
    console.error('AniList Import Error:', err);
    throw err;
  }
}
