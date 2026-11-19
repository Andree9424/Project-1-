# NEXUS Gaming

Proyecto con HTML, CSS, JavaScript y Node.js: catálogo de juegos, tráileres, comparador, carrito simulado y biblioteca personal.

## Abrir en VS Code

Necesitas Node.js 20.12 o posterior, Live Server e internet. No hay paquetes que instalar.

1. Abre esta carpeta en VS Code.
2. Pulsa **Ctrl+Shift+B** para iniciar los datos.
3. Abre `index.html` y pulsa **Go Live**.
4. Usa <http://127.0.0.1:5500>.

## Datos y guardado

Steam proporciona el catálogo y Epic sus promociones gratuitas. Para RAWG, copia `.env.example` como `.env`, añade tu clave de <https://rawg.io/apidocs> y reinicia el servidor. No publiques `.env`.

Las compras son ficticias, sin cobros ni licencias. Biblioteca, opiniones y recibos se guardan en este navegador y dirección. No se sincronizan entre dispositivos. Otras tiendas y sitios de reseñas se abren mediante enlaces de búsqueda. El catálogo depende de cada fuente.

`vendor/` incluye el reproductor de tráileres HLS y su licencia. `.vscode/` permite iniciar el proyecto con Live Server. Los demás archivos contienen la página y su servidor.

Para publicar consultas en directo necesitas alojamiento compatible con Node.js. GitHub Pages utiliza el catálogo guardado descrito abajo. Un enlace localhost solo funciona en tu equipo.

## Publicar en GitHub Pages

Sube todos los archivos y carpetas, incluida **data/**, a la raíz del repositorio. En GitHub Pages se activa automáticamente la edición con 76 juegos guardados: búsqueda dentro de esa selección, fichas, tráileres disponibles, comparador, compras simuladas y biblioteca local. Los datos no se actualizan automáticamente. La fecha de consulta aparece en la página; confirma precios y promociones en las tiendas.

En tu equipo, Live Server y el servidor Node.js siguen ofreciendo las consultas en directo. GitHub Pages solo ejecuta la edición con catálogo guardado y no necesita iniciar Node.js.

