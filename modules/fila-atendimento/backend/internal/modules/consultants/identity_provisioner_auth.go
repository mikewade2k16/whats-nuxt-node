package consultants

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
)

type AuthIdentityProvisioner struct {
	pool                  *pgxpool.Pool
	passwordHasher        auth.PasswordHasher
	defaultAccessPassword string
}

func NewAuthIdentityProvisioner(pool *pgxpool.Pool, passwordHasher auth.PasswordHasher, defaultAccessPassword string) *AuthIdentityProvisioner {
	return &AuthIdentityProvisioner{
		pool:                  pool,
		passwordHasher:        passwordHasher,
		defaultAccessPassword: resolveDefaultAccessPassword(defaultAccessPassword),
	}
}

func (provisioner *AuthIdentityProvisioner) EnsureConsultantIdentity(ctx context.Context, _ AccessContext, input ConsultantIdentityInput) (ProvisionedIdentity, error) {
	if provisioner == nil || provisioner.pool == nil || provisioner.passwordHasher == nil {
		return ProvisionedIdentity{}, ErrAccessProvisioning
	}

	consultantID := strings.TrimSpace(input.ConsultantID)
	displayName := strings.TrimSpace(input.DisplayName)
	email := strings.ToLower(strings.TrimSpace(input.Email))
	storeIDs := compactStoreIDs(input.StoreIDs)
	if consultantID == "" || displayName == "" || email == "" || len(storeIDs) == 0 {
		return ProvisionedIdentity{}, ErrValidation
	}

	tx, err := provisioner.pool.Begin(ctx)
	if err != nil {
		return ProvisionedIdentity{}, err
	}

	defer func() {
		_ = tx.Rollback(ctx)
	}()

	linkedUserID, err := provisioner.lockLinkedUserID(ctx, tx, consultantID)
	if err != nil {
		return ProvisionedIdentity{}, err
	}

	if linkedUserID != "" {
		resolvedUserID, err := provisioner.syncExistingIdentity(ctx, tx, linkedUserID, displayName)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return ProvisionedIdentity{}, err
		}

		if resolvedUserID != "" {
			if err := provisioner.ensureStoreRoles(ctx, tx, resolvedUserID, storeIDs); err != nil {
				return ProvisionedIdentity{}, err
			}

			if err := tx.Commit(ctx); err != nil {
				return ProvisionedIdentity{}, err
			}

			return ProvisionedIdentity{
				UserID:             resolvedUserID,
				MustChangePassword: false,
			}, nil
		}
	}

	passwordHash, err := provisioner.passwordHasher.Hash(provisioner.defaultAccessPassword)
	if err != nil {
		return ProvisionedIdentity{}, err
	}

	var userID string
	err = tx.QueryRow(ctx, `
		insert into users (
			email,
			display_name,
			password_hash,
			must_change_password,
			is_active
		)
		values ($1, $2, $3, $4, true)
		returning id::text;
	`, email, displayName, passwordHash, input.MustChangePassword).Scan(&userID)
	if err != nil {
		if isAccessEmailConflict(err) {
			return ProvisionedIdentity{}, ErrAccessConflict
		}

		return ProvisionedIdentity{}, err
	}

	if err := provisioner.ensureStoreRoles(ctx, tx, userID, storeIDs); err != nil {
		return ProvisionedIdentity{}, err
	}

	if _, err := tx.Exec(ctx, `
		update consultants
		set
			user_id = $2::uuid,
			updated_at = now()
		where id = $1::uuid;
	`, consultantID, userID); err != nil {
		return ProvisionedIdentity{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ProvisionedIdentity{}, err
	}

	return ProvisionedIdentity{
		UserID:             userID,
		MustChangePassword: input.MustChangePassword,
	}, nil
}

func (provisioner *AuthIdentityProvisioner) DeactivateConsultantIdentity(ctx context.Context, _ AccessContext, consultantID string) error {
	if provisioner == nil || provisioner.pool == nil {
		return ErrAccessProvisioning
	}

	tx, err := provisioner.pool.Begin(ctx)
	if err != nil {
		return err
	}

	defer func() {
		_ = tx.Rollback(ctx)
	}()

	linkedUserID, err := provisioner.lockLinkedUserID(ctx, tx, consultantID)
	if err != nil {
		return err
	}

	if linkedUserID != "" {
		if _, err := tx.Exec(ctx, `
			update users
			set
				is_active = false,
				updated_at = now()
			where id = $1::uuid;
		`, linkedUserID); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}

func (provisioner *AuthIdentityProvisioner) lockLinkedUserID(ctx context.Context, tx pgx.Tx, consultantID string) (string, error) {
	var linkedUserID string
	err := tx.QueryRow(ctx, `
		select coalesce(user_id::text, '')
		from consultants
		where id = $1::uuid
		for update;
	`, consultantID).Scan(&linkedUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrConsultantNotFound
		}

		return "", err
	}

	return strings.TrimSpace(linkedUserID), nil
}

func (provisioner *AuthIdentityProvisioner) syncExistingIdentity(ctx context.Context, tx pgx.Tx, userID string, displayName string) (string, error) {
	var updatedUserID string
	err := tx.QueryRow(ctx, `
		update users
		set
			display_name = $2,
			is_active = true,
			updated_at = now()
		where id = $1::uuid
		returning id::text;
	`, userID, displayName).Scan(&updatedUserID)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(updatedUserID), nil
}

func (provisioner *AuthIdentityProvisioner) ensureStoreRoles(ctx context.Context, tx pgx.Tx, userID string, storeIDs []string) error {
	for _, storeID := range storeIDs {
		if _, err := tx.Exec(ctx, `
			insert into user_store_roles (user_id, store_id, role)
			values ($1::uuid, $2::uuid, 'consultant')
			on conflict do nothing;
		`, userID, storeID); err != nil {
			return err
		}
	}

	return nil
}

func compactStoreIDs(storeIDs []string) []string {
	result := make([]string, 0, len(storeIDs))
	for _, storeID := range storeIDs {
		normalizedStoreID := strings.TrimSpace(storeID)
		if normalizedStoreID == "" {
			continue
		}

		result = append(result, normalizedStoreID)
	}

	return result
}
