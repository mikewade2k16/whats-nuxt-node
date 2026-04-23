package auth

import (
	"context"
	"time"
)

const (
	DemoTenantID   = "tenant-demo"
	StoreRiomarID  = "loja-pj-riomar"
	StoreJardinsID = "loja-pj-jardins"
)

type User struct {
	ID                 string
	DisplayName        string
	Email              string
	PasswordHash       string
	MustChangePassword bool
	AvatarPath         string
	Role               Role
	TenantID           string
	StoreIDs           []string
	Active             bool
	CreatedAt          time.Time
}

type UserView struct {
	ID                 string   `json:"id"`
	DisplayName        string   `json:"displayName"`
	Email              string   `json:"email"`
	AvatarPath         string   `json:"avatarPath,omitempty"`
	MustChangePassword bool     `json:"mustChangePassword"`
	Role               Role     `json:"role"`
	TenantID           string   `json:"tenantId,omitempty"`
	StoreIDs           []string `json:"storeIds,omitempty"`
	Active             bool     `json:"active"`
}

type Principal struct {
	UserID      string
	DisplayName string
	Email       string
	Role        Role
	TenantID    string
	StoreIDs    []string
	ExpiresAt   time.Time
}

type LoginInput struct {
	Email    string
	Password string
}

type SessionView struct {
	AccessToken string    `json:"accessToken"`
	TokenType   string    `json:"tokenType"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

type LoginResult struct {
	User    UserView    `json:"user"`
	Session SessionView `json:"session"`
}

type UserRepository interface {
	FindByEmail(ctx context.Context, email string) (User, error)
	FindByID(ctx context.Context, id string) (User, error)
	UpdateProfile(ctx context.Context, userID string, displayName string, email string) (User, error)
	UpdatePassword(ctx context.Context, userID string, passwordHash string, mustChangePassword bool) (User, error)
	UpdateAvatarPath(ctx context.Context, userID string, avatarPath string) (User, error)
}

type PasswordHasher interface {
	Hash(password string) (string, error)
	Verify(hash, password string) error
}

type TokenManager interface {
	Issue(user User) (SessionView, error)
	Parse(token string) (Principal, error)
}

func (user User) View() UserView {
	return UserView{
		ID:                 user.ID,
		DisplayName:        user.DisplayName,
		Email:              user.Email,
		AvatarPath:         user.AvatarPath,
		MustChangePassword: user.MustChangePassword,
		Role:               user.Role,
		TenantID:           user.TenantID,
		StoreIDs:           append([]string{}, user.StoreIDs...),
		Active:             user.Active,
	}
}

type UpdateProfileInput struct {
	DisplayName string
	Email       string
}

type ChangePasswordInput struct {
	CurrentPassword string
	NewPassword     string
}

type UpdateAvatarInput struct {
	FileName    string
	ContentType string
	Content     []byte
}

type AvatarStorage interface {
	Save(ctx context.Context, userID string, fileName string, contentType string, content []byte, previousPath string) (string, error)
}
