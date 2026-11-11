# Cardmarket Helper

Helper personal para Pokémon TCG en Cardmarket. La versión estable 1.5.0 reúne Wants y Master Sets en una ventana con pestañas.

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
