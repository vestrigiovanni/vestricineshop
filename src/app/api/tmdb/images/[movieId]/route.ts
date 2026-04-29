import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_KEY = '00ea09c7fb5bf89b064f6001a2de3122';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> }
) {
  const { movieId } = await params;

  try {
    const url = `${TMDB_BASE_URL}/movie/${movieId}/images?api_key=${TMDB_API_KEY}&include_image_language=it,en,null`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ posters: [], backdrops: [] }, { status: 200 });
    }
    const data = await response.json();
    return NextResponse.json({
      posters: data.posters || [],
      backdrops: data.backdrops || []
    });
  } catch (error) {
    console.error(`Error fetching TMDB images for ${movieId}:`, error);
    return NextResponse.json({ posters: [], backdrops: [] }, { status: 200 });
  }
}
