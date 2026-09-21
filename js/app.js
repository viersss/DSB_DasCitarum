/**
 * Dashboard Kerentanan Erosi DAS Citarum
 * Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMobileMenu();
    loadData();
});

let mlResults = null;
let geojsonData = null;
let map = null;
let geojsonLayer = null;
let metricsChart = null;
let importanceChart = null;

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');

            if (targetId === 'model-explorer' && map) {
                setTimeout(() => map.invalidateSize(), 150);
            }
            if (targetId === 'performance') {
                if (!metricsChart && mlResults) {
                    initMetricsChart(mlResults.metrics);
                } else if (metricsChart) {
                    setTimeout(() => metricsChart.resize(), 150);
                }
            }
            if (targetId === 'model-explorer') {
                if (!importanceChart && mlResults) {
                    const select = document.getElementById('modelSelect');
                    updateFeatureImportance(select.value);
                } else if (importanceChart) {
                    setTimeout(() => importanceChart.resize(), 150);
                }
            }

            // Close mobile menu
            document.getElementById('sidebar').classList.remove('open');
        });
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
}

/* --------------------------------------------------------------------------
   Data Loading
   -------------------------------------------------------------------------- */
async function loadData() {
    try {
        const mlResponse = await fetch('data/ml_results.json');
        if (!mlResponse.ok) throw new Error('ML Results not found');
        mlResults = await mlResponse.json();

        populateOverview(mlResults);
        populateMetricsTable(mlResults.metrics);

        // Check if performance tab is already active
        if (document.getElementById('performance').classList.contains('active')) {
            initMetricsChart(mlResults.metrics);
        }

        initMap();
        setupModelExplorer();

        try {
            const geoResponse = await fetch('data/subdas_citarum.geojson');
            if (geoResponse.ok) {
                geojsonData = await geoResponse.json();
                updateMap('Random Forest');
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
   Overview
   -------------------------------------------------------------------------- */
function populateOverview(data) {
    if (!data || !data.overview) return;
    const ov = data.overview;
    setText('jumlahSubdas', ov.Total_SubDAS);
    setText('paramDirect', ov.Param_Direct);
    setText('paramInverse', ov.Param_Inverse);

    // Update class distribution bar
    if (data.predictions && data.predictions.Actual_Class) {
        const classes = data.predictions.Actual_Class;
        const total = classes.length;
        const counts = { Tinggi: 0, Sedang: 0, Rendah: 0 };
        classes.forEach(c => { if (counts[c] !== undefined) counts[c]++; });

        const pct = k => ((counts[k] / total) * 100).toFixed(1) + '%';
        setWidth('segHigh', pct('Tinggi'));
        setWidth('segMedium', pct('Sedang'));
        setWidth('segLow', pct('Rendah'));
    }
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setWidth(id, w) { const el = document.getElementById(id); if (el) el.style.width = w; }

/* --------------------------------------------------------------------------
   Chart.js — Global Defaults
   -------------------------------------------------------------------------- */
function applyChartDefaults() {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 6;
    Chart.defaults.scale.grid = { color: '#f3f4f6', drawBorder: false };
    Chart.defaults.scale.ticks = { padding: 6 };
}

/* --------------------------------------------------------------------------
   Metrics Chart
   -------------------------------------------------------------------------- */
function initMetricsChart(metricsData) {
    applyChartDefaults();

    const canvas = document.getElementById('metricsChart');
    canvas.style.height = '280px';
    const ctx = canvas.getContext('2d');
    const models = Object.keys(metricsData);

    // Sort by F1 descending for chart readability
    models.sort((a, b) => metricsData[b]['F1-Score'] - metricsData[a]['F1-Score']);

    const f1    = models.map(m => metricsData[m]['F1-Score']);
    const prec  = models.map(m => metricsData[m]['Precision']);
    const rec   = models.map(m => metricsData[m]['Recall']);
    const acc   = models.map(m => metricsData[m]['Accuracy']);

    metricsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: models,
            datasets: [
                { label: 'F1-Score',  data: f1,   backgroundColor: '#3b82f6', borderRadius: 3, barPercentage: 0.7 },
                { label: 'Precision', data: prec, backgroundColor: '#8b5cf6', borderRadius: 3, barPercentage: 0.7 },
                { label: 'Recall',    data: rec,  backgroundColor: '#06b6d4', borderRadius: 3, barPercentage: 0.7 },
                { label: 'Accuracy',  data: acc,  backgroundColor: '#d1d5db', borderRadius: 3, barPercentage: 0.7 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 1.0, ticks: { stepSize: 0.2 } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 16 } },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f9fafb',
                    bodyColor: '#e5e7eb',
                    cornerRadius: 6,
                    padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}`
                    }
                }
            }
        }
    });
}

/* --------------------------------------------------------------------------
   Metrics Table
   -------------------------------------------------------------------------- */
function populateMetricsTable(metricsData) {
    const tbody = document.querySelector('#metricsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const models = Object.keys(metricsData).sort((a, b) =>
        metricsData[b]['F1-Score'] - metricsData[a]['F1-Score']
    );

    models.forEach((model, i) => {
        const m = metricsData[model];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${model}</strong></td>
            <td>${m['F1-Score'].toFixed(4)}</td>
            <td>${m['Precision'].toFixed(4)}</td>
            <td>${m['Recall'].toFixed(4)}</td>
            <td>${m['Accuracy'].toFixed(4)}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* --------------------------------------------------------------------------
   Model Explorer
   -------------------------------------------------------------------------- */
function setupModelExplorer() {
    const select = document.getElementById('modelSelect');
    
    // Feature importance will be initialized lazily on tab switch

    select.addEventListener('change', (e) => {
        const model = e.target.value;
        if (importanceChart || document.getElementById('model-explorer').classList.contains('active')) {
            updateFeatureImportance(model);
        }
        if (geojsonData) updateMap(model);
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
            importanceChart.data.labels = [];
            importanceChart.data.datasets[0].data = [];
            importanceChart.update();
        }
        return;
    }

    const fiData = mlResults.feature_importance[modelName];
    if (!fiData) return;

    if (subtitle) subtitle.textContent = `Top 5 parameter — ${modelName}`;

    const labels = fiData.map(d => d.Variable);
    const values = fiData.map(d => d.Importance);
    const canvas = document.getElementById('importanceChart');
    canvas.style.height = '190px';
    const ctx = canvas.getContext('2d');

    if (importanceChart) {
        importanceChart.data.labels = labels;
        importanceChart.data.datasets[0].data = values;
        importanceChart.update();
    } else {
        importanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: '#3b82f6',
                    borderRadius: 3,
                    barPercentage: 0.65
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                    y: { grid: { display: false } }
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
                weight: 0.8,
                opacity: 1,
                color: '#ffffff',
                fillOpacity: 0.82
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
        <div style="display:flex;height:100%;align-items:center;justify-content:center;text-align:center;padding:2rem;color:#9ca3af;font-size:0.85rem;">
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
        <div style="margin-bottom:0.875rem;">
            <div style="font-size:0.72rem;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.125rem;">Sub-DAS ID</div>
            <div style="font-size:1.35rem;font-weight:700;color:var(--blue-600);line-height:1;">${subdasId}</div>
        </div>
        <div class="detail-item">
            <span class="detail-label">Model Aktif</span>
            <span class="detail-value">${modelName}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Prediksi</span>
            <span class="detail-value" style="color:${colorFor(eroClass)}">${eroClass}</span>
        </div>
        <div style="margin-top:0.875rem;padding-top:0.75rem;border-top:1px dashed var(--gray-200);">
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
            html += `<div style="margin-top:0.75rem;padding:0.6rem 0.75rem;background:var(--color-high-bg);color:var(--color-high);border-radius:6px;font-size:0.75rem;line-height:1.4;">Prediksi tidak sesuai dengan target aktual.</div>`;
        } else {
            html += `<div style="margin-top:0.75rem;padding:0.6rem 0.75rem;background:var(--color-low-bg);color:var(--color-low);border-radius:6px;font-size:0.75rem;line-height:1.4;">Prediksi sesuai dengan target aktual.</div>`;
        }
    }

    container.innerHTML = html;
}
