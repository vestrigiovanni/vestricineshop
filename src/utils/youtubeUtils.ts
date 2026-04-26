/**
 * Extracts the YouTube Video ID from various URL formats.
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  
  // If it's already an ID (alphanumeric, length 11 usually), return it
  if (urlOrId.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }

  // Regex for different YouTube URL formats
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = urlOrId.match(regex);
  
  return match ? match[1] : null;
}
