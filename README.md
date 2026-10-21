# Cardmarket Helper

Helper personal para Pokemon TCG en Cardmarket.

## Instalacion con Tampermonkey

1. Instala Tampermonkey en Chrome/Edge.
2. Abre `cardmarket-helper.user.js` desde la URL raw del repositorio.
3. Tampermonkey ofrecera instalar el script.
4. Desde entonces el helper se cargara automaticamente en Cardmarket.

## Actualizaciones

El userscript apunta a este mismo repositorio mediante `@updateURL` y `@downloadURL`. Cuando se publique una version nueva en `main`, Tampermonkey podra detectar e instalar la actualizacion.

> Para que la actualizacion automatica funcione sin credenciales, el repositorio debe ser publico.

## Almacenamiento

Desde v5.4.28 los vendedores y el plan inteligente se almacenan en IndexedDB. `localStorage` queda reservado para preferencias y caches pequenas.
