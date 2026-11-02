# Bicisendas Mendoza (prototipo) · Manual para Claudio

**Qué es:** una app web (PWA) para armar recorridos en bicicleta por el Gran Mendoza priorizando las bicisendas. Es un prototipo de uso propio de Daniel. Dirección: https://thedomstudioweb.github.io/bici/

## Cómo se usa
1. Se abre el mapa. La app descarga el trazado de las bicisendas (se guarda 14 días en el teléfono) y muestra cuántos kilómetros cargó en el botón de arriba.
2. Se elige el punto de partida (A) y el de llegada (B): escribiendo una dirección, tocando el mapa o con el botón GPS para usar la ubicación actual. Los marcadores se pueden arrastrar.
3. La app calcula dos recorridos: «Más segura» (prioriza ciclovías y evita calles) y «Más directa». Para cada uno muestra kilómetros, minutos, qué porcentaje va por ciclovía separada, carril bici, calle con bici compartida y calle común, y un nivel: Muy segura (70% o más por bicisenda), Con tramos de calle (40 a 70%) o Mucha calle compartida (menos de 40%).
4. El recorrido se dibuja con colores: verde oscuro ciclovía separada, verde claro carril bici, azul bici compartida y naranja calle común. Mientras hay un recorrido dibujado, las demás bicisendas se ven muy tenues para no confundir. Hay «Paso a paso» y un botón para abrirlo en Google Maps: el enlace lleva hasta 8 puntos intermedios (esquinas y desvíos clave) para que Google siga el mismo camino, pero Google puede ajustar tramos entre punto y punto.
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

## Recorrido en vivo («Iniciar recorrido»)
- Después de calcular el recorrido, el botón «Iniciar recorrido» activa el GPS del teléfono (el navegador pide permiso de ubicación) y pasa a una pantalla de navegación: arriba la próxima maniobra con su flecha y la distancia, en el mapa el punto azul de la posición, y abajo los kilómetros y minutos que faltan.
- El mapa sigue la posición. Si se arrastra el mapa con el dedo aparece «Centrar» para volver a seguir.
- Si la persona se sale del camino (más de 40 metros durante unos segundos), la app recalcula desde la posición actual con el mismo tipo de recorrido (segura o directa).
- «Voz» lee en voz alta las indicaciones cuando faltan unos 100 metros. Queda recordada en el teléfono. Depende de la voz en español que tenga el teléfono.
- Mantiene la pantalla encendida mientras dura el recorrido (donde el navegador lo permite). Si se bloquea la pantalla o se pasa a otra app, el navegador puede detener el GPS y el seguimiento se corta.
- Al llegar (a menos de unos 25 metros del destino) termina solo. «Terminar» lo corta cuando se quiera.
- Es un prototipo: conviene mirar siempre el tránsito real y no depender solo de la pantalla mientras se pedalea. Usar el teléfono en un soporte de manubrio.
