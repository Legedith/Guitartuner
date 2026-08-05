function searchableText(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function chartHasEvents(chart) {
  return Array.isArray(chart?.events) && chart.events.length > 0;
}

export function trackHasChordChart(track, charts) {
  return Boolean(track?.videoId) && chartHasEvents(charts?.[track.videoId]);
}

export function filterChartedTracks(tracks, charts, query = '') {
  const needle = searchableText(query);
  return (Array.isArray(tracks) ? tracks : []).filter((track) => {
    if (!trackHasChordChart(track, charts)) return false;
    if (!needle) return true;
    const haystack = searchableText(`${track.title ?? ''} ${track.artist ?? ''} ${track.album ?? ''}`);
    return haystack.includes(needle);
  });
}
