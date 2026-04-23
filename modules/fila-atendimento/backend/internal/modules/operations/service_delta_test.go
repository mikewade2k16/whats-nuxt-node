package operations

import (
	"context"
	"testing"
	"time"
)

type serviceDeltaRepository struct {
	roster         []ConsultantProfile
	snapshot       SnapshotState
	maxConcurrent  int
	persistedInput PersistInput
	loadOptions    SnapshotLoadOptions
}

func (repository *serviceDeltaRepository) StoreExists(_ context.Context, storeID string) (bool, error) {
	return storeID == "store-1", nil
}

func (repository *serviceDeltaRepository) GetStoreName(_ context.Context, _ string) (string, error) {
	return "Loja Teste", nil
}

func (repository *serviceDeltaRepository) GetMaxConcurrentServices(_ context.Context, _ string) (int, error) {
	if repository.maxConcurrent > 0 {
		return repository.maxConcurrent, nil
	}
	return 10, nil
}

func (repository *serviceDeltaRepository) ListRoster(_ context.Context, _ string) ([]ConsultantProfile, error) {
	return repository.roster, nil
}

func (repository *serviceDeltaRepository) LoadSnapshot(_ context.Context, _ string, options SnapshotLoadOptions) (SnapshotState, error) {
	repository.loadOptions = options
	return repository.snapshot, nil
}

func (repository *serviceDeltaRepository) Persist(_ context.Context, input PersistInput) error {
	repository.persistedInput = input
	return nil
}

func TestStartReturnsMutationDeltaWithoutSnapshotReload(t *testing.T) {
	repository := &serviceDeltaRepository{
		roster: []ConsultantProfile{{
			ID:             "consultant-1",
			StoreID:        "store-1",
			Name:           "Consultor Teste",
			Role:           "Consultor",
			Initials:       "CT",
			Color:          "#168aad",
			MonthlyGoal:    1000,
			CommissionRate: 0.05,
		}},
		snapshot: SnapshotState{
			WaitingList: []QueueStateItem{{
				ConsultantID:  "consultant-1",
				QueueJoinedAt: time.Now().UTC().Add(-2 * time.Minute),
			}},
			ConsultantCurrentStatus: map[string]ConsultantStatus{
				"consultant-1": {
					Status:    statusQueue,
					StartedAt: time.Now().UTC().Add(-2 * time.Minute),
				},
			},
		},
	}

	service := NewService(repository, nil, nil)
	ack, err := service.Start(context.Background(), AccessContext{
		Role:     RoleOwner,
		StoreIDs: []string{"store-1"},
	}, StartCommandInput{StoreID: "store-1", PersonID: "consultant-1"})
	if err != nil {
		t.Fatalf("start returned error: %v", err)
	}

	if ack.Delta == nil {
		t.Fatalf("expected mutation delta in ack")
	}
	if ack.Delta.RemoveWaitingPersonID != "consultant-1" {
		t.Fatalf("removeWaitingPersonId = %q, want consultant-1", ack.Delta.RemoveWaitingPersonID)
	}
	if ack.Delta.ActiveService == nil || ack.Delta.ActiveService.ID != "consultant-1" {
		t.Fatalf("expected active service delta for consultant-1")
	}
	if ack.Delta.ActiveService.ServiceID == "" {
		t.Fatalf("expected generated service id in delta")
	}
	if ack.Delta.ConsultantStatus == nil || ack.Delta.ConsultantStatus.PersonID != "consultant-1" || ack.Delta.ConsultantStatus.Status.Status != statusService {
		t.Fatalf("expected service status delta for consultant-1")
	}
	if len(repository.persistedInput.ActiveServices) != 1 {
		t.Fatalf("persisted active services = %d, want 1", len(repository.persistedInput.ActiveServices))
	}
	if len(repository.persistedInput.WaitingList) != 0 {
		t.Fatalf("persisted waiting list = %d, want 0", len(repository.persistedInput.WaitingList))
	}
	if !repository.loadOptions.IncludeActivitySessions {
		t.Fatalf("expected start to load activity sessions for persistence")
	}
}

func TestFinishReturnsHistoryAndQueueDeltaWithoutSnapshotReload(t *testing.T) {
	startedAt := time.Now().UTC().Add(-10 * time.Minute)
	queueJoinedAt := startedAt.Add(-1 * time.Minute)
	repository := &serviceDeltaRepository{
		roster: []ConsultantProfile{{
			ID:             "consultant-1",
			StoreID:        "store-1",
			Name:           "Consultor Teste",
			Role:           "Consultor",
			Initials:       "CT",
			Color:          "#168aad",
			MonthlyGoal:    1000,
			CommissionRate: 0.05,
		}},
		snapshot: SnapshotState{
			ActiveServices: []ActiveServiceState{{
				ConsultantID:         "consultant-1",
				ServiceID:            "svc-1",
				ServiceStartedAt:     startedAt,
				QueueJoinedAt:        queueJoinedAt,
				QueueWaitMs:          60000,
				QueuePositionAtStart: 1,
				StartMode:            startModeQueue,
			}},
			ConsultantCurrentStatus: map[string]ConsultantStatus{
				"consultant-1": {
					Status:    statusService,
					StartedAt: startedAt,
				},
			},
		},
	}

	service := NewService(repository, nil, nil)
	ack, err := service.Finish(context.Background(), AccessContext{
		Role:     RoleOwner,
		StoreIDs: []string{"store-1"},
	}, FinishCommandInput{StoreID: "store-1", PersonID: "consultant-1", Outcome: "compra", SaleAmount: 3900})
	if err != nil {
		t.Fatalf("finish returned error: %v", err)
	}

	if ack.Delta == nil {
		t.Fatalf("expected mutation delta in ack")
	}
	if ack.Delta.RemoveActivePersonID != "consultant-1" {
		t.Fatalf("removeActivePersonId = %q, want consultant-1", ack.Delta.RemoveActivePersonID)
	}
	if ack.Delta.WaitingEntry == nil || ack.Delta.WaitingEntry.ID != "consultant-1" {
		t.Fatalf("expected waiting entry delta for consultant-1")
	}
	if ack.Delta.ServiceHistoryEntry == nil || ack.Delta.ServiceHistoryEntry.ServiceID != "svc-1" {
		t.Fatalf("expected service history delta for finished service")
	}
	if ack.Delta.ConsultantStatus == nil || ack.Delta.ConsultantStatus.Status.Status != statusQueue {
		t.Fatalf("expected queue status delta after finish")
	}
	if len(repository.persistedInput.ActiveServices) != 0 {
		t.Fatalf("persisted active services = %d, want 0", len(repository.persistedInput.ActiveServices))
	}
	if len(repository.persistedInput.WaitingList) != 1 {
		t.Fatalf("persisted waiting list = %d, want 1", len(repository.persistedInput.WaitingList))
	}
	if len(repository.persistedInput.AppendedHistory) != 1 {
		t.Fatalf("persisted appended history = %d, want 1", len(repository.persistedInput.AppendedHistory))
	}
}
