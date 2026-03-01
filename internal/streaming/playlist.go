package streaming

import (
	"fmt"
	"net/http"
	"strings"
)

// ServePlaylist generates the HLS manifest string and writes to response.
func (r *Rendition) ServePlaylist(w http.ResponseWriter) {
	r.RLock()
	defer r.RUnlock()

	if len(r.ActiveIDs) == 0 {
		http.Error(w, "No segments available", http.StatusNotFound)
		return
	}

	var sb strings.Builder
	sb.WriteString("#EXTM3U\n")
	sb.WriteString("#EXT-X-VERSION:3\n")
	
	// Target duration: must be >= max segment duration.
	maxDur := 0.0
	for _, s := range r.Segments {
		if s.Duration > maxDur {
			maxDur = s.Duration
		}
	}
	sb.WriteString(fmt.Sprintf("#EXT-X-TARGETDURATION:%d\n", int(maxDur+0.5)))
	sb.WriteString(fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d\n", r.ActiveIDs[0]))

	// Requirement: Only publish consecutive segments. Avoid exposing gaps.
	expectedSeq := r.ActiveIDs[0]
	for _, id := range r.ActiveIDs {
		if id != expectedSeq {
			// If we find a gap (e.g., 40, 41, 43), we stop at 41.
			break 
		}
		seg := r.Segments[id]
		sb.WriteString(fmt.Sprintf("#EXTINF:%.1f,\n%s\n", seg.Duration, seg.Path))
		expectedSeq++
	}

	// Requirement: Add #EXT-X-ENDLIST if stream is finished.
	if r.IsClosed {
		sb.WriteString("#EXT-X-ENDLIST\n")
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Write([]byte(sb.String()))
}