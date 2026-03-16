<template>
  <div class="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
   <!-- Admin Header-->

    <main class="admin-main mx-auto w-full   pb-2 sm:px-6 lg:px-3">
      <section class="section-main min-h-[calc(100vh-6.5rem)] px-1 py-2 rounded-[var(--radius-lg)] ">
        <slot />
      </section>
    </main>
  </div>
</template>