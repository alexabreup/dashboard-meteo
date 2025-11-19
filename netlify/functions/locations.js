const fs = require('fs');
const path = require('path');

const LOCATION_CANDIDATES = [
  // Caminho relativo ao diretório da função (Netlify build)
  path.resolve(__dirname, '../../data/locations.json'),
  // Caminho usado quando o comando é executado do monorepo raiz
  path.join(process.cwd(), 'dashboard', 'data', 'locations.json'),
  // Caminho usado quando `netlify dev` roda dentro de `dashboard/`
  path.join(process.cwd(), 'data', 'locations.json')
];

function resolveLocationsFile() {
  for (const candidate of LOCATION_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Fallback para o primeiro caminho listado
  return LOCATION_CANDIDATES[0];
}

function getLocationsFilePath() {
  if (!globalThis.__LOCATIONS_FILE) {
    globalThis.__LOCATIONS_FILE = resolveLocationsFile();
  }
  return globalThis.__LOCATIONS_FILE;
}

function ensureLocationsFile() {
  try {
    const locationsPath = getLocationsFilePath();
    if (!fs.existsSync(locationsPath)) {
      fs.mkdirSync(path.dirname(locationsPath), { recursive: true });
      fs.writeFileSync(locationsPath, JSON.stringify({}, null, 2));
    }
  } catch (error) {
    console.error('Erro ao garantir arquivo de localizações:', error);
  }
}

function readLocations() {
  try {
    ensureLocationsFile();
    const data = fs.readFileSync(getLocationsFilePath(), 'utf8');
    return JSON.parse(data || '{}');
  } catch (error) {
    console.error('Erro ao ler locations.json:', error);
    return {};
  }
}

function writeLocations(data) {
  try {
    fs.writeFileSync(getLocationsFilePath(), JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao escrever locations.json:', error);
    return false;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod === 'GET') {
    const locations = readLocations();
    const id = event.queryStringParameters?.id;

    if (id) {
      const location = locations[id];
      if (!location) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Estação não encontrada' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ id, ...location })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(locations)
    };
  }

  if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const { id, nome, endereco, latitude, longitude } = payload;

      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'ID da estação é obrigatório' })
        };
      }

      const locations = readLocations();
      locations[id] = {
        nome: nome || `Estação ${id}`,
        endereco: endereco || '',
        latitude: latitude || '',
        longitude: longitude || ''
      };

      if (!writeLocations(locations)) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Erro ao salvar localização' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Localização atualizada com sucesso',
          data: { id, ...locations[id] }
        })
      };
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Dados inválidos', details: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Método não permitido' })
  };
};

