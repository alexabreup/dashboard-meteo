# 🚀 IMPLEMENTAÇÃO: Sistema de Localização JSON + Netlify Functions

## OBJETIVO
Criar sistema de localização para estações meteorológicas usando arquivo JSON local com capacidade de edição via Netlify Functions.

---

## PARTE 1: CRIAR ESTRUTURA DE ARQUIVOS

### 1.1 Criar `dashboard/data/locations.json`
```json
{
  "1": {
    "nome": "Estação Centro",
    "endereco": "",
    "latitude": "",
    "longitude": ""
  },
  "2": {
    "nome": "Estação Norte",
    "endereco": "",
    "latitude": "",
    "longitude": ""
  },
  "3": {
    "nome": "Estação Sul",
    "endereco": "",
    "latitude": "",
    "longitude": ""
  },
  "7": {
    "nome": "Estação Oeste",
    "endereco": "",
    "latitude": "",
    "longitude": ""
  },
  "8": {
    "nome": "Estação Leste",
    "endereco": "",
    "latitude": "",
    "longitude": ""
  }
}
```

### 1.2 Criar `netlify/functions/locations.js`
```javascript
const fs = require('fs');
const path = require('path');

// Caminho para o arquivo JSON (ajustar conforme estrutura do projeto)
const LOCATIONS_FILE = path.join(process.cwd(), 'dashboard', 'data', 'locations.json');

// Função auxiliar para ler o arquivo
function readLocations() {
  try {
    const data = fs.readFileSync(LOCATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler locations.json:', error);
    return {};
  }
}

// Função auxiliar para escrever no arquivo
function writeLocations(data) {
  try {
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao escrever locations.json:', error);
    return false;
  }
}

exports.handler = async (event, context) => {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Responder OPTIONS para CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // GET - Retornar todas as localizações ou uma específica
  if (event.httpMethod === 'GET') {
    const locations = readLocations();
    
    // Se tiver parâmetro ?id=X, retorna apenas essa estação
    const id = event.queryStringParameters?.id;
    if (id) {
      const location = locations[id];
      if (location) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ id, ...location })
        };
      } else {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Estação não encontrada' })
        };
      }
    }
    
    // Retorna todas as localizações
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(locations)
    };
  }

  // POST/PUT - Atualizar localização
  if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
    try {
      const { id, nome, endereco, latitude, longitude } = JSON.parse(event.body);
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'ID da estação é obrigatório' })
        };
      }

      const locations = readLocations();
      
      // Atualizar ou criar nova localização
      locations[id] = {
        nome: nome || `Estação ${id}`,
        endereco: endereco || '',
        latitude: latitude || '',
        longitude: longitude || ''
      };

      const success = writeLocations(locations);
      
      if (success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Localização atualizada com sucesso',
            data: locations[id]
          })
        };
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Erro ao salvar localização' })
        };
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Dados inválidos', details: error.message })
      };
    }
  }

  // Método não suportado
  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Método não permitido' })
  };
};
```

### 1.3 Atualizar `netlify.toml`
```toml
[build]
  publish = "dashboard"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/locations/*"
  to = "/.netlify/functions/locations/:splat"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
```

---

## PARTE 2: MODIFICAR `dashboard/src/app.js`

### 2.1 Adicionar Constantes no Início
```javascript
// APIs
const API_IOT = 'https://iothub.eletromidia.com.br/api/v1/estacoes_mets';
const API_LOCATIONS = '/api/locations'; // Netlify Function

// Cache de localizações
let locationsCache = {};
```

### 2.2 Criar Função para Carregar Localizações
```javascript
/**
 * Carrega localizações do arquivo JSON via Netlify Function
 * @returns {Promise<Object>} Cache de localizações indexado por ID
 */
async function loadLocations() {
  try {
    console.log('📍 Carregando localizações...');
    
    const response = await fetch(API_LOCATIONS);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    locationsCache = await response.json();
    
    console.log(`✅ ${Object.keys(locationsCache).length} localizações carregadas`);
    return locationsCache;
    
  } catch (error) {
    console.error('❌ Erro ao carregar localizações:', error);
    // Retorna cache vazio em caso de erro
    return {};
  }
}
```

### 2.3 Criar Função Helper para Obter Localização
```javascript
/**
 * Obtém dados de localização de uma estação
 * @param {string|number} stationId - ID da estação
 * @returns {Object} Dados de localização
 */
function getLocation(stationId) {
  const loc = locationsCache[stationId] || {};
  
  // Se endereço vazio ou só espaços, retorna "-"
  const endereco = (loc.endereco || '').trim() || '-';
  
  // Gera URL do Google Maps se tiver coordenadas válidas
  const hasCoordinates = loc.latitude && loc.longitude && 
                         loc.latitude.trim() !== '' && 
                         loc.longitude.trim() !== '';
  
  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
    : null;
  
  return {
    nome: loc.nome || `Estação ${stationId}`,
    endereco: endereco,
    latitude: loc.latitude || null,
    longitude: loc.longitude || null,
    mapsUrl: mapsUrl
  };
}
```

### 2.4 Modificar Função `fetchStationData(id)` Existente

LOCALIZAR a função `fetchStationData` e MODIFICAR para incluir dados de localização:

```javascript
async function fetchStationData(id) {
  try {
    // Buscar dados meteorológicos da API IoT
    const response = await fetch(`${API_IOT}/${id}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    
    // ADICIONAR: Buscar localização do cache
    const location = getLocation(id);
    
    return {
      id: id,
      name: location.nome,           // MODIFICADO: usar nome do JSON
      location: location.endereco,   // MODIFICADO: usar endereço do JSON ou "-"
      mapsUrl: location.mapsUrl,     // NOVO: link do Google Maps
      connected: isConnected(data.ultima_leitura || data.lastReading),
      lastReading: data.ultima_leitura || data.lastReading,
      temperature: data.temperatura || data.temperature || null,
      humidity: data.umidade || data.humidity || null,
      pressure: data.pressao || data.pressure || null,
      windSpeed: data.velocidade_vento || data.windSpeed || null,
      rainfall: data.precipitacao || data.rainfall || null,
      data: data
    };
  } catch (error) {
    console.error(`Erro ao buscar estação ${id}:`, error);
    
    // MODIFICADO: Incluir localização mesmo em caso de erro
    const location = getLocation(id);
    
    return {
      id: id,
      name: location.nome,
      location: location.endereco,
      mapsUrl: location.mapsUrl,
      connected: false,
      lastReading: null,
      error: error.message
    };
  }
}
```

### 2.5 Modificar Função `loadAllStations()` Existente

LOCALIZAR a função `loadAllStations` e ADICIONAR carregamento de localizações:

```javascript
async function loadAllStations() {
  setLoading(true);
  
  try {
    // 1. PRIMEIRO: Carregar localizações do JSON
    await loadLocations();
    
    // 2. DEPOIS: Buscar dados meteorológicos das estações
    const stationsData = await Promise.all(
      STATION_IDS.map(id => fetchStationData(id))
    );
    
    setStations(stationsData);
    setLastUpdate(new Date());
    
  } catch (error) {
    console.error('❌ Erro ao carregar estações:', error);
  } finally {
    setLoading(false);
  }
}
```

---

## PARTE 3: ATUALIZAR HTML/JSX DO CARD DA ESTAÇÃO

LOCALIZAR a seção onde mostra os dados da estação e ADICIONAR link do Google Maps:

### Para React (se usar React):
```jsx
{/* Localização */}
<div className="mb-4 p-3 bg-black/20 rounded-lg">
  <p className="text-blue-200 text-xs mb-1">📍 Localização:</p>
  <p className="text-white text-sm">{station.location}</p>
  
  {/* Link Google Maps - só aparece se tiver coordenadas */}
  {station.mapsUrl && (
    <a 
      href={station.mapsUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300 text-xs transition-colors"
    >
      🗺️ Ver no Google Maps
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  )}
</div>
```

### Para HTML puro (se não usar React):
```html
<div class="location-info">
  <p class="location-label">📍 Localização:</p>
  <p class="location-address">${station.location}</p>
  
  ${station.mapsUrl ? `
    <a href="${station.mapsUrl}" 
       target="_blank" 
       rel="noopener noreferrer"
       class="maps-link">
      🗺️ Ver no Google Maps
      <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  ` : ''}
</div>
```

---

## PARTE 4: CRIAR PÁGINA DE ADMINISTRAÇÃO (OPCIONAL)

### 4.1 Criar `dashboard/admin.html`
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - Estações Meteorológicas</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 min-h-screen">
    <div class="container mx-auto p-8 max-w-4xl">
        
        <!-- Header -->
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold text-white mb-2">⚙️ Administração</h1>
            <p class="text-blue-200">Gerenciar Localizações das Estações</p>
        </div>

        <!-- Lista de Estações -->
        <div id="stationsList" class="space-y-4 mb-8">
            <!-- Será preenchido dinamicamente -->
        </div>

        <!-- Formulário de Edição -->
        <div class="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <h2 class="text-2xl font-bold text-white mb-4">✏️ Editar Localização</h2>
            
            <form id="editForm" class="space-y-4">
                <div>
                    <label class="block text-blue-200 mb-2 text-sm">ID da Estação *</label>
                    <input type="number" id="stationId" required
                           class="w-full p-3 bg-black/30 text-white rounded-lg border border-white/20 
                                  focus:border-blue-400 focus:outline-none">
                </div>
                
                <div>
                    <label class="block text-blue-200 mb-2 text-sm">Nome da Estação *</label>
                    <input type="text" id="stationName" required
                           placeholder="Ex: Estação Centro"
                           class="w-full p-3 bg-black/30 text-white rounded-lg border border-white/20 
                                  focus:border-blue-400 focus:outline-none">
                </div>
                
                <div>
                    <label class="block text-blue-200 mb-2 text-sm">
                        Endereço Completo <span class="text-gray-400">(deixe vazio para mostrar "-")</span>
                    </label>
                    <input type="text" id="stationAddress" 
                           placeholder="Ex: Rua Principal, 100 - Centro, São Paulo"
                           class="w-full p-3 bg-black/30 text-white rounded-lg border border-white/20 
                                  focus:border-blue-400 focus:outline-none">
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-blue-200 mb-2 text-sm">Latitude</label>
                        <input type="text" id="stationLat" 
                               placeholder="-23.550520"
                               class="w-full p-3 bg-black/30 text-white rounded-lg border border-white/20 
                                      focus:border-blue-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-blue-200 mb-2 text-sm">Longitude</label>
                        <input type="text" id="stationLng" 
                               placeholder="-46.633308"
                               class="w-full p-3 bg-black/30 text-white rounded-lg border border-white/20 
                                      focus:border-blue-400 focus:outline-none">
                    </div>
                </div>
                
                <div class="flex gap-4">
                    <button type="submit" 
                            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg 
                                   font-bold transition-colors">
                        💾 Salvar Alterações
                    </button>
                    <button type="button" onclick="clearForm()"
                            class="px-6 bg-gray-600 hover:bg-gray-700 text-white p-3 rounded-lg 
                                   font-bold transition-colors">
                        🗑️ Limpar
                    </button>
                </div>
            </form>

            <div id="message" class="mt-4 hidden"></div>
        </div>

        <!-- Voltar -->
        <div class="text-center mt-8">
            <a href="index.html" 
               class="text-blue-400 hover:text-blue-300 transition-colors">
                ← Voltar ao Dashboard
            </a>
        </div>
    </div>

    <script>
        const API_LOCATIONS = '/api/locations';

        // Carregar lista de estações
        async function loadStations() {
            try {
                const response = await fetch(API_LOCATIONS);
                const locations = await response.json();
                
                const list = document.getElementById('stationsList');
                list.innerHTML = '';
                
                Object.entries(locations).forEach(([id, loc]) => {
                    const card = document.createElement('div');
                    card.className = 'bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20';
                    card.innerHTML = `
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <h3 class="text-xl font-bold text-white mb-1">
                                    ${loc.nome} <span class="text-blue-300 text-sm">(ID: ${id})</span>
                                </h3>
                                <p class="text-blue-200 text-sm">
                                    📍 ${loc.endereco || '<span class="text-gray-400">Sem endereço</span>'}
                                </p>
                                ${loc.latitude && loc.longitude ? `
                                    <p class="text-blue-300 text-xs mt-1">
                                        🌐 ${loc.latitude}, ${loc.longitude}
                                    </p>
                                ` : ''}
                            </div>
                            <button onclick="editStation('${id}')" 
                                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                                ✏️ Editar
                            </button>
                        </div>
                    `;
                    list.appendChild(card);
                });
            } catch (error) {
                console.error('Erro ao carregar estações:', error);
                showMessage('Erro ao carregar estações', 'error');
            }
        }

        // Editar estação
        async function editStation(id) {
            try {
                const response = await fetch(`${API_LOCATIONS}?id=${id}`);
                const data = await response.json();
                
                document.getElementById('stationId').value = id;
                document.getElementById('stationName').value = data.nome || '';
                document.getElementById('stationAddress').value = data.endereco || '';
                document.getElementById('stationLat').value = data.latitude || '';
                document.getElementById('stationLng').value = data.longitude || '';
                
                // Scroll para o formulário
                document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('Erro ao carregar estação:', error);
                showMessage('Erro ao carregar dados da estação', 'error');
            }
        }

        // Salvar alterações
        document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                id: document.getElementById('stationId').value,
                nome: document.getElementById('stationName').value,
                endereco: document.getElementById('stationAddress').value.trim(),
                latitude: document.getElementById('stationLat').value.trim(),
                longitude: document.getElementById('stationLng').value.trim()
            };
            
            try {
                const response = await fetch(API_LOCATIONS, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showMessage('✅ Localização salva com sucesso!', 'success');
                    clearForm();
                    loadStations();
                } else {
                    showMessage('❌ Erro ao salvar: ' + result.error, 'error');
                }
            } catch (error) {
                console.error('Erro ao salvar:', error);
                showMessage('❌ Erro ao salvar alterações', 'error');
            }
        });

        // Limpar formulário
        function clearForm() {
            document.getElementById('editForm').reset();
        }

        // Mostrar mensagem
        function showMessage(text, type) {
            const msg = document.getElementById('message');
            msg.textContent = text;
            msg.className = `mt-4 p-4 rounded-lg ${
                type === 'success' 
                    ? 'bg-green-500/20 text-green-200 border border-green-400/30' 
                    : 'bg-red-500/20 text-red-200 border border-red-400/30'
            }`;
            msg.classList.remove('hidden');
            
            setTimeout(() => {
                msg.classList.add('hidden');
            }, 5000);
        }

        // Carregar ao iniciar
        loadStations();
    </script>
</body>
</html>
```

---

## CHECKLIST DE IMPLEMENTAÇÃO

- [ ] 1. Criar `dashboard/data/locations.json`
- [ ] 2. Criar `netlify/functions/locations.js`
- [ ] 3. Atualizar `netlify.toml`
- [ ] 4. Adicionar constantes em `dashboard/src/app.js`
- [ ] 5. Criar função `loadLocations()` em `app.js`
- [ ] 6. Criar função `getLocation()` em `app.js`
- [ ] 7. Modificar `fetchStationData()` em `app.js`
- [ ] 8. Modificar `loadAllStations()` em `app.js`
- [ ] 9. Adicionar link Google Maps no card da estação
- [ ] 10. (Opcional) Criar `dashboard/admin.html`
- [ ] 11. Testar localmente com `netlify dev`
- [ ] 12. Commit e push para GitHub
- [ ] 13. Verificar deploy no Netlify

---

## REGRAS IMPORTANTES

1. **Endereço vazio:** Se `endereco` estiver vazio ou só com espaços, SEMPRE mostrar "-"
2. **Google Maps:** Só gerar `mapsUrl` se AMBOS latitude E longitude existirem e não estiverem vazios
3. **Ordem de carregamento:** SEMPRE carregar localizações ANTES de buscar dados meteorológicos
4. **Fallback:** Se `locationsCache` estiver vazio ou falhar, usar valores padrão
5. **CORS:** Netlify Functions já tem CORS configurado, não precisa se preocupar

---

## TESTANDO LOCALMENTE

Antes de fazer deploy, testar com Netlify CLI:

```bash
# Instalar Netlify CLI (se não tiver)
npm install -g netlify-cli

# Na pasta raiz do projeto
netlify dev

# Abrir no navegador:
# http://localhost:8888
```

---

## COMO EDITAR LOCALIZAÇÕES APÓS DEPLOY

### Opção 1: Via GitHub Interface (SEM GIT)
1. Vá em: https://github.com/alexabreup/dashboard-meteo
2. Navegue: `dashboard/data/locations.json`
3. Clique no ícone ✏️ "Edit this file"
4. Faça as alterações
5. "Commit changes"
6. Netlify faz redeploy automático

### Opção 2: Via Página Admin
1. Acesse: https://eletrometeorolgia.netlify.app/admin.html
2. Use o formulário para editar
3. Alterações são salvas automaticamente

### Opção 3: Via Git Local
```bash
git pull
# Editar dashboard/data/locations.json
git add dashboard/data/locations.json
git commit -m "Atualizar localizações"
git push
```

---

## TROUBLESHOOTING

**Problema:** Netlify Function não funciona
- Verificar se `netlify.toml` está na raiz do projeto
- Verificar logs no Netlify Dashboard > Functions

**Problema:** CORS error
- Verificar headers na função `locations.js`
- Limpar cache do navegador

**Problema:** Localizações não aparecem
- Abrir DevTools Console e verificar erros
- Verificar se `locations.json` existe e está bem formatado
- Verificar se `loadLocations()` está sendo chamado antes de `fetchStationData()`