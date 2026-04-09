package realtime

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Session struct {
	UserID          string
	TenantID        string
	SessionID       string
	IsPlatformAdmin bool
}

type Hub struct {
	mu          sync.RWMutex
	clients     map[*client]struct{}
	tenantRooms map[string]map[*client]struct{}
	upgrader    websocket.Upgrader

	pingInterval time.Duration
	writeTimeout time.Duration
	readTimeout  time.Duration
}

type client struct {
	hub       *Hub
	conn      *websocket.Conn
	session   Session
	tenantID  string
	send      chan []byte
	closeOnce sync.Once
}

type inboundMessage struct {
	Type       string `json:"type"`
	TenantID   string `json:"tenantId,omitempty"`
	ModuleCode string `json:"moduleCode,omitempty"`
	Screen     string `json:"screen,omitempty"`
}

func NewHub(allowedOrigins []string, pingInterval, writeTimeout, readTimeout time.Duration) *Hub {
	allowAll := false
	allowedMap := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		normalized := strings.TrimSpace(strings.ToLower(origin))
		if normalized == "*" {
			allowAll = true
		}
		if normalized != "" {
			allowedMap[normalized] = struct{}{}
		}
	}

	return &Hub{
		clients:     make(map[*client]struct{}),
		tenantRooms: make(map[string]map[*client]struct{}),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := strings.TrimSpace(strings.ToLower(r.Header.Get("Origin")))
				if origin == "" {
					return true
				}
				if allowAll {
					return true
				}
				_, ok := allowedMap[origin]
				return ok
			},
		},
		pingInterval: pingInterval,
		writeTimeout: writeTimeout,
		readTimeout:  readTimeout,
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, session Session) error {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}

	c := &client{
		hub:     h,
		conn:    conn,
		session: session,
		send:    make(chan []byte, 32),
	}

	h.register(c)
	go c.writePump()
	c.readPump()
	return nil
}

func (h *Hub) BroadcastTenant(tenantID string, payload any) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return
	}

	message, err := json.Marshal(payload)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := h.tenantRooms[tenantID]
	for c := range clients {
		select {
		case c.send <- message:
		default:
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) unregister(c *client) (tenantID string, userID string, shouldBroadcast bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	_, exists := h.clients[c]
	if !exists {
		return "", "", false
	}
	delete(h.clients, c)

	if c.tenantID != "" {
		room := h.tenantRooms[c.tenantID]
		if room != nil {
			delete(room, c)
			if len(room) == 0 {
				delete(h.tenantRooms, c.tenantID)
			}
		}
	}

	c.close()
	return c.tenantID, c.session.UserID, c.tenantID != ""
}

func (h *Hub) attachToTenant(c *client, tenantID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if c.tenantID != "" && c.tenantID != tenantID {
		currentRoom := h.tenantRooms[c.tenantID]
		if currentRoom != nil {
			delete(currentRoom, c)
			if len(currentRoom) == 0 {
				delete(h.tenantRooms, c.tenantID)
			}
		}
	}
	if strings.TrimSpace(tenantID) == "" {
		c.tenantID = ""
		return
	}

	room := h.tenantRooms[tenantID]
	if room == nil {
		room = make(map[*client]struct{})
		h.tenantRooms[tenantID] = room
	}
	room[c] = struct{}{}
	c.tenantID = tenantID
}

func (c *client) readPump() {
	defer func() {
		tenantID, userID, shouldBroadcast := c.hub.unregister(c)
		if shouldBroadcast {
			c.hub.BroadcastTenant(tenantID, map[string]any{
				"type":     "presence.user_left",
				"tenantId": tenantID,
				"userId":   userID,
				"at":       time.Now().UTC(),
			})
		}
	}()

	c.conn.SetReadLimit(65536)
	_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.readTimeout))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.readTimeout))
		return nil
	})

	for {
		var msg inboundMessage
		if err := c.conn.ReadJSON(&msg); err != nil {
			return
		}

		switch strings.TrimSpace(msg.Type) {
		case "presence.join":
			tenantID := strings.TrimSpace(msg.TenantID)
			if tenantID == "" {
				tenantID = c.session.TenantID
			}
			if tenantID == "" {
				continue
			}
			if !c.session.IsPlatformAdmin && c.session.TenantID != "" && c.session.TenantID != tenantID {
				continue
			}

			c.hub.attachToTenant(c, tenantID)
			c.enqueue(map[string]any{
				"type":     "presence.joined",
				"tenantId": tenantID,
				"userId":   c.session.UserID,
				"at":       time.Now().UTC(),
			})
			c.hub.BroadcastTenant(tenantID, map[string]any{
				"type":     "presence.user_joined",
				"tenantId": tenantID,
				"userId":   c.session.UserID,
				"at":       time.Now().UTC(),
			})
		case "presence.heartbeat":
			if c.tenantID == "" {
				continue
			}
			c.enqueue(map[string]any{
				"type":     "presence.heartbeat_ack",
				"tenantId": c.tenantID,
				"userId":   c.session.UserID,
				"at":       time.Now().UTC(),
			})
		case "presence.leave":
			if c.tenantID == "" {
				continue
			}
			tenantID := c.tenantID
			c.hub.attachToTenant(c, "")
			c.hub.BroadcastTenant(tenantID, map[string]any{
				"type":     "presence.user_left",
				"tenantId": tenantID,
				"userId":   c.session.UserID,
				"at":       time.Now().UTC(),
			})
		default:
			continue
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(c.hub.pingInterval)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.writeTimeout))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.writeTimeout))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *client) enqueue(payload any) {
	message, err := json.Marshal(payload)
	if err != nil {
		return
	}
	select {
	case c.send <- message:
	default:
	}
}

func (c *client) close() {
	c.closeOnce.Do(func() {
		close(c.send)
		_ = c.conn.Close()
	})
}
