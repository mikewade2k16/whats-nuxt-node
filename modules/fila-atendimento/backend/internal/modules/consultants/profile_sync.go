package consultants

import (
	"context"
	"strings"
)

type ProfileSync struct {
	repository Repository
}

func NewProfileSync(repository Repository) *ProfileSync {
	return &ProfileSync{repository: repository}
}

func (syncer *ProfileSync) SyncLinkedProfile(ctx context.Context, userID string, displayName string) error {
	if syncer == nil || syncer.repository == nil {
		return nil
	}

	trimmedUserID := strings.TrimSpace(userID)
	trimmedDisplayName := strings.TrimSpace(displayName)
	if trimmedUserID == "" || trimmedDisplayName == "" {
		return nil
	}

	return syncer.repository.SyncLinkedIdentity(ctx, trimmedUserID, trimmedDisplayName, buildInitials(trimmedDisplayName))
}
