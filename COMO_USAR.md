# Como Usar o Dashboard

## Uso Local (No Servidor)

### Opção 1: Script Automático

```bash
cd /opt/docker-estacao-meteorologica/dashboard
./INICIAR_SERVIDOR.sh
```

Depois abra no navegador: `http://localhost:3000`

### Opção 2: Manual

```bash
# 1. Instalar Node.js (se necessário)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Instalar dependências
cd /opt/docker-estacao-meteorologica/dashboard/api
npm install

# 3. Iniciar servidor
npm start

# 4. Abrir no navegador
# http://localhost:3000
```

### Opção 3: Abrir HTML Direto (Sem Servidor)

```bash
# Abrir index.html diretamente (mas sem dados reais)
cd /opt/docker-estacao-meteorologica/dashboard
# Abra index.html no navegador
```

---

## Deploy no Netlify

### Método 1: Via Netlify CLI

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Fazer login
netlify login

# Deploy
cd /opt/docker-estacao-meteorologica/dashboard
netlify deploy --prod
```

### Método 2: Via GitHub + Netlify

1. **Fazer push para GitHub:**
```bash
cd /opt/docker-estacao-meteorologica
git init
git add dashboard/
git commit -m "Dashboard estação meteorológica"
git remote add origin SEU_REPOSITORIO
git push -u origin main
```

2. **No Netlify:**
   - Conectar repositório
   - Build settings:
     - Build command: (deixar vazio)
     - Publish directory: `dashboard`
   - Deploy!

### Método 3: Drag & Drop

1. Compactar a pasta `dashboard`:
```bash
cd /opt/docker-estacao-meteorologica
tar -czf dashboard.tar.gz dashboard/
```

2. No Netlify: arraste o arquivo `dashboard.tar.gz`

---

## Configuração para Dados Reais (Netlify)

Para usar dados reais no Netlify, você precisa:

### Opção A: Expor API do Servidor

1. Configure Tailscale ou abra porta no firewall
2. No Netlify, configure variável de ambiente:
   - `API_URL` = `http://SEU_IP_TAILSCALE:3000/api`

### Opção B: Usar Dados Mock (Demonstração)

O dashboard já vem com dados de exemplo para demonstração.

---

## Acessar Dashboard

### Local:
```
http://localhost:3000
```

### Netlify:
```
https://seu-app.netlify.app
```

---

## Funcionalidades
- Visualização em tempo real
- Atualização automática (30 segundos)
- Interface moderna e responsiva
- Múltiplas estações
- Indicadores de status
- Design dark mode

---

## Verificar se Está Funcionando

### Testar API localmente:

```bash
curl http://localhost:3000/api/dados
```

### Testar status:

```bash
curl http://localhost:3000/api/status
```

---

## Notas

- O dashboard lê dados dos arquivos JSON salvos pelo container Docker
- Para produção, configure CORS adequadamente
- Os dados são atualizados automaticamente a cada 30 segundos

