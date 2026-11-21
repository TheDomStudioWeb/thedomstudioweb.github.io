"""Descarga las siluetas de edificios de Overture Maps (OSM + Google + Microsoft)
para las ciudades de trabajo y las deja en ruta/edificios/ para DOMino Ruta.
Lo corre la tarea automática «Edificios 3D» (una vez por mes o a mano)."""
import json, os, subprocess, sys, urllib.request

ZONAS = [  # nombre, archivo, bbox (oeste, sur, este, norte)
    ("Gran Mendoza", "gran-mendoza.pmtiles", "-69.02,-33.16,-68.62,-32.76"),
    ("San Rafael", "san-rafael.pmtiles", "-68.42,-34.70,-68.26,-34.55"),
    ("Valle de Uco", "valle-de-uco.pmtiles", "-69.30,-33.78,-69.00,-33.30"),
    ("Gran San Juan", "gran-san-juan.pmtiles", "-68.66,-31.64,-68.40,-31.44"),
    ("San Luis", "san-luis.pmtiles", "-66.42,-33.37,-66.26,-33.24"),
    ("Neuquén y Cipolletti", "neuquen.pmtiles", "-68.26,-39.01,-67.90,-38.87"),
]
MAX_MB = 95  # GitHub no acepta archivos de más de 100 MB

def probar(url):
    try:
        req = urllib.request.Request(url, headers={"Range": "bytes=0-6"})
        return urllib.request.urlopen(req, timeout=30).read().startswith(b"PMTiles")
    except Exception:
        return False

rel = json.load(urllib.request.urlopen("https://stac.overturemaps.org/catalog.json", timeout=30))["latest"]
corto = rel.rsplit(".", 1)[0] if rel.count(".") else rel
cands = [
    f"https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/{rel}/buildings.pmtiles",
    f"https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/{corto}/buildings.pmtiles",
    f"https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/{corto}/buildings.pmtiles",
]
origen = next((u for u in cands if probar(u)), None)
if not origen:
    sys.exit(f"No encontré los edificios de Overture para la versión {rel}")
print("Versión Overture:", rel, "→", origen)

os.makedirs("ruta/edificios", exist_ok=True)
zonas = []
for nombre, archivo, bbox in ZONAS:
    destino = f"ruta/edificios/{archivo}"
    tmp = destino + ".tmp"
    r = subprocess.run(["./pmtiles", "extract", origen, tmp, f"--bbox={bbox}"], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(tmp):
        print("Falló", nombre, r.stderr[-500:]); continue
    mb = os.path.getsize(tmp) / 1e6
    if mb > MAX_MB:
        print(f"{nombre}: {mb:.0f} MB, demasiado grande; se omite"); os.remove(tmp); continue
    os.replace(tmp, destino)
    print(f"{nombre}: {mb:.1f} MB")
    zonas.append({"nombre": nombre, "archivo": archivo, "bbox": [float(x) for x in bbox.split(",")], "mb": round(mb, 1)})

if not zonas:
    sys.exit("No se pudo generar ninguna zona")
with open("ruta/edificios/indice.json", "w", encoding="utf-8") as f:
    json.dump({"fuente": "Overture Maps " + rel, "zonas": zonas}, f, ensure_ascii=False, indent=1)
