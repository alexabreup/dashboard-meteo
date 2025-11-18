const test = require('node:test');
const assert = require('node:assert/strict');

const {
    converterDadosAPI,
    parseBrasiliaTimestamp,
    createHandler
} = require('../api');

test('parseBrasiliaTimestamp converte horário de Brasília para UTC', () => {
    const iso = parseBrasiliaTimestamp('18/11/2025 08:28:44');
    assert.equal(iso, '2025-11-18T11:28:44.000Z');
});

test('converterDadosAPI produz timestamp correto e valores numéricos', () => {
    const dadosAPI = {
        code: 200,
        arrResponse: {
            'Última Leitura': '18/11/2025 23:59:59',
            Temperatura: '28,6 °C',
            Umidade: '70 %',
            'Pressão Atmosférica': '1015 hPa',
            Vento: '12 km/h',
            'Direção do Vento': '180',
            Ruído: '55 dB',
            Luminosidade: '300 lux',
            Chuva: '10 mm',
            'PM2.5': '12 μg/m³',
            PM10: '22 μg/m³'
        }
    };

    const result = converterDadosAPI(2, dadosAPI);
    assert.equal(result.estacao_id, 2);
    assert.equal(result.timestamp, '2025-11-19T02:59:59.000Z');
    assert.equal(result.temperatura, 28.6);
    assert.equal(result.umidade, 70);
    assert.equal(result.pressao, 1015);
});

test('handler usa fetcher injetado e mantém payload', async () => {
    const mockData = [{ estacao_id: 2, timestamp: '2025-11-18T11:00:00.000Z' }];
    const handler = createHandler({
        buscarDadosEstacoes: async () => mockData
    });

    const response = await handler({
        httpMethod: 'GET',
        path: '/api/dados'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(response.body), mockData);
});


