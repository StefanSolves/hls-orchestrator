package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"hls-orchestrator/internal/streaming"
)

func main() {
	manager := streaming.NewManager()

	// 1. Create the router/mux
	mux := http.NewServeMux()
	mux.HandleFunc("/streams/", func(w http.ResponseWriter, r *http.Request) {
		// Breakdown URL into segments: "streams/ID/renditions/Name/..."
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 2 {
			http.NotFound(w, r)
			return
		}
		streamID := parts[1]


		// Route: POST /streams/{id}/end
		if len(parts) == 3 && parts[2] == "end" && r.Method == http.MethodPost {
			handleEndStream(w, manager, streamID)
			return
		}

		// Route: POST /streams/{id}/renditions/{name}/segments
        // parts[3] = rendition name, parts[4] = "segments"
		if len(parts) == 5 && parts[2] == "renditions" && parts[4] == "segments" && r.Method == http.MethodPost {
			handleRegisterSegment(w, r, manager, streamID, parts[3])
			return
		}

		// Route: GET /streams/{id}/renditions/{name}/{file}.m3u8
       // Serves the HLS manifest with a 6-segment sliding window.
		if len(parts) == 5 && parts[2] == "renditions" && strings.HasSuffix(parts[4], ".m3u8") && r.Method == http.MethodGet {
			rend := manager.GetOrCreateRendition(streamID, parts[3], 6)
			rend.ServePlaylist(w)
			return
		}
		// Default case: URL doesn't match any specific pattern or method
		http.NotFound(w, r)
	})

	// 2. Configure the HTTP Server
	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	// 3. Channel to listen for interrupt signals (SIGINT, SIGTERM)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// 4. Run server in a goroutine so it doesn't block
	go func() {
		fmt.Println("HLS Orchestrator starting on :8080...")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Listen error: %s\n", err)
		}
	}()

	// 5. Block until a signal is received
	<-stop
	fmt.Println("\nShutting down server gracefully...")

	// 6. Give the server 5 seconds to finish active requests
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	fmt.Println("Server stopped.")
}

//  handleRegisterSegment decodes and adds a new video segment to a 6-segment sliding window.

func handleRegisterSegment(w http.ResponseWriter, r *http.Request, m *streaming.Manager, streamID, renditionName string) {
	var seg streaming.Segment
	if err := json.NewDecoder(r.Body).Decode(&seg); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	rend := m.GetOrCreateRendition(streamID, renditionName, 6)
	if err := rend.AddSegment(seg); err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// handleEndStream marks all renditions for a stream as closed to prevent further segment uploads.
func handleEndStream(w http.ResponseWriter, m *streaming.Manager, streamID string) {
	m.Lock()
	defer m.Unlock()
	stream, ok := m.Streams[streamID]
	if !ok {
		http.NotFound(w, nil)
		return
	}
	for _, rend := range stream.Renditions {
		rend.Lock()
		rend.IsClosed = true
		rend.Unlock()
	}
	w.WriteHeader(http.StatusOK)
}