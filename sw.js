const CACHE_NAME = 'estacao-meteorologica-v2'; // Mudar versão para forçar atualização
const urlsToCache = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/styles.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://upload.wikimedia.org/wikipedia/commons/a/ad/Eletromidia_logo.png'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto');
        // Filtrar URLs válidas (apenas http/https)
        const urlsValidas = urlsToCache.filter(url => {
          try {
            const urlObj = new URL(url, self.location.origin);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
          } catch (e) {
            return false;
          }
        });
        return cache.addAll(urlsValidas).catch((err) => {
          console.warn('Alguns recursos não puderam ser cacheados:', err);
        });
      })
  );
});

// Ativar Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  // Ignorar requisições que não são GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignorar requisições de extensões do navegador
  if (!event.request.url || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.startsWith('moz-extension://') ||
      event.request.url.startsWith('safari-extension://')) {
    return;
  }
  
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    // URL inválida, ignorar
    return;
  }
  
  // Ignorar esquemas não suportados (chrome-extension, etc)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return; // Deixar o navegador lidar com isso
  }
  
  // NÃO cachear requisições da API - sempre buscar dados atualizados
  if (url.pathname.includes('/api/') || url.pathname.includes('/.netlify/functions/')) {
    // Não interceptar requisições da API - deixar passar direto
    // Isso evita problemas com o Service Worker
    return;
  }

  // Para outros recursos, usar cache
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retornar resposta do cache
        if (response) {
          return response;
        }

        // Clonar a requisição
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Verificar se recebemos uma resposta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clonar a resposta
          const responseToCache = response.clone();

          // Tentar fazer cache, mas ignorar erros
          // Verificar o esquema ANTES de tentar fazer cache
          try {
            const cacheUrl = new URL(event.request.url);
            if (cacheUrl.protocol === 'http:' || cacheUrl.protocol === 'https:') {
              // Verificar se a requisição é válida para cache
              if (event.request.method === 'GET' && 
                  event.request.url.startsWith('http')) {
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    return cache.put(event.request, responseToCache);
                  })
                  .catch((err) => {
                    // Ignorar erros de cache silenciosamente
                    // Não logar erros de chrome-extension ou outros esquemas não suportados
                    const errorMsg = err.message || err.toString() || '';
                    if (!errorMsg.includes('chrome-extension') && 
                        !errorMsg.includes('unsupported')) {
                      // Só logar se não for erro conhecido de esquema não suportado
                    }
                  });
              }
            }
          } catch (e) {
            // Ignorar erros ao processar URL
          }

          return response;
        }).catch(() => {
          // Se a requisição falhar e for uma página HTML, retornar página offline
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

