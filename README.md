# Cardmarket Helper

Helper personal para Pokémon TCG en Cardmarket. La versión estable 1.6.1 reúne Wants y Master Sets en una ventana con pestañas.

## Instalación y actualización

1. Instala Tampermonkey en Chrome o Edge.
2. Abre [el instalador estable](https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.user.js).
3. Instala o actualiza Cardmarket Helper Loader y acepta los permisos de conexión que solicite Tampermonkey.
4. Si usabas Cardmarket Helper BETA Master Sets, desactívalo y deja activo el instalador estable.
5. Recarga Cardmarket.

El instalador mantiene el nombre y el namespace del Helper original. La beta tiene otra identidad en Tampermonkey, por lo que se desactiva por separado.

## Uso

La pestaña Wants permite cargar la lista de cartas deseadas. Master Sets detecta la expansión abierta, importa su checklist compatible de PokéCottage y la compara con tu CSV de TCGCollector por idioma y acabado.

Ambos modos comparten estado mínimo, límites de precio, portes por vendedor y el editor de portes. Master Sets permite buscar ofertas, recalcular el plan y añadir el lote de un vendedor al carrito tras comprobar de nuevo sus ofertas.

Las búsquedas y los planes de Master Sets se conservan durante 24 horas. El panel también se puede abrir desde el carrito. Cambiar el CSV o actualizar la checklist requiere una búsqueda nueva.

## Actualizaciones

Tampermonkey actualiza el instalador desde la rama main. Cada versión del instalador carga sus módulos desde un mismo commit para evitar mezclar versiones almacenadas en caché. El repositorio debe ser público para descargar esos archivos.

## Almacenamiento

Los vendedores, planes, el CSV importado y las checklists se guardan en IndexedDB. Las preferencias, los portes introducidos y el registro temporal de variantes procesadas para el carrito usan localStorage.

La versión estable conserva las claves de almacenamiento de la beta. Para mantener los datos, actualiza el instalador en el mismo navegador y perfil de Cardmarket.

## Portes del carrito existente

En Master Sets, **Actualizar portes desde el carrito** hace una sola lectura del carrito de Cardmarket, guarda los portes de los vendedores que ya estén allí y recalcula el plan con las ofertas guardadas. No añade ni retira cartas para estimar portes. Para vendedores ausentes del carrito se conserva el porte manual o estimado.

Las pruebas automáticas con cartas de la versión 1.6.0 se han retirado. Solo se conserva **Retirar carta de prueba pendiente** para resolver, mediante una acción explícita, una carta que hubiera quedado pendiente de esa versión. La lectura normal de portes nunca usa esa retirada.

El editor distingue portes observados, manuales y estimados. Los importes observados corresponden al carrito en el momento de la lectura y pueden variar al cambiar sus cantidades o el método de envío.

La lectura está probada con carritos simulados. La compatibilidad con el HTML de la sesión real debe comprobarse desde el navegador del usuario; si no reconoce el carrito, muestra el motivo.

## Pruebas

```sh
npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
NODE_PATH=/tmp/cmhelper-tests/node_modules node --test tests/shipping-probe.cjs
NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-shipping-calibration.cjs
NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/loader-release.cjs
```
