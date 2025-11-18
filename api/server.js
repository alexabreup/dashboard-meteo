const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;

// Habilitar CORS
app.use(cors());
app.use(express.json());

// URL base da API externa
const API_BASE_URL = process.env.API_BASE_URL || 'https://iothub.eletromidia.com.br/api/v1/estacoes_mets';
const ESTACOES_MIN = parseInt(process.env.ESTACOES_MIN || '1', 10);
const ESTACOES_MAX = parseInt(process.env.ESTACOES_MAX || '30', 10);
const MAX_ESTACOES_ATIVAS = Math.max(
    1,
    parseInt(
        process.env.MAX_ESTACOES_ATIVAS ||
        process.env.ESTACOES_ATIVAS ||
        process.env.NUM_ESTACOES_ATIVAS ||
        '4',
        10
    )
);
const DEFAULT_ESTACOES_ATIVAS_IDS = [2, 3, 7, 8];
const ESTACOES_ATIVAS_IDS = (
    process.env.ESTACOES_ATIVAS_IDS ||
    process.env.ACTIVE_STATIONS ||
    DEFAULT_ESTACOES_ATIVAS_IDS.join(',')
)
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter(Number.isFinite);

// Caminho para os dados (ajuste conforme necessário)
const DATA_DIR = process.env.DATA_DIR || '/opt/docker-estacao-meteorologica/data';
const LOGS_DIR = process.env.LOGS_DIR || '/opt/docker-estacao-meteorologica/logs';

// Endpoint: Obter dados das estações
app.get('/api/dados', async (req, res) => {
    try {
        const dados = await lerDadosEstacoes();
        res.json(dados);
    } catch (error) {
        console.error('Erro ao ler dados:', error);
        res.status(500).json({ error: 'Erro ao ler dados das estações' });
    }
});

// Endpoint: Obter dados de uma estação específica
app.get('/api/dados/:estacaoId', async (req, res) => {
    try {
        const estacaoId = parseInt(req.params.estacaoId);
        const dados = await lerDadosEstacao(estacaoId);
        res.json(dados);
    } catch (error) {
        console.error('Erro ao ler dados:', error);
        res.status(500).json({ error: 'Erro ao ler dados da estação' });
    }
});

// Endpoint: Obter histórico
app.get('/api/historico/:estacaoId', async (req, res) => {
    try {
        const estacaoId = parseInt(req.params.estacaoId);
        const limite = parseInt(req.query.limite) || 100;
        const historico = await lerHistorico(estacaoId, limite);
        res.json(historico);
    } catch (error) {
        console.error('Erro ao ler histórico:', error);
        res.status(500).json({ error: 'Erro ao ler histórico' });
    }
});

// Endpoint: Status do sistema
app.get('/api/status', async (req, res) => {
    try {
        const status = await obterStatus();
        res.json(status);
    } catch (error) {
        console.error('Erro ao obter status:', error);
        res.status(500).json({ error: 'Erro ao obter status' });
    }
});

// Função: Fazer requisição HTTP
function fazerRequisicao(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            timeout: 10000, // 10 segundos de timeout
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
                    console.error('Erro ao parsear JSON:', error);
                    console.error('Dados recebidos:', data.substring(0, 200));
                    reject(new Error(`Erro ao parsear JSON: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            // Não logar erros comuns de conexão (ECONNRESET, socket hang up)
            if (error.code !== 'ECONNRESET' && 
                !error.message?.includes('socket hang up') &&
                !error.message?.includes('ECONNRESET')) {
                console.error('Erro na requisição:', error.message || error.code);
            }
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout na requisição'));
        });
        
        // Aumentar timeout para 15 segundos
        req.setTimeout(15000);
    });
}

// Função: Converter dados da API externa para formato do dashboard
function converterDadosAPI(estacaoId, dadosAPI) {
    try {
        if (!dadosAPI || dadosAPI.code !== 200 || !dadosAPI.arrResponse) {
            return {
                estacao_id: estacaoId,
                erro: `Dados inválidos da API (code: ${dadosAPI?.code || 'N/A'})`
            };
        }

        const resp = dadosAPI.arrResponse;
        
        // Converter data de "17/11/2025 14:56:49" para timestamp ISO
        let timestamp = new Date().toISOString();
        if (resp['Última Leitura']) {
            try {
                const [data, hora] = resp['Última Leitura'].split(' ');
                const [dia, mes, ano] = data.split('/');
                timestamp = new Date(`${ano}-${mes}-${dia}T${hora}`).toISOString();
            } catch (e) {
                console.warn(`Erro ao converter data da estação ${estacaoId}:`, e);
            }
        }

        // Função auxiliar para extrair número de strings como "28.6 °C"
        const extrairNumero = (str) => {
            if (!str) return 0;
            const match = str.toString().match(/[\d.]+/);
            return match ? parseFloat(match[0]) : 0;
        };

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
        console.error(`Erro ao converter dados da estação ${estacaoId}:`, error);
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
        const dadosConvertidos = converterDadosAPI(estacaoId, dadosAPI);
        
        // Se a conversão retornou erro, retornar objeto com erro
        if (dadosConvertidos.erro) {
            return dadosConvertidos;
        }
        
        return dadosConvertidos;
    } catch (error) {
        // Se for 404, a estação não existe - retornar objeto com erro
        if (error.message && error.message.includes('404')) {
            return {
                estacao_id: estacaoId,
                erro: 'Estação não encontrada'
            };
        }
        // Outros erros
        return {
            estacao_id: estacaoId,
            erro: `Erro ao buscar dados: ${error.message}`
        };
    }
}


// Função: Processar requisições em lotes paralelos para velocidade
async function processarEmLotes(array, tamanhoLote, funcao) {
    const resultados = [];
    for (let i = 0; i < array.length; i += tamanhoLote) {
        const lote = array.slice(i, i + tamanhoLote);
        const promessas = lote.map(item => funcao(item));
        const resultadosLote = await Promise.allSettled(promessas);
        resultados.push(...resultadosLote);
        
        // Pequeno delay entre lotes (100ms) para não sobrecarregar
        if (i + tamanhoLote < array.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    return resultados;
}

// Função: Ler dados de todas as estações
async function lerDadosEstacoes() {
    const dados = [];
    
    try {
        // Buscar diretamente estações conhecidas
        let idsParaTestar = ESTACOES_ATIVAS_IDS.length > 0
            ? ESTACOES_ATIVAS_IDS.slice(0, MAX_ESTACOES_ATIVAS)
            : Array.from(
                { length: Math.max(0, ESTACOES_MAX - ESTACOES_MIN + 1) },
                (_, i) => ESTACOES_MIN + i
            );
        
        console.log(`Buscando dados de ${idsParaTestar.length} estações em paralelo (lotes de 10)...`);
        
        // Processar em lotes de 10 em paralelo para velocidade (ideal para técnicos de campo)
        const resultados = await processarEmLotes(idsParaTestar, 10, buscarDadosEstacaoAPI);
        
        let sucesso = 0;
        let falhas = 0;
        
        resultados.forEach((resultado, index) => {
            const estacaoId = idsParaTestar[index];
            
            if (resultado.status === 'fulfilled') {
                const dadosEstacao = resultado.value;
                if (!dadosEstacao.erro) {
                    sucesso++;
                } else {
                    falhas++;
                }
                dados.push(dadosEstacao);
            } else {
                // Ignorar erros de requisição (estação não existe ou erro de conexão)
                falhas++;
                // Log apenas erros que não são 404 ou ECONNRESET
                const errorMsg = resultado.reason?.message || resultado.reason?.code || '';
                if (!errorMsg.includes('404') && 
                    !errorMsg.includes('ECONNRESET') && 
                    !errorMsg.includes('socket hang up') &&
                    falhas <= 3) {
                    console.log(`✗ Estação ${estacaoId} falhou: ${errorMsg}`);
                }
            }
        });
        
        console.log(`Busca concluída: ${sucesso} estações encontradas, ${falhas} não encontradas`);
        console.log(`Total de estações retornadas antes do filtro: ${dados.length}`);
    } catch (error) {
        console.error('Erro ao buscar dados das estações:', error);
    }
    
    const dadosValidos = dados.filter(estacao => !estacao.erro);
    const dadosOrdenados = dadosValidos.sort((a, b) => {
        const dataA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dataB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dataB - dataA;
    });

    const selecionados = dadosOrdenados.slice(0, MAX_ESTACOES_ATIVAS);
    const idsSelecionados = new Set(selecionados.map(estacao => estacao.estacao_id));

    const restantes = dados.filter(estacao => estacao.erro || !idsSelecionados.has(estacao.estacao_id));

    return [...selecionados, ...restantes];
}

// Função: Ler dados de uma estação específica
async function lerDadosEstacao(estacaoId) {
    return await buscarDadosEstacaoAPI(estacaoId);
}

// Função: Ler histórico
async function lerHistorico(estacaoId, limite) {
    try {
        const arquivo = path.join(DATA_DIR, `backup_estacao_${estacaoId}.jsonl`);
        const conteudo = await fs.readFile(arquivo, 'utf-8');
        const linhas = conteudo.trim().split('\n').filter(l => l.trim());
        
        const dados = linhas
            .slice(-limite)
            .map(linha => JSON.parse(linha))
            .filter(d => !d.erro);
        
        return dados;
    } catch (error) {
        console.error(`Erro ao ler histórico da estação ${estacaoId}:`, error);
        return [];
    }
}

// Função: Obter status do sistema
async function obterStatus() {
    try {
        const dados = await lerDadosEstacoes();
        const estacoes = dados.map(d => ({
            id: d.estacao_id,
            online: !d.erro,
            ultimaLeitura: d.timestamp || null
        }));
        
        return {
            totalEstacoes: estacoes.length,
            estacoesOnline: estacoes.filter(e => e.online).length,
            estacoes: estacoes
        };
    } catch (error) {
        console.error('Erro ao obter status:', error);
        return {
            totalEstacoes: 0,
            estacoesOnline: 0,
            estacoes: []
        };
    }
}

// Servir arquivos estáticos do dashboard (depois das rotas da API)
app.use(express.static(path.join(__dirname, '..')));

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor API rodando em http://localhost:${PORT}`);
    console.log(`🌐 Buscando dados de: ${API_BASE_URL}`);
    console.log(`📡 Buscando estações de 1 a 30 em paralelo`);
});

