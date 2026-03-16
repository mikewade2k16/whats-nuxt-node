package core

import "testing"

func TestApplyDefaultLimitUsesConfiguredValueForUsers(t *testing.T) {
	svc := NewService(nil, 3)
	result := svc.applyDefaultLimit("core_panel", "users", ResolvedLimit{Source: "default"})
	if result.Value == nil {
		t.Fatalf("expected default users limit to be applied")
	}
	if *result.Value != 3 {
		t.Fatalf("expected value 3, got %d", *result.Value)
	}
}

func TestApplyDefaultLimitKeepsExistingValue(t *testing.T) {
	svc := NewService(nil, 3)
	value := 8
	result := svc.applyDefaultLimit("core_panel", "users", ResolvedLimit{Source: "plan_limit", Value: &value})
	if result.Value == nil || *result.Value != 8 {
		t.Fatalf("expected existing limit to be preserved")
	}
	if result.Source != "plan_limit" {
		t.Fatalf("expected source plan_limit, got %s", result.Source)
	}
}

func TestApplyDefaultLimitNoFallbackForNonUsersKey(t *testing.T) {
	svc := NewService(nil, 3)
	result := svc.applyDefaultLimit("core_panel", "connections", ResolvedLimit{Source: "default"})
	if result.Value != nil {
		t.Fatalf("expected no fallback for non-users key")
	}
}

func TestApplyDefaultLimitUsesAtendimentoDefaults(t *testing.T) {
	svc := NewService(nil, 10)

	usersResult := svc.applyDefaultLimit("atendimento", "users", ResolvedLimit{Source: "default"})
	if usersResult.Value == nil || *usersResult.Value != 3 {
		t.Fatalf("expected atendimento users default 3, got %#v", usersResult.Value)
	}

	instancesResult := svc.applyDefaultLimit("atendimento", "instances", ResolvedLimit{Source: "default"})
	if instancesResult.Value == nil || *instancesResult.Value != 1 {
		t.Fatalf("expected atendimento instances default 1, got %#v", instancesResult.Value)
	}
}
