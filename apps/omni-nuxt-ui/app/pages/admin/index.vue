<script setup lang="ts">
definePageMeta({
  layout: "admin"
});

const { user, clearSession } = useAuth();
const { clearSession: clearCoreSession } = useCoreAuth();

function logout() {
  clearSession();
  clearCoreSession();
  void navigateTo("/admin/login");
}
</script>

<template>
  <section class="admin-home">
    <header class="admin-home__header">
      <div>
        <p class="admin-home__eyebrow">Painel</p>
        <h1 class="admin-home__title">Bem-vindo ao admin</h1>
        <p class="admin-home__subtitle">
          Sessao ativa com <strong>{{ user?.email }}</strong> ({{ user?.role }})
        </p>
      </div>

      <UButton color="neutral" variant="soft" @click="logout">
        Sair
      </UButton>
    </header>

    <div class="admin-home__grid">
      <UCard>
        <template #header>
          <h2 class="admin-home__card-title">Atendimento</h2>
        </template>

        <p class="admin-home__card-text">
          Abrir inbox omnichannel para atendimento em tempo real.
        </p>

        <UButton to="/admin/omnichannel/inbox">
          Ir para Inbox
        </UButton>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="admin-home__card-title">Operacao</h2>
        </template>

        <p class="admin-home__card-text">
          Gerenciar tenants, usuarios e conexao WhatsApp.
        </p>

        <UButton color="secondary" to="/admin/omnichannel/operacao">
          Ir para Operacao
        </UButton>
      </UCard>
    </div>
  </section>
</template>

<style scoped>
.admin-home {
  display: grid;
  gap: 1rem;
}

.admin-home__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.admin-home__eyebrow {
  margin: 0;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
}

.admin-home__title {
  margin: 0.2rem 0 0;
}

.admin-home__subtitle {
  margin: 0.4rem 0 0;
  color: rgb(var(--muted));
}

.admin-home__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

.admin-home__card-title {
  margin: 0;
  font-size: 1.1rem;
}

.admin-home__card-text {
  margin-top: 0;
  color: rgb(var(--muted));
}
</style>
