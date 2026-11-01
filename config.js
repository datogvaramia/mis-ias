// =====================================================================
//  TU ÁRBOL DE IA
//  Aquí decides qué IAs salen en el selector y en "Mis cuentas".
//
//  - name:      nombre que se ve
//  - color:     color del punto
//  - prefixes:  de qué empresa se cogen los modelos en OpenRouter
//  - contains:  (opcional) solo modelos cuyo id contenga alguna de estas palabras
//  - plan:      tu plan (se ve en "Mis cuentas")
//  - url:       web oficial que se abre desde "Mis cuentas"
//
//  Los modelos de cada IA se cargan solos desde OpenRouter, así que
//  cuando salga uno nuevo aparecerá sin tocar nada.
// =====================================================================

window.CONFIG = {
  appName: "Mis IAs",

  providers: [
    {
      id: "chatgpt",
      name: "ChatGPT",
      color: "#10a37f",
      prefixes: ["openai/"],
      plan: "Plan gratuito",
      url: "https://chatgpt.com",
    },
    {
      id: "claude",
      name: "Claude",
      color: "#d97757",
      prefixes: ["anthropic/"],
      plan: "Claude Pro · 20 €/mes",
      url: "https://claude.ai",
    },
    {
      id: "gemini",
      name: "Gemini",
      color: "#4f8df7",
      prefixes: ["google/"],
      contains: ["gemini"],
      plan: "Google AI Pro · 21,99 €/mes",
      url: "https://gemini.google.com",
    },
    {
      id: "muse",
      name: "Muse",
      color: "#a855f7",
      prefixes: ["meta/", "meta-llama/"],
      contains: ["muse"],
      plan: "1.000 millones de tokens",
      url: "https://muse.ai",
    },
  ],
};
