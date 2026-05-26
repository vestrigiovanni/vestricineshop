import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_KEY = '00ea09c7fb5bf89b064f6001a2de3122';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> }
) {
  const { movieId } = await params;

  try {
    // TMDB has a strict limit of 5 elements for include_image_language.
    // We split our 22 target languages into 5 groups of 5 or fewer languages and fetch them in parallel.
    const languageGroups = [
      'it,en,null,fr,de',
      'es,pt,ru,ja,ko',
      'zh,sv,no,da,fi',
      'pl,nl,tr,hi,ar',
      'he,el'
    ];

    const allPosters = new Map<string, any>();
    const allBackdrops = new Map<string, any>();
    const allLogos = new Map<string, any>();

    const fetchPromises = languageGroups.map(async (langs) => {
      const url = `${TMDB_BASE_URL}/movie/${movieId}/images?api_key=${TMDB_API_KEY}&include_image_language=${langs}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        (data.posters || []).forEach((img: any) => allPosters.set(img.file_path, img));
        (data.backdrops || []).forEach((img: any) => allBackdrops.set(img.file_path, img));
        (data.logos || []).forEach((img: any) => allLogos.set(img.file_path, img));
      }
    });

    // Execute in parallel (extremely fast)
    await Promise.all(fetchPromises);

    return NextResponse.json({
      posters: Array.from(allPosters.values()),
      backdrops: Array.from(allBackdrops.values()),
      logos: Array.from(allLogos.values())
    });
  } catch (error) {
    console.error(`Error fetching TMDB images for ${movieId}:`, error);
    return NextResponse.json({ posters: [], backdrops: [], logos: [] }, { status: 200 });
  }
}

