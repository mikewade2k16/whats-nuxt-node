package consultants

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) ListByStore(ctx context.Context, storeID string) ([]Consultant, error) {
	rows, err := repository.pool.Query(ctx, consultantSelectQuery()+`
		where c.store_id = $1::uuid
			and c.is_active = true
		order by c.name asc;
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	consultants := make([]Consultant, 0)
	for rows.Next() {
		consultant, err := scanConsultant(rows)
		if err != nil {
			return nil, err
		}

		consultants = append(consultants, consultant)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return consultants, nil
}

func (repository *PostgresRepository) FindByID(ctx context.Context, consultantID string) (Consultant, error) {
	consultant, err := scanConsultant(repository.pool.QueryRow(ctx, consultantSelectQuery()+`
		where c.id = $1::uuid
		limit 1;
	`, consultantID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Consultant{}, ErrConsultantNotFound
		}

		return Consultant{}, err
	}

	return consultant, nil
}

func (repository *PostgresRepository) SyncLinkedIdentity(ctx context.Context, userID string, name string, initials string) error {
	_, err := repository.pool.Exec(ctx, `
		update consultants
		set
			name = $2,
			initials = $3,
			updated_at = now()
		where user_id = $1::uuid
			and is_active = true;
	`, userID, strings.TrimSpace(name), strings.TrimSpace(initials))
	return err
}

func (repository *PostgresRepository) Create(ctx context.Context, consultant Consultant) (Consultant, error) {
	var createdID string
	err := repository.pool.QueryRow(ctx, `
		insert into consultants (
			tenant_id,
			store_id,
			name,
			role_label,
			initials,
			color,
			monthly_goal,
			commission_rate,
			conversion_goal,
			avg_ticket_goal,
			pa_goal,
			is_active
		)
		values (
			$1::uuid,
			$2::uuid,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12
		)
		returning id::text;
	`,
		consultant.TenantID,
		consultant.StoreID,
		consultant.Name,
		defaultRoleLabel(consultant.RoleLabel),
		consultant.Initials,
		consultant.Color,
		consultant.MonthlyGoal,
		consultant.CommissionRate,
		consultant.ConversionGoal,
		consultant.AvgTicketGoal,
		consultant.PAGoal,
		consultant.Active,
	).Scan(&createdID)
	if err != nil {
		if isConsultantNameConflict(err) {
			return Consultant{}, ErrConsultantConflict
		}

		return Consultant{}, err
	}

	return repository.FindByID(ctx, createdID)
}

func (repository *PostgresRepository) Delete(ctx context.Context, consultantID string) error {
	_, err := repository.pool.Exec(ctx, `
		delete from consultants
		where id = $1::uuid
			and user_id is null;
	`, consultantID)
	return err
}

func (repository *PostgresRepository) Update(ctx context.Context, consultant Consultant) (Consultant, error) {
	var updatedID string
	err := repository.pool.QueryRow(ctx, `
		update consultants
		set
			name = $2,
			role_label = $3,
			initials = $4,
			color = $5,
			monthly_goal = $6,
			commission_rate = $7,
			conversion_goal = $8,
			avg_ticket_goal = $9,
			pa_goal = $10,
			updated_at = now()
		where id = $1::uuid
		returning id::text;
	`,
		consultant.ID,
		consultant.Name,
		defaultRoleLabel(consultant.RoleLabel),
		consultant.Initials,
		consultant.Color,
		consultant.MonthlyGoal,
		consultant.CommissionRate,
		consultant.ConversionGoal,
		consultant.AvgTicketGoal,
		consultant.PAGoal,
	).Scan(&updatedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Consultant{}, ErrConsultantNotFound
		}
		if isConsultantNameConflict(err) {
			return Consultant{}, ErrConsultantConflict
		}

		return Consultant{}, err
	}

	return repository.FindByID(ctx, updatedID)
}

func (repository *PostgresRepository) Archive(ctx context.Context, consultantID string) error {
	var archivedID string
	err := repository.pool.QueryRow(ctx, `
		update consultants
		set
			is_active = false,
			updated_at = now()
		where id = $1::uuid
			and is_active = true
		returning id::text;
	`, consultantID).Scan(&archivedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConsultantNotFound
		}

		return err
	}

	return nil
}

func consultantSelectQuery() string {
	return `
		select
			c.id::text,
			c.tenant_id::text,
			c.store_id::text,
			coalesce(c.user_id::text, '') as user_id,
			coalesce(lower(u.email), '') as access_email,
			coalesce(u.is_active, false) as access_active,
			c.name,
			c.role_label,
			c.initials,
			c.color,
			c.monthly_goal,
			c.commission_rate,
			c.conversion_goal,
			c.avg_ticket_goal,
			c.pa_goal,
			c.is_active,
			c.created_at,
			c.updated_at
		from consultants c
		left join users u on u.id = c.user_id
	`
}

func scanConsultant(row pgx.Row) (Consultant, error) {
	var consultant Consultant
	err := row.Scan(
		&consultant.ID,
		&consultant.TenantID,
		&consultant.StoreID,
		&consultant.UserID,
		&consultant.AccessEmail,
		&consultant.AccessActive,
		&consultant.Name,
		&consultant.RoleLabel,
		&consultant.Initials,
		&consultant.Color,
		&consultant.MonthlyGoal,
		&consultant.CommissionRate,
		&consultant.ConversionGoal,
		&consultant.AvgTicketGoal,
		&consultant.PAGoal,
		&consultant.Active,
		&consultant.CreatedAt,
		&consultant.UpdatedAt,
	)
	if err != nil {
		return Consultant{}, err
	}

	consultant.UserID = strings.TrimSpace(consultant.UserID)
	consultant.AccessEmail = strings.ToLower(strings.TrimSpace(consultant.AccessEmail))
	consultant.Name = strings.TrimSpace(consultant.Name)
	consultant.RoleLabel = defaultRoleLabel(consultant.RoleLabel)
	consultant.Color = strings.TrimSpace(consultant.Color)

	return consultant, nil
}

func defaultRoleLabel(roleLabel string) string {
	trimmed := strings.TrimSpace(roleLabel)
	if trimmed == "" {
		return "Atendimento"
	}

	return trimmed
}

func isConsultantNameConflict(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505" && pgErr.ConstraintName == "consultants_store_name_active_uidx"
	}

	return false
}

func isAccessEmailConflict(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505" && pgErr.ConstraintName == "users_email_lower_uidx"
	}

	return false
}
