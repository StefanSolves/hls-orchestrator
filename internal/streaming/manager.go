package streaming

import (
	"fmt"
	"sort"
)

// NewManager initialises the global state.
func NewManager() *Manager {
	return &Manager{
		Streams: make(map[string]*StreamState),
	}
}

// GetOrCreateRendition ensures thread-safe access to a specific stream's rendition.
func (m *Manager) GetOrCreateRendition(streamID, renditionName string, windowSize int) *Rendition {
	m.Lock()
	defer m.Unlock()

	if _, ok := m.Streams[streamID]; !ok {
		m.Streams[streamID] = &StreamState{
			Renditions: make(map[string]*Rendition),
		}
	}

	if _, ok := m.Streams[streamID].Renditions[renditionName]; !ok {
		m.Streams[streamID].Renditions[renditionName] = &Rendition{
			WindowSize: windowSize,
			Segments:   make(map[uint64]Segment),
			ActiveIDs:  make([]uint64, 0),
		}
	}

	return m.Streams[streamID].Renditions[renditionName]
}

// AddSegment handles the logic for the POST /segments requirement.
func (r *Rendition) AddSegment(seg Segment) error {
	r.Lock()
	defer r.Unlock()

	if r.IsClosed {
		return fmt.Errorf("cannot add segment: stream is ended")
	}

	// Idempotency: Ignore if sequence already exists
	if _, exists := r.Segments[seg.Sequence]; exists {
		return nil
	}

	// Add new segment
	r.Segments[seg.Sequence] = seg
	r.ActiveIDs = append(r.ActiveIDs, seg.Sequence)
	
	// Keep IDs sorted to handle out-of-order arrivals
	sort.Slice(r.ActiveIDs, func(i, j int) bool {
		return r.ActiveIDs[i] < r.ActiveIDs[j]
	})

	// Maintain Sliding Window (Requirement: default 6 segments)
	if len(r.ActiveIDs) > r.WindowSize {
		oldestID := r.ActiveIDs[0]
		delete(r.Segments, oldestID)
		r.ActiveIDs = r.ActiveIDs[1:]
	}

	return nil
}