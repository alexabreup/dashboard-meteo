# Guia Rápido - Dashboard

## Início Rápido (Local)

### 1. Instalar Node.js (se necessário)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Iniciar servidor

```bash
cd /opt/docker-estacao-meteorologica/dashboard
./INICIAR_SERVIDOR.sh
```

### 3. Abrir no navegador

```
http://localhost:3000
```

## Deploy no Netlify

### Opção 1: Via Netlify CLI

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Fazer login
netlify login

# Deploy
cd dashboard
netlify deploy --prod
```

### Opção 2: Via GitHub

1. Fazer push do código para GitHub
2. Conectar repositório no Netlify
3. Configurar:
   - Build command: (deixar vazio)
   - Publish directory: `dashboard`
4. Deploy automático!

## Comandos Úteis

### Servidor local
```bash
cd dashboard/api
npm install
npm start
```

### Ver dados da API
```bash
curl http://localhost:3000/api/dados
```

### Ver status
```bash
curl http://localhost:3000/api/status
```

## Configuração

### Ajustar caminho dos dados

Edite `api/server.js`:
```javascript
const DATA_DIR = '/caminho/para/dados';
```

Ou use variável de ambiente:
```bash
DATA_DIR=/opt/docker-estacao-meteorologica/data npm start
```

