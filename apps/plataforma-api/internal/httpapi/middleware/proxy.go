package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

type TrustedProxyOptions struct {
	TrustedRanges []string
}

type trustedProxyMatcher struct {
	prefixes      []netip.Prefix
	trustLoopback bool
	trustPrivate  bool
}

var (
	loopbackRanges = []string{"127.0.0.0/8", "::1/128"}
	privateRanges  = []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"}
)

func TrustedProxyRealIP(options TrustedProxyOptions) func(http.Handler) http.Handler {
	matcher := newTrustedProxyMatcher(options.TrustedRanges)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clientIP := resolveTrustedClientIP(r, matcher)
			if clientIP != "" {
				r.RemoteAddr = clientIP
			}
			next.ServeHTTP(w, r)
		})
	}
}

func newTrustedProxyMatcher(ranges []string) trustedProxyMatcher {
	entries := make([]string, 0, len(ranges))
	for _, entry := range ranges {
		trimmed := strings.TrimSpace(strings.ToLower(entry))
		if trimmed != "" {
			entries = append(entries, trimmed)
		}
	}
	if len(entries) < 1 {
		entries = []string{"loopback", "private"}
	}

	matcher := trustedProxyMatcher{
		prefixes: make([]netip.Prefix, 0, len(entries)),
	}

	for _, entry := range entries {
		switch entry {
		case "loopback":
			matcher.trustLoopback = true
			for _, value := range loopbackRanges {
				addTrustedPrefix(&matcher, value)
			}
		case "private":
			matcher.trustPrivate = true
			for _, value := range privateRanges {
				addTrustedPrefix(&matcher, value)
			}
		default:
			addTrustedPrefix(&matcher, entry)
		}
	}

	return matcher
}

func addTrustedPrefix(matcher *trustedProxyMatcher, value string) {
	normalized := strings.TrimSpace(strings.ToLower(value))
	if normalized == "" {
		return
	}

	if strings.Contains(normalized, "/") {
		prefix, err := netip.ParsePrefix(normalized)
		if err == nil {
			matcher.prefixes = append(matcher.prefixes, prefix)
		}
		return
	}

	addr, err := netip.ParseAddr(normalizeIP(normalized))
	if err != nil {
		return
	}

	bits := 128
	if addr.Is4() {
		bits = 32
	}
	matcher.prefixes = append(matcher.prefixes, netip.PrefixFrom(addr, bits))
}

func resolveTrustedClientIP(r *http.Request, matcher trustedProxyMatcher) string {
	peerIP := normalizeIP(extractRemoteIP(r.RemoteAddr))
	if peerIP == "" {
		return ""
	}

	if !matcher.isTrusted(peerIP) {
		return peerIP
	}

	forwardedFor := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwardedFor == "" {
		return peerIP
	}

	first := normalizeIP(strings.Split(forwardedFor, ",")[0])
	if net.ParseIP(first) == nil {
		return peerIP
	}

	return first
}

func (m trustedProxyMatcher) isTrusted(value string) bool {
	addr, err := netip.ParseAddr(normalizeIP(value))
	if err != nil {
		return false
	}

	if m.trustLoopback && addr.IsLoopback() {
		return true
	}
	if m.trustPrivate && addr.IsPrivate() {
		return true
	}

	for _, prefix := range m.prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}

func extractRemoteIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(remoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(remoteAddr)
}

func normalizeIP(value string) string {
	normalized := strings.Trim(strings.TrimSpace(value), "[]")
	if strings.HasPrefix(strings.ToLower(normalized), "::ffff:") {
		return normalized[7:]
	}
	return normalized
}
