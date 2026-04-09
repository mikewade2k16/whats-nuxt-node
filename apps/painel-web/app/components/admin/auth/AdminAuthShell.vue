<script setup lang="ts">
import adminAuthBrandLogo from "~/assets/images/logo.png"

withDefaults(defineProps<{
  title: string
  description?: string
  cardWidth?: string
}>(), {
  description: '',
  cardWidth: '28rem'
})
</script>

<template>
  <div class="admin-auth-page">
    <div class="admin-auth-glow admin-auth-glow--left" />
    <div class="admin-auth-glow admin-auth-glow--right" />

    <section class="admin-auth-card" :style="{ '--admin-auth-card-width': cardWidth }">
      <div class="admin-auth-brand">
        <img :src="adminAuthBrandLogo" alt="Plataforma" class="admin-auth-brand__logo">

        <div class="admin-auth-brand__copy" style="display: none;">
          <span class="admin-auth-brand__name">Plataforma</span>
          <span class="admin-auth-brand__eyebrow">acesso administrativo</span>
        </div>
      </div>

      <header class="admin-auth-header">
        <h1 class="admin-auth-title">{{ title }}</h1>
        <p v-if="description" class="admin-auth-description">{{ description }}</p>
      </header>

      <slot />
    </section>
  </div>
</template>

<style>
.admin-auth-page {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 1rem;
  background:
    radial-gradient(circle at top left, rgba(108, 99, 255, 0.24), transparent 34%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.14), transparent 30%),
    linear-gradient(180deg, #0f1117 0%, #0b0d14 100%);
}

.admin-auth-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
  opacity: 0.36;
  pointer-events: none;
}

.admin-auth-glow--left {
  top: -5rem;
  left: -3rem;
  width: 18rem;
  height: 18rem;
  background: rgba(108, 99, 255, 0.34);
}

.admin-auth-glow--right {
  right: -4rem;
  bottom: -6rem;
  width: 20rem;
  height: 20rem;
  background: rgba(56, 189, 248, 0.24);
}

.admin-auth-card {
  position: relative;
  z-index: 1;
  width: min(100%, var(--admin-auth-card-width, 28rem));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgba(24, 27, 36, 0.96), rgba(15, 17, 23, 0.98));
  padding: 2.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(16px);
}

.admin-auth-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
}

.admin-auth-brand__logo {
  width: 120px;
  height: auto;
  max-width: min(100%, 12rem);
  flex-shrink: 0;
  object-fit: contain;
}

.admin-auth-brand__copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.admin-auth-brand__name {
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.admin-auth-brand__eyebrow {
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.admin-auth-header {
  display: grid;
  gap: 0.45rem;
  text-align: center;
}

.admin-auth-title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  color: #fff;
}

.admin-auth-description {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.58);
}

.admin-auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.admin-auth-field {
  position: relative;
}

.admin-auth-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  background: rgba(8, 10, 16, 0.88);
  color: #fff;
  font-size: 0.95rem;
  padding: 0.8rem 0.95rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.admin-auth-input::placeholder {
  color: rgba(255, 255, 255, 0.32);
}

.admin-auth-input:focus {
  border-color: rgba(124, 116, 255, 0.72);
  box-shadow: 0 0 0 3px rgba(124, 116, 255, 0.14);
  background: rgba(10, 12, 18, 0.96);
}

.admin-auth-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-auth-input--code {
  letter-spacing: 0.35em;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 700;
}

.admin-auth-field--password .admin-auth-input {
  padding-right: 2.9rem;
}

.admin-auth-eye-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.36);
  padding: 0.25rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.admin-auth-eye-btn:hover {
  color: rgba(255, 255, 255, 0.72);
}

.admin-auth-eye-btn svg {
  width: 1.1rem;
  height: 1.1rem;
}

.admin-auth-options,
.admin-auth-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.admin-auth-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.84rem;
  cursor: pointer;
  user-select: none;
}

.admin-auth-checkbox__check {
  width: 0.95rem;
  height: 0.95rem;
  accent-color: #6c63ff;
  cursor: pointer;
}

.admin-auth-link,
.admin-auth-action {
  color: rgba(255, 255, 255, 0.58);
  text-decoration: none;
  font-size: 0.84rem;
  transition: color 0.2s ease;
}

.admin-auth-link:hover,
.admin-auth-action:hover {
  color: rgba(255, 255, 255, 0.86);
}

.admin-auth-action {
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.admin-auth-alert {
  border-radius: 0.8rem;
  padding: 0.75rem 0.9rem;
  font-size: 0.88rem;
  line-height: 1.5;
}

.admin-auth-alert--error {
  border: 1px solid rgba(220, 38, 38, 0.32);
  background: rgba(220, 38, 38, 0.12);
  color: #fca5a5;
}

.admin-auth-alert--success {
  border: 1px solid rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
}

.admin-auth-alert--info {
  border: 1px solid rgba(56, 189, 248, 0.28);
  background: rgba(56, 189, 248, 0.1);
  color: #bae6fd;
}

.admin-auth-submit {
  width: 100%;
  min-height: 2.9rem;
  border: none;
  border-radius: 0.85rem;
  background: linear-gradient(135deg, #6c63ff 0%, #7c74ff 100%);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 14px 32px rgba(108, 99, 255, 0.28);
}

.admin-auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px rgba(108, 99, 255, 0.34);
}

.admin-auth-submit:disabled {
  opacity: 0.62;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.admin-auth-submit__spinner {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.34);
  border-top-color: #fff;
  animation: admin-auth-spin 0.7s linear infinite;
}

.admin-auth-meta {
  margin: 0;
  color: rgba(255, 255, 255, 0.38);
  font-size: 0.82rem;
  text-align: center;
  line-height: 1.5;
}

.admin-auth-code-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.admin-auth-fade-enter-active,
.admin-auth-fade-leave-active {
  transition: opacity 0.22s ease;
}

.admin-auth-fade-enter-from,
.admin-auth-fade-leave-to {
  opacity: 0;
}

@keyframes admin-auth-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .admin-auth-card {
    padding: 1.75rem 1.15rem;
  }

  .admin-auth-brand {
    gap: 0.75rem;
  }

  .admin-auth-brand__name {
    font-size: 1.2rem;
  }
}
</style>