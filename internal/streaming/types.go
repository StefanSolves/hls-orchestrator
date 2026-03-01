package streaming

import (
	"sync"
)

type Segment struct {
	Sequence uint64  `json:"sequence"`
	Duration float64 `json:"duration"`
	Path     string  `json:"path"`
}

type Rendition struct {
	sync.RWMutex
	WindowSize int
	Segments   map[uint64]Segment
	ActiveIDs  []uint64
	IsClosed   bool
}

type StreamState struct {
	Renditions map[string]*Rendition
}

type Manager struct {
	sync.RWMutex
	Streams map[string]*StreamState
}
