import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_KEY = '00ea09c7fb5bf89b064f6001a2de3122';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> }
) {
  const { movieId } = await params;

  try {
    const languages = ['it-IT', 'en-US'];
    const results: { it: any[]; en: any[] } = { it: [], en: [] };

    await Promise.all(languages.map(async (lang) => {
      const url = `${TMDB_BASE_URL}/movie/${movieId}/videos?api_key=${TMDB_API_KEY}&language=${lang}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.results || [])
          .filter((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
          .map((v: any) => ({
            ...v,
            thumbnail: `https://img.youtube.com/vi/${v.key}/mqdefault.jpg`
          }));

        if (lang === 'it-IT') results.it = filtered;
        else results.en = filtered;
      }
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error(`Error fetching TMDB videos for ${movieId}:`, error);
    return NextResponse.json({ it: [], en: [] }, { status: 200 });
  }
}
