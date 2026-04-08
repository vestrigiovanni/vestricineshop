
/**
 * PURE MATH PROTOCOL: Calculates the Pretix date_from/date_to string.
 * @param baseDate YYYY-MM-DD
 * @param baseTime HH:mm
 * @param addMinutes Number of minutes to add
 */
export function calculatePretixDateTime(baseDate: string, baseTime: string, addMinutes: number = 0) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const [h, m] = baseTime.split(':').map(Number);
  let totalMin = h * 60 + m + addMinutes;
  
  let finalH = Math.floor(totalMin / 60);
  let finalM = totalMin % 60;
  
  let finalDate = baseDate;
  if (finalH >= 24) {
    const daysToAdd = Math.floor(finalH / 24);
    finalH %= 24;
    
    // Increment date Safely (Date object is ok just for the day component)
    const d = new Date(baseDate);
    d.setDate(d.getDate() + daysToAdd);
    finalDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  
  return `${finalDate}T${pad(finalH)}:${pad(finalM)}:00+02:00`;
}
