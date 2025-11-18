// Configuração da API
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/.netlify/functions/api';

// Estado da aplicação
let updateInterval = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.addEventListener('click', loadData);
    
    loadData();
    // Após carregar, atualizar a cada 1 minuto (60000 ms)
    // O intervalo será iniciado após o primeiro carregamento bem-sucedido
});

// Carregar dados
async function loadData() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    
    loading.style.display = 'block';
    error.style.display = 'none';
    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
        tabsContainer.style.display = 'none';
    }
    
    try {
        // Timeout de 2 minutos (120 segundos) para dar tempo da busca paralela
        const controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), 120000);
        
        console.log('Buscando dados de:', `${API_BASE_URL}/dados`);
        
        const response = await fetch(`${API_BASE_URL}/dados`, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Dados recebidos:', data);
        
        if (!Array.isArray(data)) {
            throw new Error('Resposta da API não é um array');
        }
        
        loading.style.display = 'none';
        displayStations(data);
        updateLastUpdate();
        
        // Iniciar atualização automática a cada 1 minuto após carregamento bem-sucedido
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        updateInterval = setInterval(loadData, 60000); // 1 minuto
        
    } catch (err) {
        if (typeof timeoutId !== 'undefined') {
            clearTimeout(timeoutId);
        }
        console.error('Erro ao carregar dados:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
        
        let errorMessage = 'Erro desconhecido';
        if (err.name === 'AbortError') {
            errorMessage = 'Timeout: A requisição demorou muito para responder. Verifique sua conexão ou se a API está acessível.';
        } else if (err.message) {
            errorMessage = err.message;
        }
        
        error.innerHTML = `
            <p>❌ Erro ao carregar dados: ${errorMessage}</p>
            <p style="font-size: 12px; margin-top: 8px;">
                URL tentada: <code>${API_BASE_URL}/dados</code>
            </p>
            <p style="font-size: 12px; margin-top: 8px;">
                <button onclick="loadData()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    🔄 Tentar Novamente
                </button>
            </p>
        `;
    }
}

// Função: Verificar se estação está ativa (última leitura nos últimos 10 minutos)
function isEstacaoAtiva(station) {
    if (station.erro) return false;
    
    if (!station.timestamp) return false;
    
    const agora = new Date();
    const ultimaLeitura = new Date(station.timestamp);
    const diferencaMinutos = (agora - ultimaLeitura) / (1000 * 60); // Diferença em minutos
    
    return diferencaMinutos <= 10; // Ativa se última leitura foi há 10 minutos ou menos
}

// Função: Verificar se estação está desconectada (última leitura há mais de 30 minutos)
function isEstacaoDesconectada(station) {
    if (station.erro) return true; // Estações com erro são consideradas desconectadas
    
    if (!station.timestamp) return true;
    
    const agora = new Date();
    const ultimaLeitura = new Date(station.timestamp);
    const diferencaMinutos = (agora - ultimaLeitura) / (1000 * 60); // Diferença em minutos
    
    return diferencaMinutos > 30; // Desconectada se última leitura foi há mais de 30 minutos
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
    
    // Separar estações ativas (últimos 10 min) e desconectadas (+30 min)
    let activeStations = data.filter(station => isEstacaoAtiva(station));
    let disconnectedStations = data.filter(station => isEstacaoDesconectada(station));
    
    // Ordenar por data/hora (mais recente primeiro)
    activeStations = ordenarPorDataHora(activeStations);
    disconnectedStations = ordenarPorDataHora(disconnectedStations);
    
    // Atualizar contadores
    document.getElementById('count-active').textContent = activeStations.length;
    document.getElementById('count-disconnected').textContent = disconnectedStations.length;
    
    // Exibir estações ativas
    if (activeStations.length > 0) {
        activeContainer.innerHTML = activeStations.map(station => createStationCard(station, true)).join('');
    } else {
        activeContainer.innerHTML = '<div class="no-stations">Nenhuma estação ativa nos últimos 10 minutos</div>';
    }
    
    // Exibir estações desconectadas
    if (disconnectedStations.length > 0) {
        disconnectedContainer.innerHTML = disconnectedStations.map(station => createStationCard(station, false)).join('');
    } else {
        disconnectedContainer.innerHTML = '<div class="no-stations">Nenhuma estação desconectada</div>';
    }
    
    // Mostrar container de abas
    tabsContainer.style.display = 'block';
}

// Criar card da estação
function createStationCard(station, isActive = true) {
    // Formatar data no formato brasileiro: 17/11/2025, 16:22:25
    let timeStr = 'Data não disponível';
    if (station.timestamp) {
        const timestamp = new Date(station.timestamp);
        const dia = String(timestamp.getDate()).padStart(2, '0');
        const mes = String(timestamp.getMonth() + 1).padStart(2, '0');
        const ano = timestamp.getFullYear();
        const hora = String(timestamp.getHours()).padStart(2, '0');
        const minuto = String(timestamp.getMinutes()).padStart(2, '0');
        const segundo = String(timestamp.getSeconds()).padStart(2, '0');
        timeStr = `${dia}/${mes}/${ano}, ${hora}:${minuto}:${segundo}`;
    }
    
    return `
        <div class="station-card ${isActive ? 'active' : 'inactive'}">
            <div class="station-header">
                <div>
                    <div class="station-title">
                        <span class="station-status ${station.erro ? 'offline' : 'online'}"></span>
                        Estação Meteorológica
                    </div>
                </div>
                <div class="station-id">ID ${station.estacao_id}</div>
            </div>
            
            ${station.erro ? `
                <div class="error" style="margin-top: 16px;">
                    <p>⚠️ Erro: ${station.erro}</p>
                </div>
            ` : `
                <div class="sensors-grid">
                    <div class="sensor-item">
                        <div class="sensor-label">🌡️ Temperatura</div>
                        <div class="sensor-value">
                            <span>${station.temperatura.toFixed(1)}</span>
                            <span class="sensor-unit">°C</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">💧 Umidade</div>
                        <div class="sensor-value">
                            <span>${station.umidade.toFixed(1)}</span>
                            <span class="sensor-unit">%</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">📊 Pressão</div>
                        <div class="sensor-value">
                            <span>${station.pressao.toFixed(1)}</span>
                            <span class="sensor-unit">hPa</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🌬️ Vento</div>
                        <div class="sensor-value">
                            <span>${station.vento_velocidade.toFixed(1)}</span>
                            <span class="sensor-unit">km/h</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🧭 Direção</div>
                        <div class="sensor-value">
                            <span>${station.vento_direcao}°</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🔊 Ruído</div>
                        <div class="sensor-value">
                            <span>${station.ruido.toFixed(1)}</span>
                            <span class="sensor-unit">dB</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">☀️ Iluminância</div>
                        <div class="sensor-value">
                            <span>${station.iluminancia.toFixed(0)}</span>
                            <span class="sensor-unit">lux</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🌧️ Chuva Total</div>
                        <div class="sensor-value">
                            <span>${station.chuva_total.toFixed(1)}</span>
                            <span class="sensor-unit">mm</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🌫️ PM2.5</div>
                        <div class="sensor-value">
                            <span>${station.pm25.toFixed(0)}</span>
                            <span class="sensor-unit">μg/m³</span>
                        </div>
                    </div>
                    
                    <div class="sensor-item">
                        <div class="sensor-label">🌫️ PM10</div>
                        <div class="sensor-value">
                            <span>${station.pm10.toFixed(0)}</span>
                            <span class="sensor-unit">μg/m³</span>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <div style="font-size: 12px; color: var(--text-muted);">
                        📅 Última leitura: ${timeStr}
                    </div>
                </div>
            `}
        </div>
    `;
}

// Atualizar última atualização
function updateLastUpdate() {
    const lastUpdate = document.getElementById('lastUpdate');
    const now = new Date();
    lastUpdate.textContent = `Última atualização: ${now.toLocaleTimeString('pt-BR')}`;
}

