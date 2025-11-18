// Netlify Serverless Function para API
// Esta função será chamada quando o app estiver no Netlify

const API_BASE_URL = process.env.API_BASE_URL || 'https://iothub.eletromidia.com.br/api/v1/estacoes_mets';
const BRAZIL_TZ_OFFSET = '-03:00';
const ESTACOES_MIN = parseInt(process.env.ESTACOES_MIN || '1', 10);
const ESTACOES_MAX = parseInt(process.env.ESTACOES_MAX || '50', 10);
const MAX_ESTACOES_ATIVAS = Math.max(
    1,
    parseInt(
        process.env.MAX_ESTACOES_ATIVAS ||
        process.env.ESTACOES_ATIVAS ||
        process.env.NUM_ESTACOES_ATIVAS ||
        '50',
        10
    )
);
// Removido DEFAULT_ESTACOES_ATIVAS_IDS - agora usa descoberta automática
const ESTACOES_ATIVAS_IDS = (
    process.env.ESTACOES_ATIVAS_IDS ||
    process.env.ACTIVE_STATIONS ||
    ''
)
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter(Number.isFinite);

function extrairNumero(str) {
    if (str === null || str === undefined || str === '') {
        return 0;
    }
    const match = str.toString().replace(',', '.').match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

function parseBrasiliaTimestamp(rawTimestamp) {
    if (!rawTimestamp || typeof rawTimestamp !== 'string') {
        return new Date().toISOString();
    }

    try {
        const [data, hora] = rawTimestamp.trim().split(' ');
        if (!data || !hora) {
            return new Date().toISOString();
        }

        const [dia, mes, ano] = data.split('/');
        if (!dia || !mes || !ano) {
            return new Date().toISOString();
        }

        const isoWithOffset = `${ano.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${hora}${BRAZIL_TZ_OFFSET}`;
        const parsed = new Date(isoWithOffset);

        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }

        return new Date().toISOString();
    } catch (error) {
        return new Date().toISOString();
    }
}

// Função: Fazer requisição HTTP
function fazerRequisicao(url) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        try {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const req = client.get(urlObj, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'EstacaoMeteorologica-Dashboard/1.0'
                }
            }, (res) => {
                let data = '';
                
                // Verificar status code
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (!data) {
                            reject(new Error('Resposta vazia da API'));
                            return;
                        }
                        const json = JSON.parse(data);
                        resolve(json);
                    } catch (error) {
                        reject(new Error(`Erro ao parsear JSON: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout na requisição'));
            });
            
            req.setTimeout(10000);
        } catch (error) {
            reject(error);
        }
    });
}

// Função: Converter dados da API externa para formato do dashboard
function converterDadosAPI(estacaoId, dadosAPI) {
    try {
        if (!dadosAPI || dadosAPI.code !== 200 || !dadosAPI.arrResponse) {
            return {
                estacao_id: estacaoId,
                erro: 'Dados inválidos da API'
            };
        }

        const resp = dadosAPI.arrResponse;
        
        // Converter data de "17/11/2025 14:56:49" para timestamp ISO
        const timestamp = parseBrasiliaTimestamp(resp['Última Leitura']);

        return {
            estacao_id: estacaoId,
            timestamp: timestamp,
            temperatura: extrairNumero(resp.Temperatura),
            umidade: extrairNumero(resp.Umidade),
            pressao: extrairNumero(resp['Pressão Atmosférica']),
            vento_velocidade: extrairNumero(resp.Vento),
            vento_direcao: extrairNumero(resp['Direção do Vento']),
            ruido: extrairNumero(resp.Ruído),
            iluminancia: extrairNumero(resp.Luminosidade),
            chuva_total: extrairNumero(resp.Chuva),
            pm25: extrairNumero(resp['PM2.5']),
            pm10: extrairNumero(resp.PM10),
            erro: null
        };
    } catch (error) {
        return {
            estacao_id: estacaoId,
            erro: `Erro ao processar dados: ${error.message}`
        };
    }
}

// Função: Buscar dados de uma estação da API externa
async function buscarDadosEstacaoAPI(estacaoId) {
    try {
        const url = `${API_BASE_URL}/${estacaoId}`;
        const dadosAPI = await fazerRequisicao(url);
        return converterDadosAPI(estacaoId, dadosAPI);
    } catch (error) {
        return {
            estacao_id: estacaoId,
            erro: `Erro ao buscar dados: ${error.message}`
        };
    }
}

// Função: Obter lista de estações disponíveis (tentando IDs sequenciais)
async function obterListaEstacoes() {
    // Se IDs específicos foram configurados via env, usar apenas esses
    if (ESTACOES_ATIVAS_IDS.length > 0) {
        return ESTACOES_ATIVAS_IDS.slice(0, MAX_ESTACOES_ATIVAS);
    }

    // Caso contrário, fazer descoberta automática de 1 até ESTACOES_MAX (50)
    const idsEncontrados = [];
    const FALHAS_CONSECUTIVAS_MAX = 5; // Parar após 5 falhas consecutivas
    let falhasConsecutivas = 0;
    
    // Processar em batches para otimizar
    const BATCH_SIZE = 10;
    
    for (let batchStart = ESTACOES_MIN; batchStart <= ESTACOES_MAX; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, ESTACOES_MAX);
        const batchPromises = [];
        
        for (let id = batchStart; id <= batchEnd; id++) {
            batchPromises.push(
                fazerRequisicao(`${API_BASE_URL}/${id}`)
                    .then(resposta => {
                        if (resposta && resposta.code === 200 && resposta.arrResponse) {
                            return { id, success: true };
                        }
                        return { id, success: false };
                    })
                    .catch(error => {
                        return { id, success: false, error };
                    })
            );
        }
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                const { id, success } = result.value;
                if (success) {
                    idsEncontrados.push(id);
                    falhasConsecutivas = 0; // Resetar contador de falhas
                } else {
                    falhasConsecutivas++;
                    // Se já encontramos estações e temos muitas falhas consecutivas, parar
                    if (falhasConsecutivas >= FALHAS_CONSECUTIVAS_MAX && idsEncontrados.length > 0) {
                        console.log(`Parando busca após ${FALHAS_CONSECUTIVAS_MAX} falhas consecutivas`);
                        return idsEncontrados.sort((a, b) => a - b);
                    }
                }
            }
        }
        
        // Pequeno delay entre batches para não sobrecarregar a API
        if (batchEnd < ESTACOES_MAX) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    console.log(`Descoberta concluída: ${idsEncontrados.length} estações encontradas`);
    return idsEncontrados.sort((a, b) => a - b);
}

// Função: Buscar dados de todas as estações
async function buscarDadosEstacoes() {
    try {
        // Primeiro, obter a lista de estações disponíveis
        const idsEstacoes = await obterListaEstacoes();
        
        if (idsEstacoes.length === 0) {
            return [];
        }
        
        // Buscar dados de cada estação em paralelo
        const promessas = idsEstacoes.map(id => buscarDadosEstacaoAPI(id));
        const resultados = await Promise.allSettled(promessas);
        const dados = [];
        
        resultados.forEach((resultado, index) => {
            if (resultado.status === 'fulfilled') {
                dados.push(resultado.value);
            } else {
                const estacaoId = idsEstacoes[index];
                dados.push({
                    estacao_id: estacaoId,
                    erro: `Erro ao buscar: ${resultado.reason?.message || 'Erro desconhecido'}`
                });
            }
        });
        
        // Retornar todas as estações encontradas (sem limite, já que MAX_ESTACOES_ATIVAS agora é 50)
        const dadosValidos = dados.filter(estacao => !estacao.erro);
        const dadosOrdenados = dadosValidos.sort((a, b) => {
            const dataA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dataB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dataB - dataA;
        });

        // Se houver mais estações que o limite, priorizar as mais recentes
        const selecionados = dadosOrdenados.slice(0, MAX_ESTACOES_ATIVAS);
        const idsSelecionados = new Set(selecionados.map(estacao => estacao.estacao_id));

        const restantes = dados.filter(estacao => estacao.erro || !idsSelecionados.has(estacao.estacao_id));

        // Retornar todas (selecionadas + restantes com erro)
        return [...selecionados, ...restantes];
    } catch (error) {
        console.error('Erro ao buscar dados das estações:', error);
        return [];
    }
}

function createHandler(deps = {}) {
    const dataFetcher = typeof deps.buscarDadosEstacoes === 'function'
        ? deps.buscarDadosEstacoes
        : buscarDadosEstacoes;

    return async (event, context) => {
        const { httpMethod, path = '' } = event || {};
        
        // CORS headers
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Content-Type': 'application/json'
        };
        
        // Handle preflight
        if (httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers,
                body: ''
            };
        }
        
        try {
            if (path === '/api/dados' || path.endsWith('/dados')) {
                // Buscar dados da API externa
                const dados = await dataFetcher();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(dados)
                };
            }
            
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Endpoint não encontrado' })
            };
            
        } catch (error) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: error.message })
            };
        }
    };
}

const handler = createHandler();

module.exports = {
    handler,
    createHandler,
    converterDadosAPI,
    parseBrasiliaTimestamp
};
