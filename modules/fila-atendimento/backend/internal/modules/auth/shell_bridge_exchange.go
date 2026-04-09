package auth

import (
	"context"
	"strings"
)

type ShellBridgeExchangeService struct {
	claims      *ShellBridgeTokenManager
	provisioner *ShellBridgeProvisioner
	tokens      TokenManager
}

func NewShellBridgeExchangeService(claims *ShellBridgeTokenManager, provisioner *ShellBridgeProvisioner, tokens TokenManager) *ShellBridgeExchangeService {
	if claims == nil || provisioner == nil || tokens == nil {
		return nil
	}

	return &ShellBridgeExchangeService{
		claims:      claims,
		provisioner: provisioner,
		tokens:      tokens,
	}
}

func (service *ShellBridgeExchangeService) Enabled() bool {
	return service != nil && service.claims != nil && service.provisioner != nil && service.tokens != nil
}

func (service *ShellBridgeExchangeService) Exchange(ctx context.Context, bridgeToken string) (LoginResult, error) {
	if !service.Enabled() {
		return LoginResult{}, ErrShellBridgeDisabled
	}

	claims, err := service.claims.Parse(strings.TrimSpace(bridgeToken))
	if err != nil {
		return LoginResult{}, err
	}

	user, err := service.provisioner.Provision(ctx, claims)
	if err != nil {
		return LoginResult{}, err
	}
	if !user.Active {
		return LoginResult{}, ErrUserInactive
	}

	session, err := service.tokens.Issue(user)
	if err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		User:    user.View(),
		Session: session,
	}, nil
}
