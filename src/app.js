// Configurações principais
const API_BASE_URL = 'https://iothub.eletromidia.com.br/api/v1/estacoes_mets';
const STATION_IDS = [2, 3, 7, 8];
const ACTIVE_THRESHOLD_MINUTES = 10;
const REFRESH_INTERVAL_MS = 30000; // 30 segundos

let updateInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.addEventListener('click', loadData);

    loadData();
});

async function loadData() {
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error');
    const tabsContainer = document.getElementById('tabs-container');

    loading.style.display = 'block';
    errorBox.style.display = 'none';
    tabsContainer.style.display = 'none';

    try {
        const stations = await fetchStations();

        loading.style.display = 'none';
        errorBox.style.display = 'none';

        displayStations(stations);
        updateLastUpdate();

        tabsContainer.style.display = 'block';

        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(loadData, REFRESH_INTERVAL_MS);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        loading.style.display = 'none';
        errorBox.style.display = 'block';
        errorBox.innerHTML = `
            <p>Erro ao carregar dados: ${error.message || 'Erro desconhecido'}</p>
            <p style="font-size: 12px; margin-top: 8px;">
                Fonte consultada: <code>${API_BASE_URL}</code>
            </p>
            <p style="font-size: 12px; margin-top: 8px;">
                <button onclick="loadData()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Tentar novamente
                </button>
            </p>
        `;
    }
}

async function fetchStations() {
    const requests = STATION_IDS.map(id => fetchStationData(id));
    const results = await Promise.allSettled(requests);

    return results.map((result, index) => {
        const estacaoId = STATION_IDS[index];
        if (result.status === 'fulfilled') {
            return result.value;
        }

        return {
            estacao_id: estacaoId,
            nome: `Estação ${estacaoId}`,
            erro: result.reason?.message || 'Erro ao buscar dados',
            timestamp: null
        };
    });
}

async function fetchStationData(estacaoId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`${API_BASE_URL}/${estacaoId}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return normalizeStationData(estacaoId, data);
    } catch (error) {
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeStationData(estacaoId, apiData) {
    const payload = apiData?.arrResponse || apiData;

    if (!payload) {
        return {
            estacao_id: estacaoId,
            nome: `Estação ${estacaoId}`,
            erro: 'Resposta inválida da API',
            timestamp: null
        };
    }

    const timestamp = extractTimestamp(payload);

    return {
        estacao_id: estacaoId,
        nome: payload.nome || `Estação ${estacaoId}`,
        localizacao: payload.localizacao || payload.local || null,
        timestamp,
        temperatura: extractNumber(payload.Temperatura || payload.temperatura),
        umidade: extractNumber(payload.Umidade || payload.umidade),
        pressao: extractNumber(payload['Pressão Atmosférica'] || payload.pressao),
        vento_velocidade: extractNumber(payload.Vento || payload.velocidade_vento),
        vento_direcao: extractNumber(payload['Direção do Vento'] || payload.direcao_vento),
        ruido: extractNumber(payload['Ruído'] || payload.ruido),
        iluminancia: extractNumber(payload.Luminosidade || payload.iluminancia),
        chuva_total: extractNumber(payload.Chuva || payload.precipitacao),
        pm25: extractNumber(payload['PM2.5'] || payload.pm25),
        pm10: extractNumber(payload.PM10 || payload.pm10),
        erro: null
    };
}

function extractTimestamp(payload) {
    const raw = payload['Última Leitura'] || payload.ultima_leitura || payload.lastReading;
    if (!raw) return null;

    if (raw.includes('T')) {
        return new Date(raw).toISOString();
    }

    // Formato esperado: DD/MM/YYYY HH:mm:ss
    const [datePart, timePart] = raw.split(' ');
    if (!datePart || !timePart) return null;

    const [day, month, year] = datePart.split('/');
    if (!day || !month || !year) return null;

    const isoString = `${year}-${month}-${day}T${timePart}`;
    const parsedDate = new Date(isoString);
    return isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function extractNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const match = value.toString().replace(',', '.').match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}

// Função: Verificar se estação está ativa (última leitura nos últimos 10 minutos)
function isEstacaoAtiva(station) {
    if (station.erro) return false;
    if (!station.timestamp) return false;

    const agora = Date.now();
    const ultimaLeitura = new Date(station.timestamp).getTime();
    const diferencaMinutos = (agora - ultimaLeitura) / (1000 * 60);

    return diferencaMinutos <= ACTIVE_THRESHOLD_MINUTES;
}

function isEstacaoDesconectada(station) {
    if (station.erro) return true;
    if (!station.timestamp) return true;

    return !isEstacaoAtiva(station);
}

// Função: Ordenar estações por data/hora (mais recente primeiro)
function ordenarPorDataHora(estacoes) {
    return estacoes.sort((a, b) => {
        // Comparar timestamps (mais recente primeiro)
        const dataA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dataB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        
        return dataB - dataA; // Ordem decrescente (mais recente primeiro)
    });
}

// Função: Trocar de aba (disponível globalmente)
window.switchTab = function(tabName) {
    // Remover classe active de todas as abas e conteúdos
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Ativar aba selecionada
    const tabButton = document.getElementById(`tab-${tabName}`);
    const tabContent = document.getElementById(`tab-content-${tabName}`);
    
    if (tabButton) tabButton.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
};

// Exibir estações
function displayStations(data) {
    const tabsContainer = document.getElementById('tabs-container');
    const activeContainer = document.getElementById('stations-active');
    const disconnectedContainer = document.getElementById('stations-disconnected');

    if (!data || data.length === 0) {
        tabsContainer.style.display = 'none';
        return;
    }

    const orderedData = ordenarPorDataHora([...data]);
    const activeStations = orderedData.filter(isEstacaoAtiva);
    const disconnectedStations = orderedData.filter(station => !isEstacaoAtiva(station));

    document.getElementById('count-active').textContent = activeStations.length;
    document.getElementById('count-disconnected').textContent = disconnectedStations.length;

    activeContainer.innerHTML = activeStations.length
        ? activeStations.map(station => createStationCard(station, true)).join('')
        : '<div class="no-stations">Nenhuma estação ativa nos últimos 10 minutos</div>';

    disconnectedContainer.innerHTML = disconnectedStations.length
        ? disconnectedStations.map(station => createStationCard(station, false)).join('')
        : '<div class="no-stations">Nenhuma estação desconectada</div>';

    tabsContainer.style.display = 'block';
}

// Criar card da estação
function createStationCard(station, isActive = true) {
    const timeStr = station.timestamp ? formatTimestamp(station.timestamp) : 'Data não disponível';

    if (station.erro) {
        return `
            <div class="station-card inactive">
                <div class="station-header">
                    <div class="station-title">
                        <span class="station-status offline"></span>
                        ${station.nome}
                    </div>
                    <div class="station-id">ID ${station.estacao_id}</div>
                </div>
                <div class="error" style="margin-top: 16px;">
                    <p>Erro: ${station.erro}</p>
                </div>
            </div>
        `;
    }

    return `
        <div class="station-card ${isActive ? 'active' : 'inactive'}">
            <div class="station-header">
                <div>
                    <div class="station-title">
                        <span class="station-status ${isActive ? 'online' : 'offline'}"></span>
                        ${station.nome}
                    </div>
                    ${station.localizacao ? `<div class="station-location">${station.localizacao}</div>` : ''}
                </div>
                <div class="station-id">ID ${station.estacao_id}</div>
            </div>

            <div class="sensors-grid">
                ${renderSensor('Temperatura', formatValue(station.temperatura, '°C'))}
                ${renderSensor('Umidade', formatValue(station.umidade, '%'))}
                ${renderSensor('Pressão', formatValue(station.pressao, 'hPa'))}
                ${renderSensor('Vento', formatValue(station.vento_velocidade, 'km/h'))}
                ${renderSensor('Direção', station.vento_direcao !== null ? `${station.vento_direcao}°` : '--')}
                ${renderSensor('Ruído', formatValue(station.ruido, 'dB'))}
                ${renderSensor('Iluminância', formatValue(station.iluminancia, 'lux', 0))}
                ${renderSensor('Chuva Total', formatValue(station.chuva_total, 'mm'))}
                ${renderSensor('PM2.5', formatValue(station.pm25, 'μg/m³', 0))}
                ${renderSensor('PM10', formatValue(station.pm10, 'μg/m³', 0))}
            </div>

            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                <div style="font-size: 12px; color: var(--text-muted);">
                    Última leitura: ${timeStr}
                </div>
            </div>
        </div>
    `;
}

function renderSensor(label, value) {
    return `
        <div class="sensor-item">
            <div class="sensor-label">${label}</div>
            <div class="sensor-value">
                <span>${value}</span>
            </div>
        </div>
    `;
}

function formatValue(value, unit = '', decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '--';
    }
    const formatted = value.toFixed(decimals);
    return unit ? `${formatted} ${unit}` : formatted;
}

function formatTimestamp(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Data não disponível';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Atualizar última atualização
function updateLastUpdate() {
    const lastUpdate = document.getElementById('lastUpdate');
    const now = new Date();
    lastUpdate.textContent = `Última atualização do dashboard: ${now.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })}`;
}

