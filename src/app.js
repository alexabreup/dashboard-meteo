// Configurações principais
const REMOTE_API_BASE_URL = 'https://iothub.eletromidia.com.br/api/v1/estacoes_mets';
const NETLIFY_API_PATH = '/api/dados';
const API_LOCATIONS = '/api/locations';
const isBrowser = typeof window !== 'undefined';
const currentHostname = isBrowser ? window.location.hostname : '';
const isNetlifyHost = Boolean(currentHostname && currentHostname.endsWith('netlify.app'));
const USE_NETLIFY_PROXY = isNetlifyHost || currentHostname === 'eletrometeorolgia.netlify.app';
const API_BASE_URL = USE_NETLIFY_PROXY ? NETLIFY_API_PATH : REMOTE_API_BASE_URL;
const MAX_STATION_ID = 50; // Limite máximo de IDs para testar
const ACTIVE_THRESHOLD_MINUTES = 10;
const REFRESH_INTERVAL_MS = 30000; // 30 segundos
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hora

let updateInterval = null;
let discoveredStationIds = null;
let locationsCache = {};
let locationsLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.addEventListener('click', loadData);

    const rescanBtn = document.getElementById('rescanBtn');
    if (rescanBtn) {
        rescanBtn.addEventListener('click', () => {
            clearCachedStationIds();
            loadData();
        });
    }

    loadData();
});

async function loadData() {
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error');
    const tabsContainer = document.getElementById('tabs-container');
    const discoveryStatus = document.getElementById('discovery-status');

    loading.style.display = 'block';
    errorBox.style.display = 'none';
    tabsContainer.style.display = 'none';
    
    if (discoveryStatus) {
        discoveryStatus.style.display = 'none';
    }

    try {
        // Descobrir estações se necessário
        if (!discoveredStationIds || discoveredStationIds.length === 0) {
            if (discoveryStatus) {
                discoveryStatus.style.display = 'block';
                discoveryStatus.textContent = '🔍 Buscando estações disponíveis...';
            }
            
            discoveredStationIds = await discoverAllStations();
            cacheStationIds(discoveredStationIds);
            
            if (discoveryStatus) {
                discoveryStatus.textContent = `✅ ${discoveredStationIds.length} estação(ões) encontrada(s)`;
                setTimeout(() => {
                    if (discoveryStatus) discoveryStatus.style.display = 'none';
                }, 3000);
            }
        }

        await loadLocations();
        const stations = await fetchStations();

        loading.style.display = 'none';
        errorBox.style.display = 'none';
        if (discoveryStatus) discoveryStatus.style.display = 'none';

        displayStations(stations);
        updateLastUpdate();

        tabsContainer.style.display = 'block';

        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(loadData, REFRESH_INTERVAL_MS);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        loading.style.display = 'none';
        errorBox.style.display = 'block';
        if (discoveryStatus) discoveryStatus.style.display = 'none';
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

// Funções de cache para IDs de estações
function getCachedStationIds() {
    if (!isBrowser) return null;
    
    try {
        const cached = localStorage.getItem('weather_station_ids');
        if (!cached) return null;

        const { ids, timestamp } = JSON.parse(cached);
        const now = Date.now();

        if (now - timestamp > CACHE_DURATION_MS) {
            return null; // Cache expirado
        }

        return ids;
    } catch (error) {
        console.warn('Erro ao ler cache de estações:', error);
        return null;
    }
}

function cacheStationIds(ids) {
    if (!isBrowser) return;
    
    try {
        localStorage.setItem('weather_station_ids', JSON.stringify({
            ids,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Erro ao salvar cache de estações:', error);
    }
}

function clearCachedStationIds() {
    if (!isBrowser) return;
    
    try {
        localStorage.removeItem('weather_station_ids');
        discoveredStationIds = null;
    } catch (error) {
        console.warn('Erro ao limpar cache de estações:', error);
    }
}

// Localizações das estações
async function loadLocations(force = false) {
    if (!isBrowser) {
        locationsLoaded = true;
        return locationsCache;
    }

    if (locationsLoaded && !force) {
        return locationsCache;
    }

    try {
        console.log('📍 Carregando localizações das estações...');
        const response = await fetch(API_LOCATIONS, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        locationsCache = await response.json();
        locationsLoaded = true;
        console.log(`✅ ${Object.keys(locationsCache).length} localizações carregadas`);
    } catch (error) {
        console.error('❌ Erro ao carregar localizações:', error);
        locationsCache = {};
        locationsLoaded = true;
    }

    return locationsCache;
}

function getLocationFromCache(stationId) {
    if (!stationId) {
        return {
            nome: `Estação ${stationId ?? '?'}`,
            endereco: null,
            latitude: null,
            longitude: null,
            mapsUrl: null
        };
    }

    const idKey = stationId.toString();
    const loc = locationsCache?.[idKey] || {};
    const endereco = (loc.endereco || '').trim();
    const latitude = (loc.latitude ?? '').toString().trim();
    const longitude = (loc.longitude ?? '').toString().trim();
    const hasCoordinates = latitude !== '' && longitude !== '';

    return {
        nome: loc.nome || `Estação ${idKey}`,
        endereco: endereco || null,
        latitude: hasCoordinates ? latitude : null,
        longitude: hasCoordinates ? longitude : null,
        mapsUrl: hasCoordinates ? `https://www.google.com/maps?q=${latitude},${longitude}` : null
    };
}

function decorateStationWithLocation(station = {}) {
    const estacaoId = station.estacao_id ?? station.id ?? null;
    if (!estacaoId) {
        return station;
    }

    const location = getLocationFromCache(estacaoId);
    const enderecoPreferencial = location.endereco && location.endereco.trim() !== '' ? location.endereco : null;

    return {
        ...station,
        estacao_id: estacaoId,
        nome: location.nome || station.nome || `Estação ${estacaoId}`,
        localizacao: enderecoPreferencial || station.localizacao || null,
        endereco: enderecoPreferencial || station.endereco || null,
        latitude: location.latitude || station.latitude || null,
        longitude: location.longitude || station.longitude || null,
        mapsUrl: location.mapsUrl || station.mapsUrl || null
    };
}

// Função: Descobrir todas as estações disponíveis
async function discoverAllStations() {
    // Tentar usar cache primeiro
    const cachedIds = getCachedStationIds();
    if (cachedIds && cachedIds.length > 0) {
        console.log(`Usando cache: ${cachedIds.length} estações encontradas`);
        return cachedIds;
    }

    // Se usar proxy Netlify, a descoberta já é feita no backend
    if (USE_NETLIFY_PROXY) {
        try {
            const response = await fetch(API_BASE_URL, {
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const ids = data
                        .map(s => s.estacao_id)
                        .filter(id => id != null)
                        .sort((a, b) => a - b);
                    return ids;
                }
            }
        } catch (error) {
            console.warn('Erro ao buscar estações via proxy:', error);
        }
    }

    // Busca direta na API: testar IDs de 1 até MAX_STATION_ID
    const validStations = [];
    const CONSECUTIVE_FAILURES_LIMIT = 5;
    let consecutiveFailures = 0;

    // Criar batches para não sobrecarregar a API
    const batchSize = 10;
    const batches = [];
    
    for (let start = 1; start <= MAX_STATION_ID; start += batchSize) {
        const end = Math.min(start + batchSize - 1, MAX_STATION_ID);
        batches.push({ start, end });
    }

    for (const batch of batches) {
        const promises = [];
        
        for (let id = batch.start; id <= batch.end; id++) {
            // Verificação leve: apenas checar se a estação existe (HEAD ou GET simples)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            promises.push(
                fetch(`${REMOTE_API_BASE_URL}/${id}`, {
                    method: 'HEAD',
                    signal: controller.signal
                })
                    .then(res => {
                        clearTimeout(timeoutId);
                        return { id, success: res.ok };
                    })
                    .catch(() => {
                        clearTimeout(timeoutId);
                        return { id, success: false };
                    })
            );
        }

        const results = await Promise.allSettled(promises);

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { id, success } = result.value;
                if (success) {
                    validStations.push(id);
                    consecutiveFailures = 0;
                } else {
                    consecutiveFailures++;
                    if (consecutiveFailures >= CONSECUTIVE_FAILURES_LIMIT && validStations.length > 0) {
                        // Se já encontramos algumas estações e temos muitas falhas consecutivas, parar
                        console.log(`Parando busca após ${CONSECUTIVE_FAILURES_LIMIT} falhas consecutivas`);
                        return validStations.sort((a, b) => a - b);
                    }
                }
            }
        }

        // Pequeno delay entre batches para não sobrecarregar
        if (batch.end < MAX_STATION_ID) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(`Descoberta concluída: ${validStations.length} estações encontradas`);
    return validStations.sort((a, b) => a - b);
}

async function fetchStations() {
    if (USE_NETLIFY_PROXY) {
        return fetchStationsViaProxy();
    }

    // Usar IDs descobertos ou descobrir agora
    if (!discoveredStationIds || discoveredStationIds.length === 0) {
        discoveredStationIds = await discoverAllStations();
        cacheStationIds(discoveredStationIds);
    }

    if (discoveredStationIds.length === 0) {
        return [];
    }

    const requests = discoveredStationIds.map(id => fetchStationData(id));
    const results = await Promise.allSettled(requests);

    return results.map((result, index) => {
        const estacaoId = discoveredStationIds[index];
        if (result.status === 'fulfilled') {
            return result.value;
        }

        return decorateStationWithLocation({
            estacao_id: estacaoId,
            nome: `Estação ${estacaoId}`,
            erro: result.reason?.message || 'Erro ao buscar dados',
            timestamp: null
        });
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
        const normalized = normalizeStationData(estacaoId, data);
        return decorateStationWithLocation(normalized);
    } catch (error) {
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchStationsViaProxy() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch(API_BASE_URL, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Resposta inválida do proxy');
        }

        return data.map(payload => decorateStationWithLocation(normalizeProxyStationData(payload)));
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

function normalizeProxyStationData(payload) {
    if (!payload) {
        return {
            estacao_id: null,
            nome: 'Estação desconhecida',
            erro: 'Resposta vazia do proxy',
            timestamp: null
        };
    }

    if (payload.erro) {
        return {
            estacao_id: payload.estacao_id || null,
            nome: payload.nome || `Estação ${payload.estacao_id || '?'}`,
            erro: payload.erro,
            timestamp: payload.timestamp || null
        };
    }

    return {
        estacao_id: payload.estacao_id || null,
        nome: payload.nome || `Estação ${payload.estacao_id || '?'}`,
        localizacao: payload.localizacao || null,
        timestamp: payload.timestamp || null,
        temperatura: payload.temperatura ?? null,
        umidade: payload.umidade ?? null,
        pressao: payload.pressao ?? null,
        vento_velocidade: payload.vento_velocidade ?? null,
        vento_direcao: payload.vento_direcao ?? null,
        ruido: payload.ruido ?? null,
        iluminancia: payload.iluminancia ?? null,
        chuva_total: payload.chuva_total ?? null,
        pm25: payload.pm25 ?? null,
        pm10: payload.pm10 ?? null,
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
    const stationsCount = document.getElementById('stations-count');

    if (!data || data.length === 0) {
        tabsContainer.style.display = 'none';
        if (stationsCount) stationsCount.textContent = '0';
        return;
    }

    const orderedData = ordenarPorDataHora([...data]);
    const activeStations = orderedData.filter(isEstacaoAtiva);
    const disconnectedStations = orderedData.filter(station => !isEstacaoAtiva(station));

    document.getElementById('count-active').textContent = activeStations.length;
    document.getElementById('count-disconnected').textContent = disconnectedStations.length;
    
    if (stationsCount) {
        stationsCount.textContent = data.length;
    }

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

    const locationSection = `
        <div class="station-location-block">
            <p class="location-label">📍 Localização:</p>
            <p class="station-location-text">${station.localizacao || '-'}</p>
            ${station.mapsUrl ? `
                <a href="${station.mapsUrl}" target="_blank" rel="noopener noreferrer" class="maps-link">
                    🗺️ Ver no Google Maps
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
            ` : ''}
        </div>
    `;

    return `
        <div class="station-card ${isActive ? 'active' : 'inactive'}">
            <div class="station-header">
                <div>
                    <div class="station-title">
                        <span class="station-status ${isActive ? 'online' : 'offline'}"></span>
                        ${station.nome}
                    </div>
                </div>
                <div class="station-id">ID ${station.estacao_id}</div>
            </div>

            ${locationSection}

            <div style="margin-top: 12px; margin-bottom: 16px;">
                <h4 style="margin: 0; font-size: 1.1rem; font-weight: 500; color: var(--text-primary);">
                    Última leitura: ${timeStr}
                </h4>
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
    // Formato: 18/11/2025, 14:35
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
    const lastScanTime = document.getElementById('last-scan-time');
    const now = new Date();
    
    const timeStr = now.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    lastUpdate.textContent = `Última atualização do dashboard: ${timeStr}`;
    
    if (lastScanTime) {
        lastScanTime.textContent = timeStr;
    }
}

// Função global para forçar nova descoberta
window.forceDiscoverStations = function() {
    clearCachedStationIds();
    loadData();
};

