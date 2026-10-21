# Cardmarket Helper

Helper personal para Pokemon TCG en Cardmarket.

## Instalacion con Tampermonkey

1. Instala Tampermonkey en Chrome/Edge.
2. Abre `cardmarket-helper.user.js` desde la URL raw del repositorio.
3. Tampermonkey ofrecera instalar el loader.
4. Desde entonces, al abrir Cardmarket, el loader consulta `manifest.json` y carga automaticamente la version publicada del helper.

## Actualizaciones

No hace falta descargar ni volver a instalar cada version del helper. Cuando se publique una version nueva en este repositorio, se actualizan el manifest y el payload remoto; el loader instalado la cargara automaticamente en la siguiente apertura de Cardmarket.

> Para que el navegador pueda leer los archivos raw sin autenticacion, el repositorio debe ser publico.

## Almacenamiento

Desde v5.4.28 los vendedores y el plan inteligente se almacenan en IndexedDB. `localStorage` queda reservado para preferencias y caches pequenas.
