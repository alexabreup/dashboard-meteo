#!/bin/bash
# Script para iniciar servidor local do dashboard

cd "$(dirname "$0")"

echo "=========================================="
echo "  🚀 INICIANDO SERVIDOR DASHBOARD"
echo "=========================================="
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado!"
    echo ""
    echo "Instale Node.js:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

echo "✅ Node.js encontrado: $(node --version)"
echo ""

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não está instalado!"
    exit 1
fi

echo "✅ npm encontrado: $(npm --version)"
echo ""

# Instalar dependências se necessário
if [ ! -d "api/node_modules" ]; then
    echo "📦 Instalando dependências..."
    cd api
    npm install
    cd ..
    echo "✅ Dependências instaladas"
    echo ""
fi

# Verificar caminho dos dados
DATA_DIR="/opt/docker-estacao-meteorologica/data"
if [ ! -d "$DATA_DIR" ]; then
    echo "⚠️  Diretório de dados não encontrado: $DATA_DIR"
    echo "   Ajuste DATA_DIR no server.js se necessário"
    echo ""
fi

# Iniciar servidor
echo "🚀 Iniciando servidor..."
echo "   Acesse: http://localhost:3000"
echo "   Para parar: Ctrl+C"
echo ""
echo "=========================================="
echo ""

cd api
DATA_DIR="$DATA_DIR" LOGS_DIR="/opt/docker-estacao-meteorologica/logs" npm start

