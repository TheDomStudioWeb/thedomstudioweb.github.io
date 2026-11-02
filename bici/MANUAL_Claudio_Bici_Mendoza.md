# Bicisendas Mendoza (prototipo) · Manual para Claudio

**Qué es:** una app web (PWA) para armar recorridos en bicicleta por el Gran Mendoza priorizando las bicisendas. Es un prototipo de uso propio de Daniel. Dirección: https://thedomstudioweb.github.io/bici/

## Cómo se usa
1. Se abre el mapa. La app descarga el trazado de las bicisendas (se guarda 14 días en el teléfono) y muestra cuántos kilómetros cargó en el botón de arriba.
2. Se elige el punto de partida (A) y el de llegada (B): escribiendo una dirección, tocando el mapa o con el botón GPS para usar la ubicación actual. Los marcadores se pueden arrastrar.
3. La app calcula dos recorridos: «Más segura» (prioriza ciclovías y evita calles) y «Más directa». Para cada uno muestra kilómetros, minutos, qué porcentaje va por ciclovía separada, carril bici, calle con bici compartida y calle común, y un nivel: Muy segura (70% o más por bicisenda), Con tramos de calle (40 a 70%) o Mucha calle compartida (menos de 40%).
4. El recorrido se dibuja con colores: verde oscuro ciclovía separada, verde claro carril bici, azul bici compartida y naranja calle común. Hay «Paso a paso» y un botón para abrirlo en Google Maps.
5. El botón «⇅» invierte el recorrido. Tocar el botón de arriba (Bicisendas) vuelve a descargar los datos si no se pudieron bajar.

## De dónde salen los datos
- Bicisendas: OpenStreetMap, consultadas con Overpass. Pueden faltar tramos o estar desactualizados.
- Cálculo del recorrido: servidor público de rutas Valhalla (valhalla1.openstreetmap.de), con perfil de bicicleta.
- Direcciones: Nominatim (OpenStreetMap). Mapa de fondo: OpenStreetMap (mosaicos públicos, para uso liviano).
- El nivel de seguridad lo calcula la app comparando el recorrido con las bicisendas cargadas (a menos de 15 metros). No es una garantía de seguridad: siempre hay que mirar el tránsito real.

## Límites del prototipo
- Depende de servicios públicos gratuitos con límites de uso. Para uso masivo habría que armar un servidor propio de rutas.
- No guarda recorridos favoritos ni reportes de puntos peligrosos; son ideas para una versión siguiente.
- Solo cubre el Gran Mendoza (recuadro desde Luján de Cuyo hasta Las Heras).
