# Manual interno · DOMino Ruta (navegación 3D)

> Para que Claudio pueda explicar la app. Hecho por The DOM Studio Web · WhatsApp 261-3431216 · https://thedomstudioweb.github.io/

## Qué es
DOMino Ruta es una app de navegación GPS en 3D, hecha por The DOM Studio Web. Funciona como PWA (se instala desde el navegador) en Android y en iPhone.
- Dirección: https://thedomstudioweb.github.io/ruta/
- Dentro del Hub de X5 aparece con el nombre **X5 Ruta**, en rojo X5.
- Se inspira en MapXplorer (Goldlab Pro), pero es liviana (pesa menos de 1 MB contra unos 450 MB), habla en voseo y no tiene publicidad ni suscripciones.

## Qué hace
1. **Mapa 3D**: edificios en 3D, relieve de montaña y vista inclinada. Tiene tres estilos: oscuro (el que viene por defecto), claro y satélite.
2. **Búsqueda**: busca direcciones y lugares de Mendoza, San Juan, San Luis y Neuquén. Se puede buscar por voz con el micrófono.
3. **Lugares cercanos**: botones rápidos para nafta, cajero, farmacia, café, gomería y estacionamiento.
4. **Marcar un punto**: si mantenés apretado el mapa, te arma un recorrido hasta ese punto.
5. **Recorrido**: muestra el más rápido y hasta 2 alternativas, con minutos, kilómetros y hora de llegada.
6. **Navegación giro a giro**: indicaciones con flecha y voz en voseo ("Doblá a la derecha…"), velocímetro, recálculo si te desviás y pantalla siempre encendida.
7. **Radares**: avisa con voz y vibración cuando hay un radar a menos de 450 m, y muestra la velocidad máxima. Los datos salen de OpenStreetMap, así que puede no tener todos los radares.
8. **Sin señal**: guarda los mapas de las zonas ya vistas. Para calcular o recalcular un recorrido sí necesita internet.

## Conexión con el Hub X5
- **Botón «🧭 Navegar»** en cada entrevista a domicilio: abre X5 Ruta con la dirección, el cliente y su teléfono (lo toma del lead vinculado). Al lado queda el botón «Google Maps» por si se prefiere.
- **Botón «🧭 Ruta del día»**: junta todas las entrevistas a domicilio pendientes de hoy, ordenadas por horario. En X5 Ruta se puede tocar «Ordenar por cercanía» para que arme el orden más corto desde donde estás.
- **«Voy en camino»**: abre WhatsApp con un mensaje para el cliente, en voseo, con los minutos y la hora estimada de llegada.
- **«Llegué»**: registra la hora de llegada. Al tocar «Volver al Hub», el Hub la anota sola en las observaciones de la entrevista («📍 Llegó al domicilio 10:41 · DOMino Ruta») y muestra un chip verde «Llegó 10:41». Si el vendedor estaba a más de 60 m, también anota la distancia.
- Se registra la hora de llegada, pero el estado de la entrevista (realizada, resultado) lo sigue cargando el vendedor a mano.

## Cómo se instala
- **Android**: abrir https://thedomstudioweb.github.io/ruta/ en Chrome → menú ⋮ → «Instalar app». Una vez instalada, los botones del Hub la abren directamente.
- **iPhone**: abrir el enlace en Safari → Compartir → «Agregar a inicio». Los botones del Hub la abren en Safari.
- Hay que dar permiso de ubicación (y conviene «Precisa»).

## Límites que hay que saber
- Como PWA, con la pantalla apagada deja de seguir el GPS. Por eso mantiene la pantalla encendida mientras navega: se usa con el teléfono en el soporte.
- Los servicios son públicos y gratuitos (Valhalla, Photon, Nominatim, Overpass, OpenFreeMap). Alcanzan para el equipo de X5, pero si se volviera masiva habría que pasar a un servidor propio.
- Los radares dependen de OpenStreetMap. Si falta alguno, se puede cargar en openstreetmap.org como «highway=speed_camera».

## Archivos (repo thedomstudioweb.github.io, carpeta /ruta)
- `index.html`: pantallas y estilos.
- `app.js`: lógica del mapa, la búsqueda, los recorridos, la navegación, los radares y la conexión con el Hub.
- `sw.js`: funcionamiento sin conexión. Al publicar cambios hay que subir el número de VERSION.
- `libs/`: MapLibre GL 4.7.1, guardado en el propio sitio.
- En el Hub (`crm.html`): funciones `rutaUrl`, `pintarRutaDia` y `procesarLlegadas`.

## Parámetros del enlace (para otras apps DOMino)
`/ruta/?destino=Texto&lat=&lng=&cliente=&id=&tel=&hora=&asesor=&volver=URL&marca=x5`
Para varias paradas: `?paradas=` con un JSON en base64url de la forma `[{c,d,lat,lng,id,t,h,ok}]`.
