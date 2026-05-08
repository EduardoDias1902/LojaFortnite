// Determina se está rodando localmente (arquivo) ou no Vercel (servidor) para evitar erro de CORS
const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
    ? 'https://fortnite-api.com/v2/shop?language=pt-BR' 
    : '/api/fortnite?language=pt-BR';

document.addEventListener('DOMContentLoaded', () => {
    fetchShop();
    startCountdown();
});

async function fetchShop() {
    let responseData = null;
    
    // Função auxiliar para evitar carregamento infinito
    const fetchWithTimeout = async (url, ms = 10000) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    };
    
    try {
        // Tenta o endpoint oficial
        const response = await fetchWithTimeout(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        responseData = await response.json();
    } catch (error) {
        console.warn("Primary API fetch failed, trying fallback...", error);
        // Fallback rápido e seguro
        try {
            const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(API_URL);
            const proxyResponse = await fetchWithTimeout(proxyUrl);
            if (!proxyResponse.ok) throw new Error('Proxy network response was not ok');
            responseData = await proxyResponse.json();
        } catch (proxyError) {
            console.error("Proxy fetch error:", proxyError);
            showError("A API do Fortnite está indisponível no momento. Tente novamente mais tarde.");
            return;
        }
    }

    if (responseData && responseData.status === 200) {
        renderShop(responseData.data);
    } else {
        showError("Erro ao carregar os dados da loja.");
    }
}

function renderShop(shopData) {
    const container = document.getElementById('shop-container');
    const loader = document.getElementById('loader');
    const dateDisplay = document.getElementById('date-display');
    
    loader.style.display = 'none';
    
    try {
    
    // Format date
    if (shopData.date) {
        const shopDate = new Date(shopData.date);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = shopDate.toLocaleDateString('pt-BR', options);
    } else {
        dateDisplay.textContent = "Loja Atual";
    }

    let allEntries = [];

    // Extract entries safely, the API structure can have entries grouped by category
    if (shopData.featured && shopData.featured.entries) {
        allEntries = allEntries.concat(shopData.featured.entries);
    }
    if (shopData.daily && shopData.daily.entries) {
        allEntries = allEntries.concat(shopData.daily.entries);
    }
    if (shopData.specialFeatured && shopData.specialFeatured.entries) {
        allEntries = allEntries.concat(shopData.specialFeatured.entries);
    }
    
    // If the API drops the categories and returns an array directly
    if (allEntries.length === 0 && shopData.entries) {
        allEntries = shopData.entries;
    }

    if (!allEntries || allEntries.length === 0) {
        container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; font-size: 1.5rem; color: #ff4757;">Nenhum item encontrado na loja hoje. A API pode estar atualizando.</p>';
        return;
    }

    // Use a document fragment for performance
    const fragment = document.createDocumentFragment();
    
    // Arrays para agrupar os itens
    const skins = [];
    const bundles = [];
    const emotes = [];
    const pickaxes = [];
    const gliders = [];
    const backpacks = [];
    const shoes = [];
    const others = [];
    
    // Pesos de raridade (quanto maior, mais pro topo)
    const rarityWeights = {
        'common': 1,
        'uncommon': 2,
        'rare': 3,
        'epic': 4,
        'legendary': 5,
        'mythic': 6,
        'exotic': 7
    };
    
    const getRarityWeight = (rarityVal) => {
        // Se a raridade não estiver na lista convencional (ex: Marvel, Ícones, Star Wars, Gaming Legends)
        // Damos um peso muito alto (100) para que fique na frente das lendárias.
        return rarityWeights[rarityVal] || 100;
    };

    allEntries.forEach((entry, index) => {
        if (!entry) return; // Segurança caso a API retorne um item nulo
        
        let items = [];
        const possibleCategories = [entry.brItems, entry.cars, entry.instruments, entry.tracks, entry.legoKits, entry.items];
        
        possibleCategories.forEach(category => {
            if (Array.isArray(category)) {
                items = items.concat(category);
            } else if (category && typeof category === 'object') {
                items.push(category);
            }
        });
        
        const firstItem = items.length > 0 ? items[0] : null;
        const bundle = entry.bundle;
        
        // Uso de Optional Chaining (?.) para evitar qualquer erro de "Cannot read properties of undefined"
        const name = bundle?.name || firstItem?.name || 'Item Desconhecido';
        
        // Se a API não souber o nome de um item (geralmente cosméticos de eventos especiais sem metadados), removemos da loja
        if (name === 'Item Desconhecido') return;
        
        const type = firstItem?.type?.displayValue || (bundle ? 'Pacote' : 'Cosmético');
        const finalPrice = entry.finalPrice || 0;
        const regularPrice = entry.regularPrice || 0;
        
        // Determine rarity
        let rarityValue = 'common';
        if (entry.series?.value) {
             rarityValue = entry.series.value.toLowerCase().replace(/ /g, '');
        } else if (firstItem?.rarity?.value) {
             rarityValue = firstItem.rarity.value.toLowerCase();
        }

        // Determine best image using optional chaining fallback
        let imageSrc = bundle?.image || 
                       entry.newDisplayAsset?.materialInstances?.[0]?.images?.OfferImage || 
                       entry.newDisplayAsset?.materialInstances?.[0]?.images?.Background ||
                       firstItem?.images?.featured || 
                       firstItem?.images?.icon || 
                       firstItem?.images?.smallIcon || 
                       'https://via.placeholder.com/280x280.png?text=Sem+Imagem';

        let vbucksIcon = shopData.vbuckIcon || 'https://fortnite-api.com/images/vbuck.png';

        // Usar um CDN Proxy Público (wsrv.nl) para as imagens se não for local, 
        // para contornar definitivamente o bloqueio de Hotlink (Cloudflare 403) da Epic.
        if (!isLocal) {
            if (imageSrc && !imageSrc.includes('placeholder.com')) {
                imageSrc = `https://wsrv.nl/?url=${encodeURIComponent(imageSrc)}`;
            }
            if (vbucksIcon) {
                vbucksIcon = `https://wsrv.nl/?url=${encodeURIComponent(vbucksIcon)}`;
            }
        }

        const card = document.createElement('div');
        card.className = `item-card rarity-${rarityValue}`;
        card.style.animationDelay = `${(index % 20) * 0.05}s`;
        
        card.innerHTML = `
            <div class="item-image-container">
                <img src="${imageSrc}" alt="${name}" class="item-image" loading="lazy" onerror="this.src='https://via.placeholder.com/280x280.png?text=Erro+na+Imagem'">
            </div>
            <div class="item-info">
                <span class="item-type">${type}</span>
                <h3 class="item-name">${name}</h3>
                <div class="item-price">
                    <img src="${vbucksIcon}" alt="V-Bucks" class="vbucks-icon">
                    <span>${finalPrice}</span>
                    ${regularPrice > finalPrice ? `<span class="price-strike">${regularPrice}</span>` : ''}
                </div>
            </div>
        `;
        
        // Lógica de agrupamento baseada no tipo do item
        const typeStr = type.toLowerCase();
        const isBundle = bundle || typeStr.includes('pacote') || typeStr.includes('bundle');
        const isSkin = typeStr.includes('traje') || typeStr.includes('outfit');
        const isEmote = typeStr.includes('gesto') || typeStr.includes('emote') || typeStr.includes('dança');
        const isPickaxe = typeStr.includes('picareta') || typeStr.includes('ferramenta') || typeStr.includes('pickaxe');
        const isGlider = typeStr.includes('asa-delta') || typeStr.includes('glider');
        const isBackpack = typeStr.includes('acessório para as costas') || typeStr.includes('mochila') || typeStr.includes('back bling');
        const isShoes = typeStr.includes('sapato') || typeStr.includes('tênis') || typeStr.includes('chuteira') || typeStr.includes('kicks');
        
        const itemObj = {
            card: card,
            weight: getRarityWeight(rarityValue),
            rarityName: rarityValue,
            typeName: type
        };
        
        if (isBundle) bundles.push(itemObj);
        else if (isSkin) skins.push(itemObj);
        else if (isShoes) shoes.push(itemObj);
        else if (isEmote) emotes.push(itemObj);
        else if (isPickaxe) pickaxes.push(itemObj);
        else if (isGlider) gliders.push(itemObj);
        else if (isBackpack) backpacks.push(itemObj);
        else others.push(itemObj);
    });

    // Função para adicionar uma seção inteira ao fragmento
    const appendSection = (title, itemsArray) => {
        if (itemsArray.length === 0) return;
        
        // Ordena primeiro pelo peso (maior pro menor). 
        // Em caso de empate (mesmo peso), ordena pelo nome da raridade.
        // Em caso de segundo empate, agrupa os itens de tipo idêntico juntos (ex: agrupar guitarras com guitarras).
        itemsArray.sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            if (a.rarityName !== b.rarityName) return a.rarityName.localeCompare(b.rarityName);
            return a.typeName.localeCompare(b.typeName);
        });
        
        const titleEl = document.createElement('h2');
        titleEl.className = 'section-title';
        titleEl.textContent = title;
        fragment.appendChild(titleEl);
        
        itemsArray.forEach(item => fragment.appendChild(item.card));
    };

    // Ordem de exibição na loja
    appendSection('Pacotes', bundles);
    appendSection('Trajes (Skins)', skins);
    appendSection('Sapatos (Kicks)', shoes);
    appendSection('Gestos (Emotes)', emotes);
    appendSection('Picaretas', pickaxes);
    appendSection('Asas-Deltas', gliders);
    appendSection('Mochilas', backpacks);
    appendSection('Acessórios e Outros', others);

    container.appendChild(fragment);

    } catch (err) {
        console.error("Erro no processamento dos dados da API:", err);
        container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: #ff4757; font-size: 1.2rem;">Ocorreu um erro ao formatar a loja. Isso significa que a Epic Games mudou o formato da API. Detalhes no console.</p>`;
    }
}

function showError(msg) {
    const loader = document.getElementById('loader');
    loader.innerHTML = `<p style="color: #ff4757; font-size: 1.2rem; text-align: center;">${msg}</p>`;
}

function startCountdown() {
    const timerElement = document.getElementById('countdown-timer');
    if (!timerElement) return;

    const updateTimer = () => {
        const now = new Date();
        // O reset da loja ocorre às 00:00:00 UTC todos os dias
        const nextReset = new Date(now);
        nextReset.setUTCHours(24, 0, 0, 0); 
        
        let diff = nextReset - now;
        
        // Se a loja acabou de atualizar
        if (diff <= 0) {
            timerElement.textContent = "ATUALIZANDO...";
            setTimeout(() => window.location.reload(), 5000); // recarrega a página automaticamente
            return;
        }

        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timerElement.textContent = 
            String(hours).padStart(2, '0') + ':' + 
            String(minutes).padStart(2, '0') + ':' + 
            String(seconds).padStart(2, '0');
    };

    updateTimer();
    setInterval(updateTimer, 1000);
}
