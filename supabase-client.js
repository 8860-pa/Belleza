(() => {
  const config = window.BELLEZA_SUPABASE_CONFIG;
  if (!config || (!config.url && !config.publishableKey)) {
    window.BELLEZA_SUPABASE = null;
    return;
  }
  if (!config.url || !config.publishableKey) {
    window.BELLEZA_SUPABASE_ERROR = "Both the Supabase project URL and publishable key are required.";
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    window.BELLEZA_SUPABASE_ERROR = "The Supabase client library did not load.";
    return;
  }
  window.BELLEZA_SUPABASE = window.supabase.createClient(config.url, config.publishableKey);
})();
