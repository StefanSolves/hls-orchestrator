package streaming

import "testing"

func TestSlidingWindow(t *testing.T) {
	// Initialise a rendition with a window size of 3
	rend := &Rendition{
		WindowSize: 3,
		Segments:   make(map[uint64]Segment),
		ActiveIDs:  make([]uint64, 0),
	}
	
	// Add 5 segments (Sequence 1 through 5)
	for i := uint64(1); i <= 5; i++ {
		rend.AddSegment(Segment{Sequence: i, Duration: 2.0, Path: "test.ts"})
	}

	// Verify window size is exactly 3 (it should only keep 3, 4, 5)
	if len(rend.ActiveIDs) != 3 {
		t.Errorf("Expected window size 3, got %d", len(rend.ActiveIDs))
	}
	
	// Verify the oldest segments (1 and 2) were dropped
	if len(rend.ActiveIDs) > 0 && rend.ActiveIDs[0] != 3 {
		t.Errorf("Expected first segment in window to be 3, got %d", rend.ActiveIDs[0])
	}
}