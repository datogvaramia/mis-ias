# ✦ Mis IAs

Mi propia web para hablar con varias IAs desde un solo sitio.

- **Chat**: eliges la IA y el modelo en el selector de arriba (ChatGPT, Claude, Gemini y Muse) y chateas sin salir de la web. Funciona con [OpenRouter](https://openrouter.ai).
- **Mis cuentas**: accesos directos a la web oficial de cada IA para usar mis planes (ChatGPT gratis, Claude Pro, Google AI Pro y Muse).

## Cómo se usa

1. Abre la web y pulsa **Iniciar sesión con OpenRouter** (abajo a la izquierda).
2. Entra con tu cuenta de OpenRouter, acepta y vuelves solo a la web.
3. Elige IA y modelo arriba y escribe.

Los modelos marcados como **GRATIS** no gastan saldo. Para usar los demás, recarga saldo en [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits).

Las conversaciones y la sesión se guardan solo en tu navegador.

## Cambiar el árbol de IAs

Todo se configura en [`config.js`](config.js): nombre, color, plan y enlace de cada IA. Los modelos de cada una se cargan solos desde OpenRouter, así que cuando salgan modelos nuevos aparecerán sin tocar nada.

## Publicación

La web es solo HTML, CSS y JavaScript. Está publicada con GitHub Pages (Settings → Pages → rama `main`, carpeta `/root`).
