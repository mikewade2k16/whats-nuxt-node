package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"plataforma-api/internal/domain/core"
)

func TestWriteOwnProfileUpdateErrorEmailConflict(t *testing.T) {
	recorder := httptest.NewRecorder()

	handled := writeOwnProfileUpdateError(recorder, "email", core.ErrEmailAlreadyInUse)
	if !handled {
		t.Fatalf("expected handler to consume email conflict")
	}

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d", http.StatusConflict, recorder.Code)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse payload: %v", err)
	}

	if payload["error"] != "email_already_in_use" {
		t.Fatalf("expected email_already_in_use, got %q", payload["error"])
	}

	if payload["message"] != "Email ja esta em uso por outra conta." {
		t.Fatalf("unexpected message %q", payload["message"])
	}
}

func TestWriteOwnProfileUpdateErrorInvalidEmail(t *testing.T) {
	recorder := httptest.NewRecorder()

	handled := writeOwnProfileUpdateError(recorder, "email", core.ErrInvalidInput)
	if !handled {
		t.Fatalf("expected handler to consume invalid email")
	}

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse payload: %v", err)
	}

	if payload["message"] != "Email invalido." {
		t.Fatalf("unexpected message %q", payload["message"])
	}
}

func TestWriteOwnProfileUpdateErrorReturnsFalseForUnhandledError(t *testing.T) {
	recorder := httptest.NewRecorder()

	handled := writeOwnProfileUpdateError(recorder, "email", errors.New("boom"))
	if handled {
		t.Fatalf("expected unhandled error to bubble")
	}

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected recorder to remain untouched, got %d", recorder.Code)
	}
}
