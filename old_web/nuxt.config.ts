export default defineNuxtConfig({
  ssr: false,
  modules: ["@pinia/nuxt", "@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  devtools: {
    enabled: false
  },
  runtimeConfig: {
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE ?? process.env.API_INTERNAL_BASE ?? "http://api:4000",
    gifProvider: process.env.NUXT_GIF_PROVIDER ?? "tenor",
    tenorApiKey: process.env.NUXT_TENOR_API_KEY ?? "",
    tenorBaseUrl: process.env.NUXT_TENOR_BASE_URL ?? "https://tenor.googleapis.com/v2",
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:4000"
    }
  }
});
