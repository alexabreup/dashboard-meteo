# 🚀 Guia de Deploy no Netlify

## Pré-requisitos

1. Conta no Netlify (gratuita)
2. Repositório Git (GitHub, GitLab ou Bitbucket) com o código do dashboard

## Passo a Passo

### 1. Preparar o Repositório

Certifique-se de que todos os arquivos estão commitados:

```bash
cd docker-estacao-meteorologica/dashboard
git add .
git commit -m "Adicionar PWA e separação de estações ativas/inativas"
git push
```

### 2. Deploy no Netlify

#### Opção A: Via Interface Web (Recomendado)

1. Acesse [netlify.com](https://www.netlify.com) e faça login
2. Clique em **"Add new site"** → **"Import an existing project"**
3. Conecte seu repositório Git
4. Configure as seguintes opções:
   - **Base directory**: `docker-estacao-meteorologica/dashboard`
   - **Build command**: (deixar vazio)
   - **Publish directory**: `.` (ponto)
5. Clique em **"Deploy site"**

#### Opção B: Via Netlify CLI

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Fazer login
netlify login

# Navegar até o diretório do dashboard
cd docker-estacao-meteorologica/dashboard

# Deploy
netlify deploy --prod
```

### 3. Configurar Variáveis de Ambiente (Opcional)

Se quiser personalizar a API ou intervalo de estações:

1. No painel do Netlify, vá em **Site settings** → **Environment variables**
2. Adicione as variáveis (opcionais):
   - `API_BASE_URL`: URL base da API (padrão: `https://iothub.eletromidia.com.br/api/v1/estacoes_mets`)
   - `ESTACOES_MIN`: ID mínimo da estação (padrão: `1`)
   - `ESTACOES_MAX`: ID máximo da estação (padrão: `30`)

### 4. Verificar Deploy

Após o deploy, você receberá uma URL como: `https://seu-app.netlify.app`

Acesse a URL e verifique:
- ✅ O dashboard carrega corretamente
- ✅ As estações são exibidas
- ✅ Estações ativas e inativas estão separadas
- ✅ O PWA pode ser instalado (ícone de instalação no navegador)

## 📱 Instalar como PWA

### No Desktop:
- **Chrome/Edge**: Clique no ícone de instalação na barra de endereços
- **Firefox**: Menu → Instalar aplicativo

### No Smartphone:
- **Android/Chrome**: Menu → "Adicionar à tela inicial"
- **iOS/Safari**: Compartilhar → "Adicionar à Tela de Início"

## 🔧 Troubleshooting

### Service Worker não funciona
- Verifique se o arquivo `sw.js` está na raiz do diretório
- Limpe o cache do navegador
- Verifique os headers no `netlify.toml`

### API não retorna dados
- Verifique se a API externa está acessível
- Confira as variáveis de ambiente no Netlify
- Veja os logs no Netlify: **Site settings** → **Functions** → **Logs**

### PWA não instala
- Certifique-se de que está usando HTTPS (Netlify fornece automaticamente)
- Verifique se o `manifest.json` está acessível
- Teste em diferentes navegadores

## 📝 Notas

- O Netlify fornece HTTPS automaticamente
- O Service Worker funciona apenas em HTTPS
- As atualizações do PWA podem levar alguns minutos para aparecer

