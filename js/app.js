/**
 * Dashboard Kerentanan Erosi DAS Citarum
 * Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

let mlResults = null;
let geojsonData = null;
let map = null;
let geojsonLayer = null;
let importanceChart = null;

/* --------------------------------------------------------------------------
   Data Loading
   -------------------------------------------------------------------------- */
async function loadData() {
    try {
        const mlResponse = await fetch('data/ml_results.json');
        if (!mlResponse.ok) throw new Error('ML Results not found');
        mlResults = await mlResponse.json();

        initMap();
        setupModelExplorer();

        try {
            const geoResponse = await fetch('data/subdas_citarum.geojson');
            if (geoResponse.ok) {
                geojsonData = await geoResponse.json();
                const initialModel = document.getElementById('modelSelect').value;
                updateMap(initialModel);
                updateFeatureImportance(initialModel);
            } else {
                showMapPlaceholder('Data GeoJSON (subdas_citarum.geojson) belum tersedia di folder data/.');
            }
        } catch (e) {
            showMapPlaceholder('Gagal memuat GeoJSON. Pastikan file berada di data/subdas_citarum.geojson');
        }

    } catch (error) {
        console.error('Error loading data:', error);
    }
}

/* --------------------------------------------------------------------------
   Model Explorer
   -------------------------------------------------------------------------- */
function setupModelExplorer() {
    // applyChartDefaults removed to avoid Chart.js v4 compatibility issues.
    
    const select = document.getElementById('modelSelect');
    select.addEventListener('change', (e) => {
        const model = e.target.value;
        updateFeatureImportance(model);
        if (geojsonData) updateMap(model);
        
        // Reset detail panel
        const container = document.getElementById('detailSubdas');
        container.innerHTML = `<div class="empty-state">Klik salah satu Sub-DAS pada peta untuk melihat detail prediksinya.</div>`;
    });
}

/* --------------------------------------------------------------------------
   Feature Importance Chart
   -------------------------------------------------------------------------- */
function updateFeatureImportance(modelName) {
    const subtitle = document.getElementById('fiSubtitle');

    if (modelName === 'Actual_Class') {
        if (subtitle) subtitle.textContent = 'Tidak tersedia untuk Target Aktual';
        if (importanceChart) {
            importanceChart.destroy();
            importanceChart = null;
        }
        return;
    }

    const fiData = mlResults.feature_importance[modelName];
    if (!fiData) return;

    if (subtitle) subtitle.textContent = `Top 5 parameter — ${modelName}`;

    const labels = fiData.map(d => d.Variable);
    const values = fiData.map(d => d.Importance);
    const canvas = document.getElementById('importanceChart');
    const ctx = canvas.getContext('2d');

    if (importanceChart) {
        importanceChart.data.labels = labels;
        importanceChart.data.datasets[0].data = values;
        importanceChart.update();
    } else {
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.color = '#9ca3af';

        importanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: '#3b82f6',
                    borderRadius: 4,
                    barPercentage: 0.65
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                scales: {
                    x: { 
                        beginAtZero: true, 
                        grid: { color: '#f3f4f6' },
                        border: { display: false }
                    },
                    y: { 
                        grid: { display: false },
                        border: { display: false }
                    }
                }
            }
        });
    }
}

/* --------------------------------------------------------------------------
   Leaflet Map
   -------------------------------------------------------------------------- */
function initMap() {
    map = L.map('map', { zoomControl: true }).setView([-6.9, 107.6], 9);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);
    
    // Ensure map resizes correctly within flex container
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
    
    window.addEventListener('resize', () => {
        if (map) map.invalidateSize();
    });
}

function updateMap(modelName) {
    if (!geojsonData || !mlResults) return;

    const predictions = mlResults.predictions;
    const subdasIds = predictions.SubDAS_ID;
    const currentPreds = predictions[modelName];

    const classMap = {};
    for (let i = 0; i < subdasIds.length; i++) {
        classMap[String(subdasIds[i])] = currentPreds[i];
    }

    if (geojsonLayer) map.removeLayer(geojsonLayer);

    geojsonLayer = L.geoJSON(geojsonData, {
        style(feature) {
            const id = String(getSubdasID(feature));
            const cls = classMap[id] || 'Unknown';
            return {
                fillColor: colorFor(cls),
                weight: 1,
                opacity: 1,
                color: '#ffffff',
                fillOpacity: 0.85
            };
        },
        onEachFeature(feature, layer) {
            const id = String(getSubdasID(feature));
            const cls = classMap[id] || 'Tidak ada data';

            layer.bindTooltip(
                `<strong>Sub-DAS ${id}</strong><br/>Kerentanan: ${cls}`,
                { sticky: true, direction: 'top', offset: [0, -8] }
            );

            layer.on({
                click: () => showSubdasDetail(id, cls, modelName),
                mouseover: (e) => {
                    e.target.setStyle({ weight: 2, color: '#1f2937', fillOpacity: 0.95 });
                    e.target.bringToFront();
                },
                mouseout: (e) => { geojsonLayer.resetStyle(e.target); }
            });
        }
    }).addTo(map);

    if (geojsonLayer.getBounds().isValid()) {
        map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
    }
}

function showMapPlaceholder(msg) {
    const el = document.getElementById('map');
    el.innerHTML = `
        <div style="display:flex;height:100%;align-items:center;justify-content:center;text-align:center;padding:2rem;color:#9ca3af;font-size:0.9rem;">
            <p>${msg}</p>
        </div>`;
}

function getSubdasID(feature) {
    const p = feature.properties;
    return p.SubDAS_ID ?? p.value ?? p.fid ?? p.ID ?? 'Unknown';
}

function colorFor(cls) {
    return ({ Tinggi: '#dc2626', Sedang: '#d97706', Rendah: '#059669' })[cls] || '#d1d5db';
}

/* --------------------------------------------------------------------------
   Detail Panel
   -------------------------------------------------------------------------- */
function showSubdasDetail(subdasId, eroClass, modelName) {
    const container = document.getElementById('detailSubdas');
    const idx = mlResults.predictions.SubDAS_ID.findIndex(id => String(id) === String(subdasId));

    if (idx === -1) {
        container.innerHTML = `<div class="empty-state">Data tidak ditemukan untuk ID ${subdasId}</div>`;
        return;
    }

    const cpVal = mlResults.predictions.Cp[idx].toFixed(2);
    const actualClass = mlResults.predictions.Actual_Class[idx];
    const isCorrect = eroClass === actualClass;
    const isActual = modelName === 'Actual_Class';

    let html = `
        <div style="margin-bottom:1rem;">
            <div style="font-size:0.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.25rem;">Sub-DAS ID</div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--blue-600);line-height:1;">${subdasId}</div>
        </div>
        <div class="detail-item">
            <span class="detail-label">Model Aktif</span>
            <span class="detail-value">${modelName}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Prediksi</span>
            <span class="detail-value" style="color:${colorFor(eroClass)}">${eroClass}</span>
        </div>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px dashed var(--gray-200);">
            <div class="detail-item">
                <span class="detail-label">Target Aktual</span>
                <span class="detail-value">${actualClass}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Nilai Cp</span>
                <span class="detail-value">${cpVal}</span>
            </div>
        </div>`;

    if (!isActual) {
        if (!isCorrect) {
            html += `<div style="margin-top:1rem;padding:0.75rem;background:var(--color-high-bg);color:var(--color-high);border-radius:6px;font-size:0.8rem;line-height:1.5;">Prediksi tidak sesuai dengan target aktual.</div>`;
        } else {
            html += `<div style="margin-top:1rem;padding:0.75rem;background:var(--color-low-bg);color:var(--color-low);border-radius:6px;font-size:0.8rem;line-height:1.5;">Prediksi sesuai dengan target aktual.</div>`;
        }
    }

    container.innerHTML = html;
}
