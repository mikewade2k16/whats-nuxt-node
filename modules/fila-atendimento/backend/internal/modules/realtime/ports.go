package realtime

import modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"

const (
	RealtimeChannelOperations = "operations"
	RealtimeChannelContext    = "context"
)

type AccessContext = modulecontracts.AccessContext
type RealtimeContext = modulecontracts.RealtimeContext
type RealtimeContextResolver = modulecontracts.RealtimeContextResolver
type RealtimeSubscriptionScope = modulecontracts.RealtimeSubscriptionScope
