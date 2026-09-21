# Dashboard Morfometri DAS Citarum

## Struktur folder

dashboard_citarum/
│
├── index.html
│
├── css/
│   └── style.css
│
├── js/
│   └── app.js
│
└── data/
    ├── morfometric_citarum.xlsx
    └── subdas_citarum.geojson

## Cara menggunakan

1. Masukkan file Excel ke:
   data/morfometric_citarum.xlsx

2. Masukkan GeoJSON Sub-DAS Citarum ke:
   data/subdas_citarum.geojson

3. Pastikan GeoJSON mempunyai atribut ID yang sesuai dengan:
   SubDAS_ID

4. Jalankan melalui local server, bukan dengan membuka index.html
   langsung dari file explorer.

Contoh menggunakan VS Code:
- Install extension Live Server.
- Klik kanan index.html.
- Pilih "Open with Live Server".

Atau gunakan Python:
python -m http.server 8000

Kemudian buka:
http://localhost:8000

## Catatan

Excel digunakan sebagai sumber data morfometri.

GeoJSON digunakan sebagai geometri peta.

Keduanya di-join menggunakan SubDAS_ID.

Jika nama field ID pada GeoJSON berbeda, ubah fungsi
getSubdasID() di js/app.js.

DONE YEY