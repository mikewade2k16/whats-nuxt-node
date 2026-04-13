package auth

import (
	"context"
	crand "crypto/rand"
	"crypto/tls"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	defaultPasswordResetTTL      = 15 * time.Minute
	passwordResetCodeDigits      = 6
	maxPasswordResetCodeAttempts = 5
	smtpDialTimeout              = 10 * time.Second
)

type SMTPConfig struct {
	Host      string
	Port      int
	Username  string
	Password  string
	FromEmail string
	FromName  string
}

type passwordResetRecord struct {
	ID        string
	UserID    string
	Email     string
	CodeHash  string
	Attempts  int
	ExpiresAt time.Time
}

func (s *Service) RequestPasswordReset(ctx context.Context, input PasswordResetRequestInput) error {
	email := normalizePasswordResetEmail(input.Email)
	if email == "" {
		return ErrUnauthorized
	}
	if !s.isPasswordResetAvailable() {
		return fmt.Errorf("%w: smtp not configured", ErrPasswordResetUnavailable)
	}

	user, err := s.findUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUnauthorized) {
			return nil
		}
		return err
	}

	code, err := generatePasswordResetCode()
	if err != nil {
		return fmt.Errorf("generate password reset code: %w", err)
	}

	resetID, err := s.storePasswordResetCode(ctx, user, code, input)
	if err != nil {
		return err
	}

	message := buildPasswordResetEmailMessage(s.smtpConfig, user, email, code, s.passwordResetTTL)
	if err := s.sendMail(s.smtpConfig, []string{email}, message); err != nil {
		s.revokePasswordResetCode(ctx, resetID)
		return fmt.Errorf("%w: %v", ErrPasswordResetUnavailable, err)
	}

	return nil
}

func (s *Service) ConfirmPasswordReset(ctx context.Context, input PasswordResetConfirmInput) error {
	email := normalizePasswordResetEmail(input.Email)
	code := normalizePasswordResetCode(input.Code)
	if email == "" || code == "" {
		return ErrPasswordResetCodeInvalid
	}

	reset, err := s.findLatestPendingPasswordReset(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPasswordResetCodeInvalid
		}
		return err
	}

	now := s.now().UTC()
	if !reset.ExpiresAt.After(now) {
		_ = s.markPasswordResetStatus(ctx, reset.ID, "expired")
		return ErrPasswordResetCodeExpired
	}

	if reset.CodeHash != hashToken(code) {
		if err := s.registerPasswordResetAttempt(ctx, reset); err != nil {
			return err
		}
		return ErrPasswordResetCodeInvalid
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(input.NewPassword)), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password reset password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin password reset tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	if _, err = tx.Exec(
		ctx,
		`UPDATE users
		 SET password_hash = $2,
		     updated_at = now()
		 WHERE id = $1`,
		reset.UserID,
		string(passwordHash),
	); err != nil {
		return fmt.Errorf("update password after reset: %w", err)
	}

	if _, err = tx.Exec(
		ctx,
		`UPDATE user_sessions
		 SET status = 'revoked'
		 WHERE user_id = $1
		   AND status = 'active'`,
		reset.UserID,
	); err != nil {
		return fmt.Errorf("revoke sessions after password reset: %w", err)
	}

	if _, err = tx.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET status = 'used',
		     used_at = now(),
		     updated_at = now()
		 WHERE id = $1`,
		reset.ID,
	); err != nil {
		return fmt.Errorf("mark password reset as used: %w", err)
	}

	if _, err = tx.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET status = 'revoked',
		     updated_at = now()
		 WHERE user_id = $1
		   AND status = 'pending'
		   AND id <> $2`,
		reset.UserID,
		reset.ID,
	); err != nil {
		return fmt.Errorf("revoke stale password resets: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit password reset tx: %w", err)
	}

	return nil
}

func (s *Service) isPasswordResetAvailable() bool {
	return strings.TrimSpace(s.smtpConfig.Host) != "" &&
		s.smtpConfig.Port > 0 &&
		strings.TrimSpace(s.smtpConfig.FromEmail) != ""
}

func (s *Service) storePasswordResetCode(ctx context.Context, user userRecord, code string, input PasswordResetRequestInput) (string, error) {
	if _, err := s.pool.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET status = 'revoked',
		     updated_at = now()
		 WHERE user_id = $1
		   AND status = 'pending'`,
		user.ID,
	); err != nil {
		return "", fmt.Errorf("revoke prior password reset codes: %w", err)
	}

	var resetID string
	if err := s.pool.QueryRow(
		ctx,
		`INSERT INTO auth_password_resets (user_id, email, code_hash, requested_ip, requested_user_agent, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		user.ID,
		user.Email,
		hashToken(code),
		nullableIP(input.RemoteIP),
		nullableString(input.UserAgent),
		s.now().UTC().Add(s.passwordResetTTL),
	).Scan(&resetID); err != nil {
		return "", fmt.Errorf("insert password reset code: %w", err)
	}

	return resetID, nil
}

func (s *Service) revokePasswordResetCode(ctx context.Context, resetID string) {
	_, _ = s.pool.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET status = 'revoked',
		     updated_at = now()
		 WHERE id = $1`,
		resetID,
	)
}

func (s *Service) findLatestPendingPasswordReset(ctx context.Context, email string) (passwordResetRecord, error) {
	var record passwordResetRecord
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, user_id, email::text, code_hash, attempts, expires_at
		 FROM auth_password_resets
		 WHERE email = $1
		   AND status = 'pending'
		 ORDER BY created_at DESC
		 LIMIT 1`,
		email,
	).Scan(&record.ID, &record.UserID, &record.Email, &record.CodeHash, &record.Attempts, &record.ExpiresAt)
	if err != nil {
		return passwordResetRecord{}, err
	}

	return record, nil
}

func (s *Service) registerPasswordResetAttempt(ctx context.Context, record passwordResetRecord) error {
	nextAttempts := record.Attempts + 1
	status := "pending"
	if nextAttempts >= maxPasswordResetCodeAttempts {
		status = "expired"
	}

	if _, err := s.pool.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET attempts = $2,
		     status = $3,
		     updated_at = now()
		 WHERE id = $1`,
		record.ID,
		nextAttempts,
		status,
	); err != nil {
		return fmt.Errorf("update password reset attempt: %w", err)
	}

	return nil
}

func (s *Service) markPasswordResetStatus(ctx context.Context, resetID, status string) error {
	_, err := s.pool.Exec(
		ctx,
		`UPDATE auth_password_resets
		 SET status = $2,
		     updated_at = now()
		 WHERE id = $1`,
		resetID,
		status,
	)
	if err != nil {
		return fmt.Errorf("mark password reset status: %w", err)
	}

	return nil
}

func normalizePasswordResetEmail(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func normalizePasswordResetCode(value string) string {
	var builder strings.Builder
	for _, char := range strings.TrimSpace(value) {
		if char >= '0' && char <= '9' {
			builder.WriteRune(char)
		}
	}
	if builder.Len() > passwordResetCodeDigits {
		return builder.String()[:passwordResetCodeDigits]
	}
	return builder.String()
}

func generatePasswordResetCode() (string, error) {
	const maxCodeValue = 1000000
	randomValue, err := crand.Int(crand.Reader, bigInt(maxCodeValue))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", randomValue.Int64()), nil
}

func buildPasswordResetEmailMessage(cfg SMTPConfig, user userRecord, recipientEmail, code string, ttl time.Duration) []byte {
	fromHeader := strings.TrimSpace(cfg.FromEmail)
	if strings.TrimSpace(cfg.FromName) != "" {
		fromHeader = fmt.Sprintf("%s <%s>", sanitizeMailHeader(cfg.FromName), cfg.FromEmail)
	}

	minutes := int(ttl / time.Minute)
	if minutes <= 0 {
		minutes = int(defaultPasswordResetTTL / time.Minute)
	}

	name := strings.TrimSpace(user.Name)
	if name == "" {
		name = "usuario"
	}

	body := fmt.Sprintf(
		"Ola, %s.\r\n\r\nRecebemos uma solicitacao para redefinir sua senha na Plataforma.\r\n\r\nCodigo de verificacao: %s\r\nValidade: %d minutos\r\n\r\nSe voce nao fez essa solicitacao, ignore este email.\r\n",
		name,
		code,
		minutes,
	)

	message := strings.Join([]string{
		fmt.Sprintf("From: %s", fromHeader),
		fmt.Sprintf("To: %s", sanitizeMailHeader(recipientEmail)),
		"Subject: Plataforma - codigo para redefinir senha",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		body,
	}, "\r\n")

	return []byte(message)
}

func defaultSendMail(cfg SMTPConfig, recipients []string, message []byte) error {
	if strings.TrimSpace(cfg.Host) == "" || cfg.Port <= 0 || strings.TrimSpace(cfg.FromEmail) == "" {
		return ErrPasswordResetUnavailable
	}

	client, conn, err := openSMTPClient(cfg)
	if err != nil {
		return err
	}
	defer conn.Close()

	var auth smtp.Auth
	if strings.TrimSpace(cfg.Username) != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
		if err := client.Auth(auth); err != nil {
			_ = client.Close()
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(cfg.FromEmail); err != nil {
		_ = client.Close()
		return fmt.Errorf("smtp mail from: %w", err)
	}

	for _, recipient := range recipients {
		if err := client.Rcpt(recipient); err != nil {
			_ = client.Close()
			return fmt.Errorf("smtp rcpt to %s: %w", recipient, err)
		}
	}

	writer, err := client.Data()
	if err != nil {
		_ = client.Close()
		return fmt.Errorf("smtp data: %w", err)
	}

	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		_ = client.Close()
		return fmt.Errorf("smtp write message: %w", err)
	}

	if err := writer.Close(); err != nil {
		_ = client.Close()
		return fmt.Errorf("smtp close message: %w", err)
	}

	if err := client.Quit(); err != nil {
		_ = client.Close()
		return fmt.Errorf("smtp quit: %w", err)
	}

	return nil
}

func openSMTPClient(cfg SMTPConfig) (*smtp.Client, net.Conn, error) {
	address := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS12,
		ServerName: cfg.Host,
	}

	var (
		conn net.Conn
		err  error
	)

	if usesImplicitSMTPTLS(cfg.Port) {
		conn, err = tls.DialWithDialer(&net.Dialer{Timeout: smtpDialTimeout}, "tcp", address, tlsConfig)
		if err != nil {
			return nil, nil, fmt.Errorf("smtp tls dial: %w", err)
		}
	} else {
		conn, err = net.DialTimeout("tcp", address, smtpDialTimeout)
		if err != nil {
			return nil, nil, fmt.Errorf("smtp dial: %w", err)
		}
	}

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("smtp new client: %w", err)
	}

	if !usesImplicitSMTPTLS(cfg.Port) {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(tlsConfig); err != nil {
				_ = client.Close()
				_ = conn.Close()
				return nil, nil, fmt.Errorf("smtp starttls: %w", err)
			}
		}
	}

	return client, conn, nil
}

func usesImplicitSMTPTLS(port int) bool {
	return port == 465
}

func sanitizeMailHeader(value string) string {
	replacer := strings.NewReplacer("\r", "", "\n", "")
	return replacer.Replace(strings.TrimSpace(value))
}

func bigInt(value int64) *big.Int {
	return big.NewInt(value)
}
