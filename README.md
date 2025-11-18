# Dashboard - Estação Meteorológica

Aplicativo web para visualizar dados da estação meteorológica em tempo real.

## Instalação e Uso

### Modo Local (com servidor Node.js)

1. **Instalar dependências:**
```bash
cd api
npm install
```

2. **Configurar caminho dos dados (se necessário):**
```bash
# Editar server.js ou usar variáveis de ambiente
export DATA_DIR=/opt/docker-estacao-meteorologica/data
export LOGS_DIR=/opt/docker-estacao-meteorologica/logs
```

3. **Iniciar servidor:**
```bash
npm start
```

4. **Abrir no navegador:**
```
http://localhost:3000
```

Ou abra o arquivo `index.html` diretamente no navegador (sem servidor, mas sem dados reais).

### Modo Netlify

1. **Fazer deploy:**
   - Conecte seu repositório ao Netlify
   - Configure variáveis de ambiente se necessário:
     - `API_URL`: URL da sua API (se tiver servidor acessível)

2. **Ou usar dados mock:**
   - O código já inclui dados de exemplo para demonstração

## Estrutura

```
dashboard/
├── index.html          # Página principal
├── src/
│   ├── app.js         # Lógica JavaScript
│   └── styles.css     # Estilos
├── api/
│   ├── server.js      # Servidor Node.js (local)
│   └── package.json   # Dependências
├── netlify/
│   └── functions/
│       └── api.js     # Serverless function (Netlify)
└── netlify.toml        # Configuração Netlify
```

## Configuração

### Para uso local com dados reais:

1. Certifique-se de que o servidor Node.js pode acessar:
   - `/opt/docker-estacao-meteorologica/data/`
   - `/opt/docker-estacao-meteorologica/logs/`

2. Ajuste `DATA_DIR` no `server.js` se os dados estiverem em outro local.

### Para Netlify:

Configure a variável de ambiente `API_URL` no painel do Netlify apontando para sua API.

## Funcionalidades
- Visualização em tempo real dos dados
- Interface moderna e responsiva
- Atualização automática a cada 30 segundos
- Suporte a múltiplas estações
- Indicadores visuais de status
- Design dark mode

## Personalização

Edite `src/styles.css` para personalizar cores e layout.

## Notas

- Para produção, configure CORS adequadamente
- Para Netlify, considere usar um serviço de proxy ou API externa
- Os dados são lidos dos arquivos JSON salvos pelo container Docker

