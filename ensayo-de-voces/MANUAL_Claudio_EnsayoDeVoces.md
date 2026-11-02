# Manual interno: Ensayo de Voces

## Qué es
Una herramienta de The DOM Studio Web para que cantantes solistas o en dúo practiquen con canciones grabadas. Separa una canción en voz 1 (la grave), voz 2 (la aguda) y música, y muestra una guía de notas.

## Cómo está armada
- **Motor (en la computadora):** recibe la canción y genera un paquete `.zip` con tres audios (voz1.mp3, voz2.mp3, instrumental.mp3), un archivo `guia.json` con las notas y la partitura (partitura.pdf y partitura.musicxml). La partitura también queda suelta en la carpeta «paquetes».
- **App (en el celular):** una página web que abre ese `.zip`. No procesa nada: solo reproduce y muestra.
- **No usa servicios de inteligencia artificial en internet.** Los modelos corren en la computadora, sin conexión y sin costo por uso.

## Cómo separa las voces
1. Un modelo separa la voz de la música.
2. Un detector de tono identifica qué nota suena en cada momento.
3. Un modelo de huella de voz reconoce el timbre de cada cantante y agrupa los momentos en dos personas.
4. Cuando el timbre es claro, ese momento completo va a un cantante. Cuando cantan juntos, se reparten los armónicos de cada nota.
5. El usuario puede corregir tramos a mano: los marca en la app y el motor rehace las pistas.

## Qué se puede hacer en la app
- **Abrir canción:** carga el `.zip` del motor.
- **Mezclador:** prende o apaga cada pista y ajusta su volumen. Hay combinaciones rápidas: Todo, Solo música, Solo voces, Solo voz 1, Solo voz 2, Música + voz 1 y Música + voz 2. En iPhone el volumen individual no se puede cambiar, pero prender y apagar sí funciona.
- **Reproducir, retroceder 5 segundos y cambiar la velocidad** (normal, un poco más lento, lento) sin que cambie el tono.
- **Tono guía:** toca con un sonido simple las notas de la voz que se practica.
- **Repetir frase:** repite en bucle la frase que está sonando.
- **Guía de notas:** gráfico tipo piano con las notas en el tiempo. Se elige qué voz se practica y muestra la nota actual, la próxima y la que canta la otra voz.
- **Mapa de la canción:** muestra quién canta en cada momento. Se toca para saltar.
- **Registro:** dice el tipo de voz aproximado de cada parte y entre qué notas se mueve cómoda.
- **Frases:** lista de frases con sus notas principales, si sube o baja, y si se canta sola o junto a la otra voz (con el intervalo).
- **Partitura:** muestra la tonalidad, el compás y el tempo, con dos botones: «Abrir partitura (PDF)» para verla, imprimirla o compartirla, y «Bajar para MuseScore» para corregirla en esa app. Es una transcripción automática: las notas son confiables y el ritmo conviene revisarlo.
- **Marcar errores:** marcar inicio y fin de un tramo mal separado, elegir de quién es y copiar la lista para el motor.

## Pasos para el usuario
1. En la computadora, arrastrar la canción sobre `procesar_windows.bat`.
2. Mandar el `.zip` de la carpeta `paquetes` al celular como documento.
3. Abrir la app, tocar «Abrir canción» y practicar.

## Convenciones
- Las notas se nombran Do, Re, Mi, Fa, Sol, La, Si. **Do4 es el Do central del piano.**
- Voz 1 es siempre la más grave y voz 2 la más aguda.

## Cómo arma la partitura
1. Detecta el pulso de la canción en la pista de música y el tiempo fuerte de cada compás.
2. Pasa cada nota detectada de segundos a tiempos y la ajusta a la semicorchea más cercana.
3. Estima la tonalidad con todas las notas y escribe la armadura.
4. Escribe un pentagrama por voz: la grave en clave de sol octavada y la aguda en clave de sol.
Por defecto usa compás de 4/4; con la opción `--compas 2` o `--compas 3` se cambia a 2/4 o 3/4.

## Limitaciones
- Cuando cantan a la vez puede quedar algo de una voz en la otra.
- El tipo de voz es aproximado.
- En la partitura, el ritmo es aproximado: al cantar se estiran y se adornan las frases. Se corrige en MuseScore.
- La partitura no incluye la letra.
- Procesar una canción de 5 minutos tarda entre 5 y 10 minutos la primera vez en una PC común.

Hecho por The DOM Studio Web.
