// --- SEKCJA 0: IMPORTY I KONFIGURACJA FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, updateDoc, 
    collection, addDoc, query, orderBy, limit, Timestamp, 
    serverTimestamp, where, getDocs, writeBatch, deleteDoc, getDoc, runTransaction,
    increment 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCeu3hDfVKNirhJHk1HbqaFjtf_L3v3sd0",
  authDomain: "symulator-gielda.firebaseapp.com",
  projectId: "symulator-gielda",
  storageBucket: "symulator-gielda.firebasestorage.app",
  messagingSenderId: "407270570707",
  appId: "1:407270570707:web:ffd8c24dd1c8a1c137b226",
  measurementId: "G-BXPWNE261F"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ZMIENNE GLOBALNE ---
let market = {
    ulanska:    { name: "Ułańska Dev",   price: 1, previousPrice: null, history: [], type: 'stock' },
    brzozair:   { name: "BrzozAir",      price: 1, previousPrice: null, history: [], type: 'stock' },
    rychbud:    { name: "RychBud",       price: 1, previousPrice: null, history: [], type: 'stock' },
    cosmosanit: { name: "Cosmosanit",    price: 100, previousPrice: null, history: [], type: 'stock' },
    nicorp:     { name: "Nicorp",        price: 1000, previousPrice: null, history: [], type: 'crypto' },
    igirium:    { name: "Igirium",       price: 500, previousPrice: null, history: [], type: 'crypto' }
};

const companyAbbreviations = {
    ulanska: "UŁDEV", rychbud: "RBUD", brzozair: "BAIR", cosmosanit: "COSIT",
    nicorp: "NIC", igirium: "IGI"
};

let currentCompanyId = "ulanska";
let currentMarketType = "stocks"; 

let portfolio = {
    name: "Gość", cash: 0,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
    stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
    startValue: 100, zysk: 0, totalValue: 0, prestigeLevel: 0,
    // Pola pomocnicze do animacji
    displayedCash: undefined,
    displayedTotal: undefined,
    displayedProfit: undefined
};

// --- KONFIGURACJA PRESTIŻU I BLOKAD ---
const PRESTIGE_REQUIREMENTS = [50000, 100000, 150000, 250000, 500000]; // 5 progów
const CRYPTO_PRESTIGE_REQUIREMENT = 4; // Krypto od poziomu 4

const GAME_UNLOCKS = {
    'betting': 0, 
    'radio': 0,   
    'pvp': 0,     
    'casino': 1,  
    'poker': 2,   
    'plinko': 3,  
    'crash': 5    
};

const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"];
const CHART_COLORS = ['#00d2ff', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF', '#F0B90B', '#627EEA'];

// Zmienne UI/Logic
let chart = null;
let portfolioChart = null; 
let currentUserId = null;
let chartHasStarted = false; 
let initialNewsLoaded = false; 
let initialChatLoaded = false; 
let audioUnlocked = false; 
let isChatCooldown = false;

// Zmienne dla zakładów
let matchesCache = []; 
let activeDayTab = null; 
let currentBetSelection = null; 

// CRASH GAME VARS
let crashGameLoop;
let crashMultiplier = 1.00;
let crashIsRunning = false;
let crashHasCashedOut = false;
let crashBetAmount = 0;
let crashCurvePoints = [];
let crashCanvas, crashCtx;
let crashCurrentCrashPoint = 0;

// Unsubscribes
let unsubscribePortfolio = null;
let unsubscribeRumors = null;
let unsubscribeNews = null; 
let unsubscribeLeaderboard = null;
let unsubscribeChat = null; 
let unsubscribeGlobalHistory = null;
let unsubscribePersonalHistory = null;
let unsubscribeLimitOrders = null; 
let unsubscribeMatch = null;
let unsubscribeActiveBets = null;
let unsubscribePvP = null;

let dom = {};

// --- FUNKCJE POMOCNICZE ---
function generateInitialCandles(count, basePrice) {
    let data = []; let lastClose = basePrice || 1;
    let timestamp = new Date().getTime() - (count * 15000);
    for (let i = 0; i < count; i++) {
        let open = lastClose;
        let close = open + (Math.random() - 0.5) * (basePrice * 0.05);
        let high = Math.max(open, close) + Math.random() * (basePrice * 0.02);
        let low = Math.min(open, close) - Math.random() * (basePrice * 0.02);
        data.push({
            x: new Date(timestamp),
            y: [Math.max(1, open).toFixed(2), Math.max(1, high).toFixed(2), Math.max(1, low).toFixed(2), Math.max(1, close).toFixed(2)]
        });
        lastClose = close; timestamp += 15000;
    }
    return data;
}

function formatujWalute(val) { return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val); }
function getPrestigeStars(lvl, type) { return lvl ? (type==='chat'?` <span class="prestige-stars">(${'⭐️'.repeat(lvl)})</span>`:` <span class="prestige-stars">${'⭐️'.repeat(lvl)}</span>`) : ''; }
function showMessage(msg, type) { 
    if(dom.messageBox) {
        dom.messageBox.textContent = msg; 
        dom.messageBox.style.color = type==="error"?"var(--red)":"var(--green)"; 
        setTimeout(()=>dom.messageBox.textContent="", 3000); 
    }
}
function showAuthMessage(msg, type="info") { dom.authMessage.textContent = msg; dom.authMessage.style.color = type==="error" ? "var(--red)" : "var(--green)"; }

// --- ANIMOWANA AKTUALIZACJA CENY (GŁÓWNY WIDOK) ---
function updatePriceUI() { 
    if(!dom.stockPrice) return;

    const company = market[currentCompanyId];
    const currentPrice = company.price;
    
    // Sprawdzamy, jaką cenę wyświetlamy obecnie
    if (typeof company.displayedPrice === 'undefined') {
        company.displayedPrice = currentPrice;
        dom.stockPrice.textContent = formatujWalute(currentPrice);
    } else {
        if (company.displayedPrice !== currentPrice) {
            // Animujemy od starej ceny do nowej
            animateValue(dom.stockPrice, company.displayedPrice, currentPrice, 1000);
            company.displayedPrice = currentPrice;
        }
    }
}

function checkCryptoAccess() {
    const isCrypto = market[currentCompanyId].type === 'crypto';
    const locked = isCrypto && portfolio.prestigeLevel < CRYPTO_PRESTIGE_REQUIREMENT;
    
    if(dom.orderPanel) {
        dom.orderPanel.classList.toggle("crypto-locked", locked);
        const msgEl = dom.orderPanel.querySelector(".crypto-gate-message p");
        if(msgEl && locked) {
            msgEl.textContent = `Wymagany Prestiż ${CRYPTO_PRESTIGE_REQUIREMENT} (⭐️⭐️⭐️⭐️)`;
        }
    }
}

function updateTickerTape() {
    let h = "";
    COMPANY_ORDER.forEach(cid => {
        if(market[cid].price) {
            const diff = ((market[cid].price - (market[cid].previousPrice||market[cid].price))/market[cid].price)*100;
            const cls = diff > 0 ? "ticker-up" : (diff < 0 ? "ticker-down" : "");
            h += `<span class="ticker-item ${market[cid].type==='crypto'?'ticker-crypto':''}">${market[cid].name} <strong>${market[cid].price.toFixed(2)}</strong> <span class="${cls}">${diff.toFixed(2)}%</span></span>`;
        }
    });
    if(dom.tickerContent) dom.tickerContent.innerHTML = h + h;
}

function showNotification(message, type, impactType = null) {
    if (!dom.notificationContainer) return;
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.classList.add(`toast-${type}`); 
    let header = "Powiadomienie";
    if (type === 'news') {
        header = "Wiadomość Rynkowa";
        if(impactType) {
            toast.classList.add(`toast-${impactType}`);
            header = impactType === 'positive' ? "Dobre Wieści!" : "Złe Wieści!";
        }
    } else if (type === 'chat') header = "Nowa Wiadomość";
    else if (type === 'tip') header = "Prywatna Wskazówka!";
    toast.innerHTML = `<strong>${header}</strong><p>${message}</p>`;
    dom.notificationContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-fade-out'); setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 500); }, 5000);
}

// --- NASŁUCHIWACZ CEN (Główna pętla danych) ---
const cenyDocRef = doc(db, "global", "ceny_akcji");
onSnapshot(cenyDocRef, (docSnap) => {
    if (docSnap.exists()) {
        const aktualneCeny = docSnap.data();
        
        if(aktualneCeny['bartcoin'] && !aktualneCeny['nicorp']) {
            aktualneCeny['nicorp'] = aktualneCeny['bartcoin'];
        }

        for (const companyId in market) {
            if (aktualneCeny[companyId] !== undefined) {
                market[companyId].previousPrice = market[companyId].price;
                market[companyId].price = aktualneCeny[companyId];
            }
        }
        
        if (!chartHasStarted) {
            for (const companyId in market) {
                if (market[companyId].price && market[companyId].history.length === 0) {
                    market[companyId].history = generateInitialCandles(50, market[companyId].price);
                    market[companyId].previousPrice = market[companyId].price; 
                }
            }
        }
        updatePriceUI(); 
        updatePortfolioUI(); // ZAKTUALIZOWANO: Wywołujemy portfel, by przeliczył wartość akcji
        updateTickerTape(); 

        const chartDataReady = market[currentCompanyId] && market[currentCompanyId].history.length > 0;
        if (currentUserId && !chartHasStarted && chartDataReady) {
            if (!chart) initChart();
            startChartTicker();    
            chartHasStarted = true;
        }
    }
});

// --- FUNKCJE LOGOWANIA I REJESTRACJI ---
async function onRegister(e) {
    e.preventDefault();
    const name = dom.registerForm.querySelector("#register-name").value;
    const email = dom.registerForm.querySelector("#register-email").value;
    const password = dom.registerForm.querySelector("#register-password").value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (cred.user) {
            await setDoc(doc(db, "uzytkownicy", cred.user.uid), {
                name: name, email: email, cash: 10000.00,
                shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
                stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
                startValue: 10000.00, zysk: 0.00, totalValue: 10000.00,
                joinDate: Timestamp.fromDate(new Date()), prestigeLevel: 0 
            });
        }
    } catch (err) { showAuthMessage(err.message, "error"); }
}

async function onLogin(e) { 
    e.preventDefault(); 
    try { 
        await signInWithEmailAndPassword(
            auth, 
            dom.loginForm.querySelector("#login-email").value, 
            dom.loginForm.querySelector("#login-password").value
        ); 
    } catch (err) { 
        showAuthMessage(err.message, "error"); 
    } 
}

function onLogout() { signOut(auth); }

async function onResetPassword(e) {
    e.preventDefault();
    const email = dom.loginForm.querySelector("#login-email").value;
    if(!email) return showAuthMessage("Podaj email", "error");
    try { await sendPasswordResetEmail(auth, email); showAuthMessage("Wysłano link", "success"); } catch(err) { showAuthMessage(err.message, "error"); }
}

// --- FUNKCJA NAWIGACJI ---
function onSelectView(e) {
    const viewName = e.currentTarget.dataset.view;
    dom.navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
    dom.views.forEach(view => {
        if (view.id === `view-${viewName}`) {
            view.classList.add("active");
            view.classList.remove("hidden");
        } else {
            view.classList.remove("active");
            setTimeout(() => { if(!view.classList.contains('active')) view.classList.add('hidden') }, 500);
        }
    });
    if (viewName === 'market' && chart) {
        chart.render();
    }
}

// --- START APLIKACJI ---
document.addEventListener("DOMContentLoaded", () => {

    dom = {
        // Auth
        authContainer: document.getElementById("auth-container"),
        simulatorContainer: document.getElementById("simulator-container"),
        loginForm: document.getElementById("login-form"),
        registerForm: document.getElementById("register-form"),
        authMessage: document.getElementById("auth-message"),
        resetPasswordLink: document.getElementById("reset-password-link"),
        showRegisterLink: document.getElementById("show-register-link"),
        showLoginLink: document.getElementById("show-login-link"),
        username: document.getElementById("username"),
        logoutButton: document.getElementById("logout-button"),
        userInfo: document.getElementById("user-info"), 
        muteButton: document.getElementById("mute-button"),
        
        // Navigation
        navButtons: document.querySelectorAll(".nav-btn"),
        views: document.querySelectorAll(".view-section"),
        entertainmentCash: document.getElementById("entertainment-cash-display"),

        // Main UI
        tickerContent: document.getElementById("ticker-content"),
        marketTypeTabs: document.querySelectorAll(".market-type-tab"),
        companySelector: document.getElementById("company-selector"),
        cryptoSelector: document.getElementById("crypto-selector"),
        companyName: document.getElementById("company-name"),
        stockPrice: document.getElementById("stock-price"),
        chartContainer: document.getElementById("chart-container"),
        
        // Portfolio & Orders
        cash: document.getElementById("cash"),
        totalValue: document.getElementById("total-value"),
        totalProfit: document.getElementById("total-profit"),
        sharesList: document.getElementById("shares-list"),
        portfolioChartContainer: document.getElementById("portfolio-chart-container"),
        orderPanel: document.getElementById("order-panel"),
        orderTabMarket: document.querySelector('.order-tab-btn[data-order-type="market"]'),
        orderTabLimit: document.querySelector('.order-tab-btn[data-order-type="limit"]'),
        orderMarketContainer: document.getElementById("order-market-container"),
        orderLimitContainer: document.getElementById("order-limit-container"),
        amountInput: document.getElementById("amount-input"),
        buyButton: document.getElementById("buy-button"),
        sellButton: document.getElementById("sell-button"),
        buyMaxButton: document.getElementById("buy-max-button"), 
        sellMaxButton: document.getElementById("sell-max-button"), 
        messageBox: document.getElementById("message-box"),
        cryptoGateMessage: document.querySelector(".crypto-gate-message"),

        // Limit
        limitOrderForm: document.getElementById("limit-order-form"),
        limitType: document.getElementById("limit-type"),
        limitAmount: document.getElementById("limit-amount"),
        limitPrice: document.getElementById("limit-price"),
        limitOrdersFeed: document.getElementById("limit-orders-feed"),
        
        // Rumors & News
        rumorForm: document.getElementById("rumor-form"),
        rumorInput: document.getElementById("rumor-input"),
        rumorsFeed: document.getElementById("rumors-feed"),
        newsFeed: document.getElementById("news-feed"), 
        leaderboardList: document.getElementById("leaderboard-list"),
        
        // Chat
        chatForm: document.getElementById("chat-form"),
        chatInput: document.getElementById("chat-input"),
        chatFeed: document.getElementById("chat-feed"),
        
        // History & Bonds
        historyTabButtons: document.querySelectorAll("#history-tabs-panel .tab-btn"),
        globalHistoryFeed: document.getElementById("global-history-feed"),
        personalHistoryFeed: document.getElementById("personal-history-feed"),
        
        // Zakłady
        matchInfo: document.getElementById("match-info"),
        bettingForm: document.getElementById("betting-form"),
        betAmount: document.getElementById("bet-amount"),
        placeBetButton: document.getElementById("place-bet-button"),
        activeBetsFeed: document.getElementById("active-bets-feed"),
        betTeamSelect: document.getElementById("bet-team"),

        // KASYNO
        casinoAmount: document.getElementById("casino-amount"),
        casinoStatus: document.getElementById("casino-status"),
        
        // PVP
        pvpForm: document.getElementById("pvp-create-form"),
        pvpAmount: document.getElementById("pvp-amount"),
        pvpFeed: document.getElementById("pvp-feed"),
        
        // CRASH GAME
        crashCanvas: document.getElementById("crash-canvas"),
        crashMultiplierText: document.getElementById("crash-multiplier"),
        crashInfo: document.getElementById("crash-info"),
        crashAmount: document.getElementById("crash-amount"),
        btnCrashAction: document.getElementById("btn-crash-action"),
        crashHistoryList: document.getElementById("crash-history-list"),

        // Modal
        modalOverlay: document.getElementById("user-profile-modal"),
        modalCloseButton: document.getElementById("modal-close-button"),
        modalUsername: document.getElementById("modal-username"),
        modalTotalValue: document.getElementById("modal-total-value"),
        modalTotalProfit: document.getElementById("modal-total-profit"),
        modalCash: document.getElementById("modal-cash"),
        modalSharesList: document.getElementById("modal-shares-list"),
        modalPortfolioChartContainer: document.getElementById("modal-portfolio-chart-container"),
        modalPrestigeLevel: document.getElementById("modal-prestige-level"), 
        modalTotalTrades: document.getElementById("modal-total-trades"),
        prestigeInfo: document.getElementById("prestige-info"), 
        prestigeNextGoal: document.getElementById("prestige-next-goal"), 
        prestigeButton: document.getElementById("prestige-button"), 

        // Audio
        audioKaching: document.getElementById("audio-kaching"),
        audioError: document.getElementById("audio-error"),
        audioNews: document.getElementById("audio-news"),
        notificationContainer: document.getElementById("notification-container")
    };


    // Listenery
    dom.navButtons.forEach(btn => btn.addEventListener("click", onSelectView)); 
    dom.registerForm.addEventListener("submit", onRegister);
    dom.loginForm.addEventListener("submit", onLogin);
    dom.logoutButton.addEventListener("click", onLogout);
    dom.marketTypeTabs.forEach(tab => tab.addEventListener("click", onSelectMarketType));
    dom.companySelector.addEventListener("click", onSelectCompany);
    dom.cryptoSelector.addEventListener("click", onSelectCompany);
    dom.buyButton.addEventListener("click", buyShares);
    dom.sellButton.addEventListener("click", sellShares);
    dom.buyMaxButton.addEventListener("click", onBuyMax); 
    dom.sellMaxButton.addEventListener("click", onSellMax); 
    dom.rumorForm.addEventListener("submit", onPostRumor);
    dom.chatForm.addEventListener("submit", onSendMessage);
    dom.limitOrderForm.addEventListener("submit", onPlaceLimitOrder);
    dom.bettingForm.addEventListener("submit", onPlaceBet);
    dom.pvpForm.addEventListener("submit", onCreatePvP);
    dom.resetPasswordLink.addEventListener("click", onResetPassword);
    dom.prestigeButton.addEventListener("click", onPrestigeReset);
    dom.orderTabMarket.addEventListener("click", onSelectOrderTab);
    dom.orderTabLimit.addEventListener("click", onSelectOrderTab);
    dom.historyTabButtons.forEach(btn => btn.addEventListener("click", onSelectHistoryTab));
    dom.modalCloseButton.addEventListener("click", () => dom.modalOverlay.classList.add("hidden"));
    dom.modalOverlay.addEventListener("click", (e) => { if (e.target === dom.modalOverlay) dom.modalOverlay.classList.add("hidden"); });
    dom.showRegisterLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.add("show-register"); showAuthMessage(""); });
    dom.showLoginLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.remove("show-register"); showAuthMessage(""); });
    dom.userInfo.addEventListener("click", () => {
    if (currentUserId) showUserProfile(currentUserId);
    });

    // --- OBSŁUGA WYCISZANIA (MUTE) ---
    let isMuted = localStorage.getItem('gameMuted') === 'true';

    function updateMuteState() {
        const icon = dom.muteButton.querySelector('i');
        if (isMuted) {
            icon.classList.remove('fa-volume-high');
            icon.classList.add('fa-volume-xmark');
            dom.muteButton.style.color = 'var(--red)';
        } else {
            icon.classList.remove('fa-volume-xmark');
            icon.classList.add('fa-volume-high');
            dom.muteButton.style.color = ''; 
        }
        if(dom.audioKaching) dom.audioKaching.muted = isMuted;
        if(dom.audioError) dom.audioError.muted = isMuted;
        if(dom.audioNews) dom.audioNews.muted = isMuted;
    }

    if(dom.muteButton) {
        updateMuteState();
        dom.muteButton.addEventListener("click", () => {
            isMuted = !isMuted;
            localStorage.setItem('gameMuted', isMuted);
            updateMuteState();
        });
    }

    // --- OBSŁUGA ZAKŁADEK GIER (ZMODYFIKOWANA) ---
    const gameNavButtons = document.querySelectorAll('.game-nav-btn');
    const gameTabs = document.querySelectorAll('.game-tab-content');

    function switchGameTab(e) {
        const targetTab = e.currentTarget.dataset.gameTab;
        const requiredLevel = GAME_UNLOCKS[targetTab] || 0;
        
        if (portfolio.prestigeLevel < requiredLevel) {
            const stars = '⭐️'.repeat(requiredLevel);
            showMessage(`Wymagany poziom prestiżu: ${requiredLevel} (${stars})`, "error");
            if(dom.audioError) dom.audioError.play().catch(()=>{});
            return; 
        }

        gameNavButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.gameTab === targetTab);
        });

        gameTabs.forEach(tab => {
            if (tab.id === `tab-game-${targetTab}`) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    gameNavButtons.forEach(btn => {
        btn.addEventListener('click', switchGameTab);
    });
    
    // CRASH LISTENERS
    if(dom.btnCrashAction) dom.btnCrashAction.addEventListener("click", onCrashAction);
    if(dom.crashCanvas) initCrashCanvas(); 

    // --- OBSŁUGA PŁYWAJĄCEGO CZATU ---
    const chatFab = document.getElementById("chat-fab");
    const chatWindow = document.getElementById("floating-chat-window");
    const closeChatBtn = document.getElementById("close-chat-btn");
    const chatBadge = document.getElementById("chat-badge");
    const chatFeedRef = document.getElementById("chat-feed"); 

    function toggleChat() {
        if(!chatWindow) return;
        chatWindow.classList.toggle("hidden");
        if (!chatWindow.classList.contains("hidden")) {
            if(chatBadge) chatBadge.classList.add("hidden");
            setTimeout(() => {
                if(chatFeedRef) chatFeedRef.scrollTop = chatFeedRef.scrollHeight;
            }, 100);
        }
    }

    if (chatFab) chatFab.addEventListener("click", toggleChat);
    if (closeChatBtn) closeChatBtn.addEventListener("click", toggleChat);

    document.addEventListener("click", (e) => {
        if (chatWindow && !chatWindow.classList.contains("hidden") && 
            !chatWindow.contains(e.target) && 
            !chatFab.contains(e.target)) {
            chatWindow.classList.add("hidden");
        }
    });
    startAuthListener();
});

// --- OBSŁUGA DANYCH PORTFELA ---
function listenToPortfolioData(userId) {
    unsubscribePortfolio = onSnapshot(doc(db, "uzytkownicy", userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            portfolio.name = data.name;
            portfolio.cash = data.cash;
            
            let shares = data.shares || {};
            if(shares['bartcoin'] !== undefined) {
                shares['nicorp'] = (shares['nicorp'] || 0) + shares['bartcoin'];
                delete shares['bartcoin'];
            }
            portfolio.shares = shares;

            portfolio.stats = data.stats || portfolio.stats;
            portfolio.startValue = data.startValue;
            portfolio.prestigeLevel = data.prestigeLevel || 0; 
            updatePortfolioUI();
            checkCryptoAccess();
        }
    });
}

// --- ANIMOWANA AKTUALIZACJA PORTFELA ---
function updatePortfolioUI() {
    if (!dom || !dom.username) return;
    
    const stars = getPrestigeStars(portfolio.prestigeLevel);
    dom.username.innerHTML = `${portfolio.name} ${stars}`;
    
    // --- 1. ANIMACJA GOTÓWKI (Rolling Numbers) ---
    if (typeof portfolio.displayedCash === 'undefined') {
        portfolio.displayedCash = portfolio.cash; 
        dom.cash.textContent = formatujWalute(portfolio.cash);
        if(dom.entertainmentCash) dom.entertainmentCash.textContent = formatujWalute(portfolio.cash);
    } else {
        if (portfolio.displayedCash !== portfolio.cash) {
            animateValue(dom.cash, portfolio.displayedCash, portfolio.cash, 1000); 
            if(dom.entertainmentCash) {
                animateValue(dom.entertainmentCash, portfolio.displayedCash, portfolio.cash, 1000);
            }
            portfolio.displayedCash = portfolio.cash; 
        }
    }

    // --- 2. OBLICZANIE WARTOŚCI PORTFELA NA BIEŻĄCO ---
    let html = "";
    let sharesValue = 0;
    const series = [portfolio.cash]; 
    const labels = ['Gotówka'];

    COMPANY_ORDER.forEach(cid => {
        const amount = portfolio.shares[cid] || 0;
        const company = market[cid];
        const currentPrice = company ? company.price : 0;
        const value = amount * currentPrice;

        if (value > 0) {
            sharesValue += value;
            series.push(value);
            labels.push(company.name);
        }

        html += `
            <div class="asset-row">
                <span class="asset-name">${company ? company.name : cid}:</span>
                <span class="asset-value">
                    <strong id="shares-${cid}">${amount}</strong> szt.
                </span>
            </div>`;
    });

    dom.sharesList.innerHTML = html;

    const total = portfolio.cash + sharesValue;
    const profit = total - portfolio.startValue;

    // --- 3. ANIMACJA CAŁKOWITEJ WARTOŚCI ---
    if (typeof portfolio.displayedTotal === 'undefined') {
        portfolio.displayedTotal = total;
        dom.totalValue.textContent = formatujWalute(total);
    } else if (portfolio.displayedTotal !== total) {
        animateValue(dom.totalValue, portfolio.displayedTotal, total, 1000);
        portfolio.displayedTotal = total;
    }

    // --- 4. ANIMACJA ZYSKU ---
    if (typeof portfolio.displayedProfit === 'undefined') {
        portfolio.displayedProfit = profit;
        dom.totalProfit.textContent = formatujWalute(profit);
    } else if (portfolio.displayedProfit !== profit) {
        animateValue(dom.totalProfit, portfolio.displayedProfit, profit, 1000);
        portfolio.displayedProfit = profit;
    }
    
    dom.totalProfit.style.color = profit >= 0 ? "var(--green)" : "var(--red)";

    if (!portfolioChart) {
        portfolioChart = new ApexCharts(dom.portfolioChartContainer, {
            series: series,
            labels: labels,
            chart: { 
                type: 'donut', 
                height: 280, 
                background: 'transparent',
                fontFamily: 'inherit'
            },
            colors: CHART_COLORS,
            theme: { mode: 'dark' },
            stroke: { show: false }, 
            dataLabels: { enabled: false }, 
            legend: { show: false }, 
            plotOptions: {
                pie: {
                    donut: {
                        size: '70%',
                        labels: {
                            show: true,
                            name: { show: true, color: '#888', offsetY: -10 },
                            value: { 
                                show: true, 
                                color: 'var(--text-main)', 
                                fontSize: '22px', 
                                fontWeight: 'bold', 
                                offsetY: 10,
                                formatter: (val) => formatujWalute(val)
                            },
                            total: {
                                show: true,
                                showAlways: true,
                                label: 'Razem',
                                color: '#888',
                                fontSize: '14px',
                                formatter: function (w) {
                                    const sum = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                    return formatujWalute(sum);
                                }
                            }
                        }
                    }
                }
            }
        });
        portfolioChart.render();
    } else {
        portfolioChart.updateOptions({ series: series, labels: labels });
    }

    if (dom.modalOverlay && !dom.modalOverlay.classList.contains("hidden")) updatePrestigeButton(total, portfolio.prestigeLevel);
}

// --- FUNKCJE HANDLU ---
function onSelectCompany(e) { if(e.target.classList.contains("company-tab")) changeCompany(e.target.dataset.company); }
function changeCompany(cid) {
    if(!market[cid]) return;
    currentCompanyId = cid;
    dom.companyName.textContent = market[cid].name;
    document.querySelectorAll(".company-tab").forEach(t => t.classList.toggle("active", t.dataset.company === cid));
    if(chart) chart.updateSeries([{ data: market[cid].history || [] }]);
    updatePriceUI();
    checkCryptoAccess();
}

async function buyShares() { await tradeShares(true); }
async function sellShares() { await tradeShares(false); }
async function tradeShares(isBuy) {
    if(dom.orderPanel.classList.contains("crypto-locked")) return showMessage("Wymagany wyższy poziom prestiżu", "error");
    const amount = parseInt(dom.amountInput.value);
    if(isNaN(amount) || amount <= 0) return showMessage("Błędna ilość", "error");
    const cid = currentCompanyId;
    const price = market[cid].price;
    const cost = amount * price;
    try {
        await runTransaction(db, async (t) => {
            const uRef = doc(db, "uzytkownicy", currentUserId);
            const uDoc = await t.get(uRef);
            const d = uDoc.data();
            if(isBuy && d.cash < cost) throw new Error("Brak środków");
            if(!isBuy && (d.shares[cid]||0) < amount) throw new Error("Brak akcji");
            const newCash = isBuy ? d.cash - cost : d.cash + cost;
            const newShares = {...d.shares};
            newShares[cid] = isBuy ? (newShares[cid]||0) + amount : newShares[cid] - amount;
            const newVal = calculateTotalValue(newCash, newShares);
            t.update(uRef, { cash: newCash, shares: newShares, totalValue: newVal, 'stats.totalTrades': increment(1) });
        });
        await addDoc(collection(db, "historia_transakcji"), {
            userId: currentUserId, userName: portfolio.name, type: isBuy ? "KUPNO" : "SPRZEDAŻ",
            companyName: market[cid].name, amount, pricePerShare: price, totalValue: isBuy ? -cost : cost,
            timestamp: serverTimestamp(), status: "executed"
        });
        showMessage((isBuy ? "Kupiono " : "Sprzedano ") + amount + " akcji", "success");
    } catch(e) { showMessage(e.message, "error"); }
}

function calculateTotalValue(cash, shares) {
    let val = cash;
    for(let cid in shares) if(market[cid]) val += shares[cid] * market[cid].price;
    return val;
}

// --- INITIALIZATION CHARTS ---
function initChart() {
    chart = new ApexCharts(dom.chartContainer, {
        series: [{ data: market[currentCompanyId].history }],
        chart: { type: 'candlestick', height: 350, toolbar: {show:false}, animations: {enabled:false}, background: 'transparent' },
        theme: { mode: 'dark' },
        xaxis: { type: 'datetime' },
        yaxis: { labels: { formatter: v => v.toFixed(2) } },
        plotOptions: { candlestick: { colors: { upward: '#00e676', downward: '#ff1744' } } }
    });
    chart.render();
}

function startChartTicker() {
    if (window.chartTickerInterval) clearInterval(window.chartTickerInterval);
    window.chartTickerInterval = setInterval(() => {
        for (const companyId in market) {
            const company = market[companyId];
            const history = company.history;
            if (!history || history.length === 0) continue;
            const lastCandle = history[history.length - 1];
            const lastTime = new Date(lastCandle.x).getTime();
            const newTime = lastTime + 15000;
            const open = parseFloat(lastCandle.y[3]);
            const close = company.price; 
            const volatility = company.price * 0.005; 
            const randomHigh = Math.random() * volatility;
            const randomLow = Math.random() * volatility;
            const high = Math.max(open, close) + randomHigh;
            const low = Math.min(open, close) - randomLow;
            const newCandle = {
                x: new Date(newTime),
                y: [open.toFixed(2), high.toFixed(2), low.toFixed(2), close.toFixed(2)]
            };
            history.push(newCandle);
            if (history.length > 50) history.shift();
        }
        if (chart && market[currentCompanyId].history.length > 0) {
            chart.updateSeries([{ data: market[currentCompanyId].history }]);
        }
    }, 15000); 
}

// --- AUTH LOGIC START ---
function startAuthListener() {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            dom.simulatorContainer.classList.remove("hidden");
            dom.authContainer.classList.add("hidden");
            const oneTimeClickListener = () => { unlockAudio(); document.body.removeEventListener('click', oneTimeClickListener); };
            document.body.addEventListener('click', oneTimeClickListener);
            
            listenToPortfolioData(currentUserId);
            listenToRumors();
            listenToMarketNews(); 
            listenToLeaderboard();
            listenToChat(); 
            listenToGlobalHistory();
            listenToPersonalHistory(currentUserId);
            listenToLimitOrders(currentUserId);
            listenToActiveBets(currentUserId);
            listenToPvP();
            listenToActiveMatch();
            
            dom.navButtons[0].click();
        } else {
            currentUserId = null;
            dom.simulatorContainer.classList.add("hidden");
            dom.authContainer.classList.remove("hidden");
            dom.authContainer.classList.remove("show-register");
            
            if (unsubscribePortfolio) unsubscribePortfolio();
            chartHasStarted = false; chart = null; portfolioChart = null;
        }
    });
}

function unlockAudio() {
    if (audioUnlocked) return; 
    try {
        dom.audioKaching.play().catch(e => {}); dom.audioKaching.pause();
        dom.audioError.play().catch(e => {}); dom.audioError.pause();
        dom.audioNews.play().catch(e => {}); dom.audioNews.pause();
        audioUnlocked = true;
    } catch (e) {}
}


// --- HANDLERS (Pozostałe) ---
function onBuyMax() { const p = market[currentCompanyId].price; if(p>0) dom.amountInput.value = Math.floor(portfolio.cash/p); }
function onSellMax() { dom.amountInput.value = portfolio.shares[currentCompanyId]||0; }
function onSelectMarketType(e) {
    const type = e.target.dataset.marketType;
    
    // --- BLOKADA KRYPTO (Poziom 4) ---
    if (type === 'crypto' && portfolio.prestigeLevel < CRYPTO_PRESTIGE_REQUIREMENT) {
        e.preventDefault(); 
        showMessage(`Krypto wymaga ${CRYPTO_PRESTIGE_REQUIREMENT} poziomu prestiżu!`, "error");
        return; 
    }
    // ---------------------------

    dom.marketTypeTabs.forEach(t => t.classList.toggle("active", t.dataset.marketType === type));
    dom.companySelector.classList.toggle("hidden", type !== 'stocks');
    dom.cryptoSelector.classList.toggle("hidden", type !== 'crypto');
    
    changeCompany(type === 'stocks' ? 'ulanska' : 'nicorp');
}
function onSelectOrderTab(e) {
    const t = e.target.dataset.orderType;
    dom.orderTabMarket.classList.toggle("active", t === 'market');
    dom.orderTabLimit.classList.toggle("active", t === 'limit');
    dom.orderMarketContainer.classList.toggle("active", t === 'market');
    dom.orderLimitContainer.classList.toggle("active", t === 'limit');
}
function onSelectHistoryTab(e) {
    const t = e.target.dataset.tab;
    dom.historyTabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `tab-${t}`));
}

// --- NEWSY I PLOTKI ---
function listenToMarketNews() {
    unsubscribeNews = onSnapshot(query(collection(db, "gielda_news"), orderBy("timestamp", "desc"), limit(10)), snap => {
        if (!initialNewsLoaded) dom.newsFeed.innerHTML = "";
        
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                const n = change.doc.data();
                
                if (initialNewsLoaded) showNotification(n.text, 'news', n.impactType);

                const iconClass = n.impactType === 'positive' ? 'fa-arrow-trend-up' : 'fa-triangle-exclamation';
                
                const html = `
                    <div class="feed-item ${n.impactType}">
                        <div class="feed-icon"><i class="fa-solid ${iconClass}"></i></div>
                        <div class="feed-content">
                            <div class="feed-header">
                                <span>WIADOMOŚĆ RYNKOWA</span>
                            </div>
                            <div class="feed-text">${n.text}</div>
                        </div>
                    </div>
                `;
                
                dom.newsFeed.insertAdjacentHTML('afterbegin', html);
                if (dom.newsFeed.children.length > 10) {
                    dom.newsFeed.lastElementChild.remove();
                }
            }
        });
        initialNewsLoaded = true;
    });
}

function listenToRumors() {
    unsubscribeRumors = onSnapshot(query(collection(db, "plotki"), orderBy("timestamp", "desc"), limit(15)), snap => {
        dom.rumorsFeed.innerHTML = "";
        snap.forEach(d => {
            const r = d.data();
            const companyName = market[r.companyId] ? market[r.companyId].name : '???';
            
            const impactClass = r.sentiment === 'positive' ? 'positive' : 'negative';
            const iconClass = r.sentiment === 'positive' ? 'fa-bullhorn' : 'fa-user-secret';

            const html = `
                <div class="feed-item ${impactClass}">
                    <div class="feed-icon"><i class="fa-solid ${iconClass}"></i></div>
                    <div class="feed-content">
                        <div class="feed-header">
                            <span>${companyName}</span>
                            <span style="font-weight:normal; opacity:0.7">Plotka</span>
                        </div>
                        <div class="feed-text">${r.text}</div>
                        <span class="feed-author">~ ${r.authorName} ${getPrestigeStars(r.prestigeLevel || 0)}</span>
                    </div>
                </div>
            `;
            dom.rumorsFeed.innerHTML += html;
        });
    });
}
async function onPostRumor(e) {
    e.preventDefault();
    const txt = dom.rumorInput.value;
    const cid = document.getElementById("rumor-company-select").value;
    const sent = document.querySelector('input[name="sentiment"]:checked').value;
    if(!txt) return;
    await addDoc(collection(db, "plotki"), { text: txt, authorId: currentUserId, authorName: portfolio.name, prestigeLevel: portfolio.prestigeLevel, timestamp: new Date(), companyId: cid, sentiment: sent, impact: (Math.random()*0.04+0.01)*(sent==='positive'?1:-1) });
    dom.rumorInput.value = "";
}

// --- POZOSTAŁE FUNKCJE ---

function listenToChat() {
    unsubscribeChat = onSnapshot(query(collection(db, "chat_messages"), orderBy("timestamp", "desc"), limit(30)), snap => {
        dom.chatFeed.innerHTML = "";
        snap.docs.slice().reverse().forEach(d => {
            const m = d.data();
            dom.chatFeed.innerHTML += `<p class="${m.authorId===currentUserId?'my-message':''}"><strong onclick="showUserProfile('${m.authorId}')">${m.authorName}</strong>${getPrestigeStars(m.prestigeLevel,'chat')}: ${m.text}</p>`;
        });
        dom.chatFeed.scrollTop = dom.chatFeed.scrollHeight;
        if (initialChatLoaded) {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const m = change.doc.data();
                    if (m.authorId !== currentUserId) {
                        showNotification(`${m.authorName}: ${m.text}`, 'chat');
                        
                        const floatWindow = document.getElementById("floating-chat-window");
                        const badge = document.getElementById("chat-badge");
                        if (floatWindow && floatWindow.classList.contains("hidden") && badge) {
                            badge.classList.remove("hidden");
                        }
                    }
                }
            });
        }
        initialChatLoaded = true;
    });
}
async function onSendMessage(e) {
    e.preventDefault();
    if(isChatCooldown) return showMessage("Zwolnij!", "error");
    const txt = dom.chatInput.value.trim();
    if(!txt) return;
    isChatCooldown = true;
    await addDoc(collection(db, "chat_messages"), { text: txt, authorName: portfolio.name, authorId: currentUserId, prestigeLevel: portfolio.prestigeLevel, timestamp: serverTimestamp() });
    dom.chatInput.value = "";
    setTimeout(() => isChatCooldown = false, 15000);
}

function listenToLeaderboard() {
    unsubscribeLeaderboard = onSnapshot(query(collection(db, "uzytkownicy"), orderBy("totalValue", "desc"), limit(10)), snap => {
        dom.leaderboardList.innerHTML = "";
        let r = 1;
        snap.forEach(d => {
            const u = d.data();
            dom.leaderboardList.innerHTML += `
                <li class="${d.id === currentUserId ? 'highlight-me' : ''}">
                    <div onclick="showUserProfile('${d.id}')">
                        ${r}. ${u.name} ${getPrestigeStars(u.prestigeLevel)}
                    </div>
                    <div>${formatujWalute(u.totalValue)}</div>
                </li>`;
            r++;
        });
    });
}

async function onPlaceLimitOrder(e) {
    e.preventDefault();
    if (!currentUserId) return;
    if (dom.orderPanel.classList.contains("crypto-locked")) return showMessage("Wymagany wyższy poziom", "error");
    const type = dom.limitType.value;
    const amount = parseInt(dom.limitAmount.value);
    const limitPrice = parseFloat(dom.limitPrice.value);
    const cid = currentCompanyId;
    const isBuy = type === 'buy';
    const isCrypto = market[cid].type === 'crypto';
    
    if (amount <= 0 || limitPrice <= 0) return showMessage("Błędne dane", "error");
    if (isBuy && amount * limitPrice > portfolio.cash) return showMessage("Brak gotówki", "error");
    if (!isBuy && amount > (portfolio.shares[cid]||0)) return showMessage("Brak akcji", "error");

    try {
        const orderType = isBuy ? (isCrypto?"KUPNO (Limit, Krypto)":"KUPNO (Limit)") : (isCrypto?"SPRZEDAŻ (Limit, Krypto)":"SPRZEDAŻ (Limit)");
        await addDoc(collection(db, "limit_orders"), {
            userId: currentUserId, userName: portfolio.name, prestigeLevel: portfolio.prestigeLevel,
            companyId: cid, companyName: market[cid].name, type: orderType,
            amount, limitPrice, status: "pending", timestamp: serverTimestamp()
        });
        showMessage("Zlecenie limit przyjęte!", "success");
        dom.limitOrderForm.reset();
    } catch(e) { showMessage("Błąd serwera", "error"); }
}

function listenToLimitOrders(userId) {
    if (unsubscribeLimitOrders) unsubscribeLimitOrders();

    unsubscribeLimitOrders = onSnapshot(query(collection(db, "limit_orders"), where("userId", "==", userId), orderBy("timestamp", "desc")), snap => {
        dom.limitOrdersFeed.innerHTML = "";
        if (snap.empty) {
            dom.limitOrdersFeed.innerHTML = "<p style='padding:10px; color:var(--text-muted); text-align:center;'>Brak aktywnych zleceń limit.</p>";
            return;
        }

        snap.forEach(d => {
            const o = d.data();
            const div = document.createElement("div");
            div.className = "history-row";

            const isBuy = o.type.includes("KUPNO");
            const typeClass = isBuy ? "h-buy" : "h-sell";
            const typeLabel = isBuy ? "KUPNO" : "SPRZED.";

            let timeStr = "--:--";
            if (o.timestamp) {
                timeStr = new Date(o.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            let actionHtml = `<span class="h-time">${o.status}</span>`;
            if (o.status === 'pending') {
                actionHtml = `<button onclick="cancelLimit('${d.id}')" style="background: transparent; border: 1px solid var(--red); color: var(--red); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8em; font-weight:bold;">ANULUJ</button>`;
            }

            div.innerHTML = `
                <span class="h-col h-time">${timeStr}</span>
                <span class="h-col h-type ${typeClass}">${typeLabel}</span>
                <span class="h-col h-asset">
                    ${o.companyName}
                    <br><span style="font-size:0.8em; color:var(--text-muted); font-weight:normal;">${o.amount} szt. po ${o.limitPrice} zł</span>
                </span>
                <span class="h-col h-val" style="text-align:right;">${actionHtml}</span>
            `;

            dom.limitOrdersFeed.appendChild(div);
        });
    });
}
window.cancelLimit = async function(id) { if(confirm("Anulować?")) await updateDoc(doc(db, "limit_orders", id), {status: "cancelled"}); };

// --- BUKMACHERKA ---
function listenToActiveMatch() {
    if (unsubscribeMatch) unsubscribeMatch();
    unsubscribeMatch = onSnapshot(doc(db, "global", "zaklady"), (docSnap) => {
        if (docSnap.exists()) {
            matchesCache = docSnap.data().mecze || [];
            renderBettingPanel();
        } else {
            dom.matchInfo.innerHTML = "<p>Brak danych zakładów.</p>";
        }
    });
}

function listenToActiveBets(userId) {
    if (unsubscribeActiveBets) unsubscribeActiveBets();
    const q = query(collection(db, "active_bets"), where("userId", "==", userId), orderBy("createdAt", "desc"));
    
    unsubscribeActiveBets = onSnapshot(q, (snap) => {
        dom.activeBetsFeed.innerHTML = "";
        const pendingBets = snap.docs.filter(d => d.data().status === 'pending');

        if (pendingBets.length === 0) {
            dom.activeBetsFeed.innerHTML = "<p>Brak zakładów w toku.</p>";
            return;
        }

        snap.forEach(d => {
            const bet = d.data();
            if (bet.status !== 'pending') return; 

            let pickedTeamName = "???";
            let cleanTitle = (bet.matchTitle || "").split(" [")[0]; 
            let teams = cleanTitle.split(" vs ");

            if (bet.betOn === 'draw') {
                pickedTeamName = "REMIS";
            } else if (teams.length >= 2) {
                if (bet.betOn === 'teamA') pickedTeamName = teams[0].trim();
                if (bet.betOn === 'teamB') pickedTeamName = teams[1].trim();
            } else {
                pickedTeamName = bet.betOn === 'teamA' ? 'Gospodarz' : 'Gość';
            }

            const html = `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; font-size: 0.9em; color: var(--accent-color);">${cleanTitle}</span>
                        <span style="color: var(--text-muted); font-weight: 800; font-size: 0.8em;">W TOKU</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #ccc; margin-top: 4px;">
                        <span>Twój typ: <strong style="color: white; font-size: 1.1em;">${pickedTeamName}</strong> (@${bet.odds.toFixed(2)})</span>
                    </div>
                    <div style="text-align: right; font-size: 0.85em; margin-top: 2px;">
                        Stawka: ${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(bet.betAmount)}
                    </div>
                </div>`;
            dom.activeBetsFeed.insertAdjacentHTML('beforeend', html);
        });
    });
}
function renderBettingPanel() {
    dom.matchInfo.innerHTML = "";
    dom.bettingForm.classList.add("hidden");

    if (!matchesCache || matchesCache.length === 0) {
        dom.matchInfo.innerHTML = "<p>Obecnie brak zaplanowanych meczów.</p>";
        return;
    }

    const matchesByDay = {};
    matchesCache.forEach(match => {
        const date = match.closeTime.toDate();
        const dateKey = date.toISOString().split('T')[0];
        if (!matchesByDay[dateKey]) matchesByDay[dateKey] = [];
        matchesByDay[dateKey].push(match);
    });

    const sortedDays = Object.keys(matchesByDay).sort();
    if (!activeDayTab || !matchesByDay[activeDayTab]) activeDayTab = sortedDays[0];

    const navContainer = document.createElement("div");
    navContainer.className = "betting-days-nav";

    sortedDays.forEach(dayKey => {
        const btn = document.createElement("button");
        btn.className = "day-tab-btn";
        if (dayKey === activeDayTab) btn.classList.add("active");
        
        const dateObj = new Date(dayKey);
        const btnLabel = dateObj.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });
        btn.textContent = btnLabel.charAt(0).toUpperCase() + btnLabel.slice(1);
        
        btn.onclick = () => { 
            activeDayTab = dayKey; 
            renderBettingPanel();
        };
        navContainer.appendChild(btn);
    });
    dom.matchInfo.appendChild(navContainer);

    const dayMatches = matchesByDay[activeDayTab];
    dayMatches.sort((a, b) => a.closeTime.seconds - b.closeTime.seconds);

    const table = document.createElement("table");
    table.className = "betting-table";
    table.innerHTML = `
        <thead>
            <tr>
                <th class="col-time">Godzina</th>
                <th class="col-match">Mecz</th>
                <th class="col-odds">Kursy (1 - X - 2)</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    dayMatches.forEach(match => {
        
        const tr = document.createElement("tr");
        const date = match.closeTime.toDate();
        const timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        
        const isClosed = match.status !== 'open';
        const isResolved = match.status === 'resolved';

        let timeHtml = timeStr;
        if (isResolved) timeHtml = "Koniec";
        else if (isClosed) timeHtml = `<span class="match-live">LIVE</span>`;

        let matchHtml = `<strong>${match.teamA}</strong> <small>vs</small> <strong>${match.teamB}</strong>`;
        if (isResolved) {
            let w = match.winner === 'draw' ? 'REMIS' : (match.winner === 'teamA' ? match.teamA : match.teamB);
            matchHtml += `<br><span class="match-finished">Wynik: ${w}</span>`;
        }

        const createBtn = (teamCode, odds, label) => `
            <button class="table-bet-btn" ${isClosed ? 'disabled' : ''}
                onclick="selectBet('${match.id}', '${teamCode}', ${odds}, '${match.teamA} vs ${match.teamB} [${label}]')">
                <span style="display:block; font-size:0.75em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85px;">${label}</span>
                <small style="color:var(--accent-color); font-weight:bold; font-size:0.9em;">${odds.toFixed(2)}</small>
            </button>`;

        const oddsHtml = `<div class="odds-btn-group">
            ${createBtn('teamA', match.oddsA, match.teamA)}
            ${createBtn('draw', match.oddsDraw, 'REMIS')}
            ${createBtn('teamB', match.oddsB, match.teamB)}
        </div>`;

        tr.innerHTML = `<td class="col-time">${timeHtml}</td><td class="col-match">${matchHtml}</td><td class="col-odds">${oddsHtml}</td>`;
        tbody.appendChild(tr);
    });
    
    dom.matchInfo.appendChild(table);
}

window.selectBet = function(id, team, odds, label) {
    currentBetSelection = { id, team, odds, matchTitle: label };
    
    dom.bettingForm.classList.remove("hidden");
    
    const cleanLabel = label.split('[')[0].trim();
    
    dom.placeBetButton.textContent = `Postaw na: ${cleanLabel} (Kurs: ${odds.toFixed(2)})`;
    dom.placeBetButton.style.background = "var(--green)";
    dom.placeBetButton.style.color = "#000";
    
    dom.bettingForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    dom.betAmount.focus();
};

async function onPlaceBet(e) {
    e.preventDefault();
    if (!currentBetSelection || !currentUserId) return;
    
    const amount = parseFloat(dom.betAmount.value);
    
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj poprawną kwotę", "error");
    if (amount > portfolio.cash) return showMessage("Brak gotówki", "error");

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await transaction.get(userRef);
            
            if(userDoc.data().cash < amount) throw new Error("Brak środków (walidacja serwera)");
            
            const newCash = userDoc.data().cash - amount;
            const newVal = calculateTotalValue(newCash, userDoc.data().shares);
            
            transaction.update(userRef, { cash: newCash, totalValue: newVal });
            
            const betRef = doc(collection(db, "active_bets"));
            transaction.set(betRef, {
                userId: currentUserId,
                userName: portfolio.name,
                matchId: currentBetSelection.id,
                matchTitle: currentBetSelection.matchTitle, 
                betOn: currentBetSelection.team, 
                odds: currentBetSelection.odds,
                betAmount: amount,
                matchResolveTime: null, 
                status: "pending",
                createdAt: serverTimestamp()
            });
        });

        await addDoc(collection(db, "historia_transakcji"), {
            userId: currentUserId, userName: portfolio.name,
            type: "ZAKŁAD SPORTOWY", companyName: "Bukmacher",
            amount: 1, pricePerShare: currentBetSelection.odds, totalValue: -amount,
            timestamp: serverTimestamp(), status: "executed"
        });

        showMessage("Zakład przyjęty!", "success");
        dom.betAmount.value = "";
        dom.bettingForm.classList.add("hidden");
        
    } catch (err) {
        console.error(err);
        showMessage("Błąd: " + err.message, "error");
    }
}

// ==========================================
// === SYSTEM PVP ===
// ==========================================

const playedAnimations = new Set(); 
const CARD_WIDTH = 120; 
const WINNER_INDEX = 60; 

function getSeededRandom(seedStr) {
    let h = 0x811c9dc5;
    for (let i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h >>> 0) / 4294967296);
    }
}

function listenToPvP() {
    if (typeof unsubscribePvP !== 'undefined' && unsubscribePvP) unsubscribePvP();

    const q = query(
        collection(db, "pvp_duels"), 
        where("status", "in", ["open", "battling"]), 
        limit(20) 
    );
    
    unsubscribePvP = onSnapshot(q, (snap) => {
        dom.pvpFeed.innerHTML = "";
        
        let duels = [];
        snap.forEach(doc => duels.push({ id: doc.id, ...doc.data() }));

        duels.sort((a, b) => b.createdAt - a.createdAt);

        if (duels.length === 0) {
            dom.pvpFeed.innerHTML = "<p>Arena jest pusta. Stwórz wyzwanie!</p>";
            return;
        }

        duels.forEach(duel => {
            if (duel.status === 'battling' && !playedAnimations.has(duel.id)) {
                playedAnimations.add(duel.id);
                triggerGlobalPvPAnimation(duel); 
            }

            const isMyDuel = duel.creatorId === currentUserId;
            const div = document.createElement("div");
            div.className = "pvp-item";
            
            let btnHtml = "";
            
            if (duel.status === 'battling') {
                div.classList.add('battling');
                btnHtml = `<span class="pvp-status-battling" style="color:var(--accent-color); font-weight:bold;">🎰 LOSOWANIE...</span>`;
            } else if (isMyDuel) {
                btnHtml = `<button class="pvp-join-btn" disabled style="background:#555; cursor:default;">Twoje</button>`;
            } else {
                btnHtml = `<button class="pvp-join-btn" onclick="joinPvP('${duel.id}', ${duel.amount}, '${duel.creatorName}')">WALCZ!</button>`;
            }

            div.innerHTML = `
                <div class="pvp-info">
                    <strong>${formatujWalute(duel.amount)}</strong>
                    <span>vs ${duel.creatorName} ${getPrestigeStars(duel.creatorPrestige || 0)}</span>
                </div>
                <div>${btnHtml}</div>
            `;
            dom.pvpFeed.appendChild(div);
        });
    });
}

async function onCreatePvP(e) {
    e.preventDefault();
    const amount = parseFloat(dom.pvpAmount.value);
    
    if (isNaN(amount) || amount < 1000) return showMessage("Minimum 1000 zł!", "error");
    if (amount > portfolio.cash) return showMessage("Brak środków!", "error");

    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const userData = userDoc.data();

            if (userData.cash < amount) throw new Error("Za mało gotówki!");

            const newCash = userData.cash - amount;
            const newVal = calculateTotalValue(newCash, userData.shares);
            
            t.update(userRef, { cash: newCash, totalValue: newVal });

            const duelRef = doc(collection(db, "pvp_duels"));
            t.set(duelRef, {
                creatorId: currentUserId,
                creatorName: portfolio.name,
                creatorPrestige: portfolio.prestigeLevel || 0,
                amount: amount,
                status: "open",
                createdAt: serverTimestamp()
            });
        });
        
        showMessage("Wyzwanie rzucone na arenę!", "success");
        dom.pvpAmount.value = "";
        
        await addDoc(collection(db, "chat_messages"), { 
            text: `⚔️ Stworzyłem wyzwanie PvP na ${formatujWalute(amount)}! Kto się odważy?`, 
            authorName: "SYSTEM", authorId: "sys", prestigeLevel: 0, timestamp: serverTimestamp() 
        });

    } catch (e) {
        showMessage("Błąd: " + e.message, "error");
    }
}

window.joinPvP = async function(duelId, amount, opponentName) {
    if (!confirm(`Czy na pewno chcesz postawić ${formatujWalute(amount)} i walczyć z ${opponentName}? Szansa wygranej: 50%.`)) return;
    if (portfolio.cash < amount) return showMessage("Nie stać Cię na tę walkę!", "error");

    try {
        let winnerName = "";
        let winnerAmount = amount * 2; 

        await runTransaction(db, async (t) => {
            const duelRef = doc(db, "pvp_duels", duelId);
            const joinerRef = doc(db, "uzytkownicy", currentUserId);
            const duelDoc = await t.get(duelRef);
            const joinerDoc = await t.get(joinerRef);
            
            if (!duelDoc.exists()) throw new Error("Wyzwanie nie istnieje!");
            if (duelDoc.data().status !== "open") throw new Error("Ktoś był szybszy!");
            if (joinerDoc.data().cash < amount) throw new Error("Brak środków!");

            const creatorRef = doc(db, "uzytkownicy", duelDoc.data().creatorId);
            const creatorWins = Math.random() > 0.5;
            let joinerCash = joinerDoc.data().cash - amount;
            
            if (creatorWins) {
                winnerName = duelDoc.data().creatorName;
                t.update(creatorRef, { cash: increment(winnerAmount), totalValue: increment(winnerAmount), zysk: increment(amount) });
                t.update(joinerRef, { cash: joinerCash, totalValue: calculateTotalValue(joinerCash, joinerDoc.data().shares), zysk: increment(-amount) });
            } else {
                winnerName = portfolio.name;
                joinerCash += winnerAmount;
                t.update(joinerRef, { cash: joinerCash, totalValue: calculateTotalValue(joinerCash, joinerDoc.data().shares), zysk: increment(amount) });
                t.update(creatorRef, { zysk: increment(-amount) });
            }

            t.update(duelRef, { 
                status: "battling", 
                winner: winnerName,
                joinerId: currentUserId,
                joinerName: portfolio.name 
            });
        });

        await addDoc(collection(db, "chat_messages"), { 
           text: `⚔️ PVP: ${portfolio.name} przyjął wyzwanie ${opponentName}! Losowanie zwycięzcy...`, 
           authorName: "SĘDZIA", authorId: "sys", prestigeLevel: 0, timestamp: serverTimestamp() 
        });

    } catch (e) {
        showMessage("Błąd: " + e.message, "error");
    }
};

function triggerGlobalPvPAnimation(duel) {
    const container = document.getElementById('pvp-embedded-roulette');
    const strip = document.getElementById('roulette-strip');
    const winnerText = document.getElementById('pvp-roulette-winner');
    const title = document.getElementById('pvp-vs-title');

    const rng = getSeededRandom(duel.id);

    container.classList.remove('hidden');
    
    strip.innerHTML = "";
    strip.style.transition = "none";
    strip.style.transform = "translateX(0px)";
    winnerText.textContent = "LOSOWANIE...";
    winnerText.className = "pvp-winner-text"; 
    winnerText.style.color = "var(--text-color)";
    
    if(title) title.innerHTML = `<span style="color:var(--blue)">${duel.creatorName}</span> vs <span style="color:var(--red)">${duel.joinerName}</span>`;

    const totalCards = 90;
    const cardsData = [];

    for (let i = 0; i < totalCards; i++) {
        if (i === WINNER_INDEX) {
            cardsData.push(duel.winner === duel.creatorName ? 'creator' : 'joiner');
        } else {
            cardsData.push(rng() > 0.5 ? 'creator' : 'joiner');
        }
    }

    cardsData.forEach(type => {
        const div = document.createElement('div');
        const isCreator = type === 'creator';
        div.className = `roulette-card ${isCreator ? 'card-creator' : 'card-joiner'}`;
        const name = isCreator ? duel.creatorName : duel.joinerName;
        const icon = isCreator ? '🔵' : '🔴';
        div.innerHTML = `<div class="card-icon">${icon}</div><div>${name}</div>`;
        strip.appendChild(div);
    });

    const windowElement = document.querySelector('.roulette-window.embedded');
    const windowWidth = windowElement ? windowElement.offsetWidth : 300;
    const winnerCenterPosition = (WINNER_INDEX * CARD_WIDTH) + (CARD_WIDTH / 2);
    
    const randomOffset = (rng() - 0.5) * (CARD_WIDTH * 0.7);
    
    const targetTranslate = (windowWidth / 2) - (winnerCenterPosition + randomOffset);

    setTimeout(() => {
        strip.style.transition = "transform 5s cubic-bezier(0.15, 0.85, 0.35, 1.0)";
        strip.style.transform = `translateX(${targetTranslate}px)`;
        
        setTimeout(() => {
            if (duel.winner === portfolio.name) {
                winnerText.textContent = "WYGRAŁEŚ!";
                winnerText.style.color = "var(--green)";
                if(dom.audioKaching) dom.audioKaching.play().catch(()=>{});
            } else {
                winnerText.textContent = `WYGRAŁ: ${duel.winner}`;
                winnerText.style.color = (duel.winner === duel.creatorName) ? "var(--blue)" : "var(--red)";
                
                if((currentUserId === duel.creatorId || currentUserId === duel.joinerId) && duel.winner !== portfolio.name) {
                   if(dom.audioError) dom.audioError.play().catch(()=>{});
                }
            }
            winnerText.classList.add('animate-winner-text');

            setTimeout(() => {
                container.classList.add('hidden'); 
                if (currentUserId === duel.joinerId) {
                    closeDuelInDb(duel.id);
                }
            }, 5000); 

        }, 5000); 

    }, 100);
}

async function closeDuelInDb(duelId) {
    try { await updateDoc(doc(db, "pvp_duels", duelId), { status: "closed" }); } catch(e) {}
}

// --- RULETKA ---
let isSpinning = false;
let currentSelection = null;
window.selectBetType = function(type, value) {
    if(isSpinning) return;
    currentSelection = { type, value };
    document.querySelectorAll('.casino-btn, .num-btn').forEach(b => b.classList.remove('selected'));
    if(type === 'color') document.querySelector(`.btn-${value}`).classList.add('selected');
    else document.querySelector(`.num-${value}`).classList.add('selected');
    dom.casinoStatus.textContent = `Wybrano: ${value}`;
};

window.commitSpin = async function() {
    if (isSpinning) return;
    if (!currentUserId) return showMessage("Zaloguj się!", "error");
    if (!currentSelection) return showMessage("Wybierz stawkę (kolor lub liczbę)!", "error");

    const amount = parseInt(dom.casinoAmount.value);
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj poprawną kwotę!", "error");
    if (amount > portfolio.cash) return showMessage("Brak środków!", "error");

    isSpinning = true;
    dom.casinoStatus.textContent = "Kręcimy... Powodzenia!";
    
    const allBtns = document.querySelectorAll('.casino-btn, .num-btn, .spin-btn');
    allBtns.forEach(b => b.disabled = true);
    if(dom.amountInput) dom.amountInput.disabled = true;

    const innerRing = document.querySelector('.inner');
    const dataContainer = document.querySelector('.data');
    const resultNumberEl = document.querySelector('.result-number');
    const resultColorEl = document.querySelector('.result-color');
    const resultBg = document.querySelector('.result');

    innerRing.removeAttribute('data-spinto');
    innerRing.classList.remove('rest');
    dataContainer.classList.remove('reveal');

    const winningNumber = Math.floor(Math.random() * 37);
    
    const redNumbers = [32, 19, 21, 25, 34, 27, 36, 30, 23, 5, 16, 1, 14, 9, 18, 7, 12, 3];
    let resultColor = 'black';
    if (winningNumber === 0) resultColor = 'green';
    else if (redNumbers.includes(winningNumber)) resultColor = 'red';

    setTimeout(() => {
        innerRing.setAttribute('data-spinto', winningNumber);
    }, 50);

    const spinDuration = 6000; 

    try {
        await new Promise(r => setTimeout(r, spinDuration));

        innerRing.classList.add('rest');
        resultNumberEl.textContent = winningNumber;
        resultColorEl.textContent = resultColor === 'red' ? 'CZERWONE' : (resultColor === 'black' ? 'CZARNE' : 'ZIELONE');
        resultBg.style.backgroundColor = resultColor === 'red' ? 'var(--red)' : (resultColor === 'green' ? 'var(--green)' : '#111');
        dataContainer.classList.add('reveal');

        const historyList = document.getElementById('previous-list');
        if(historyList) {
            const li = document.createElement('li');
            li.className = `previous-result color-${resultColor}`;
            li.textContent = winningNumber;
            historyList.prepend(li);
            if(historyList.children.length > 12) historyList.lastChild.remove();
        }

        let multiplier = 0;
        if (currentSelection.type === 'color' && currentSelection.value === resultColor) {
            multiplier = resultColor === 'green' ? 36 : 2;
        } else if (currentSelection.type === 'number' && parseInt(currentSelection.value) === winningNumber) {
            multiplier = 36; 
        }

        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const d = userDoc.data();

            if (d.cash < amount) throw new Error("Brak środków (walidacja serwera)");

            let newCash = d.cash;
            let newProfit = d.zysk || 0;

            if (multiplier > 0) {
                const winVal = amount * multiplier;
                newCash = newCash - amount + winVal;
                newProfit += (winVal - amount);
            } else {
                newCash -= amount;
                newProfit -= amount;
            }

            const totalVal = calculateTotalValue(newCash, d.shares);
            t.update(userRef, { cash: newCash, zysk: newProfit, totalValue: totalVal });
        });

        if (multiplier > 0) {
            const winText = formatujWalute(amount * multiplier);
            dom.casinoStatus.innerHTML = `<span style="color:var(--green)">WYGRANA! ${winText}</span>`;
            showNotification(`Wygrałeś ${winText} w ruletce!`, 'news', 'positive');
            if(dom.audioKaching) dom.audioKaching.play().catch(()=>{});
        } else {
            dom.casinoStatus.innerHTML = `<span style="color:var(--red)">Przegrana... -${formatujWalute(amount)}</span>`;
            if(dom.audioError) dom.audioError.play().catch(()=>{});
        }

    } catch (e) {
        console.error(e);
        showMessage("Błąd: " + e.message, "error");
    } finally {
        isSpinning = false;
        allBtns.forEach(b => b.disabled = false);
        if(dom.amountInput) dom.amountInput.disabled = false;
    }
};

// --- HISTORIA I PROFILE ---
function listenToGlobalHistory() { unsubscribeGlobalHistory = onSnapshot(query(collection(db, "historia_transakcji"), orderBy("timestamp", "desc"), limit(15)), snap => { dom.globalHistoryFeed.innerHTML=""; snap.forEach(d => displayHistoryItem(dom.globalHistoryFeed, d.data(), true)); }); }
function listenToPersonalHistory(uid) { unsubscribePersonalHistory = onSnapshot(query(collection(db, "historia_transakcji"), where("userId","==",uid), orderBy("timestamp", "desc"), limit(15)), snap => { dom.personalHistoryFeed.innerHTML=""; snap.forEach(d => displayHistoryItem(dom.personalHistoryFeed, d.data(), false)); }); }

function displayHistoryItem(feed, item, isGlobal) {
    const div = document.createElement("div");
    div.className = "history-row";
    
    let actionClass = "h-neutral";
    let displayType = item.type;

    if (item.type.includes("KUPNO")) {
        actionClass = "h-buy";
        displayType = "KUPNO"; 
    } else if (item.type.includes("SPRZEDAŻ")) {
        actionClass = "h-sell";
        displayType = "SPRZEDAŻ";
    } else if (item.type.includes("ZAKŁAD")) {
        actionClass = "h-bet";
        displayType = "ZAKŁAD";
    }

    let col1 = "";
    if (isGlobal) {
        col1 = `<span class="h-col h-user clickable-user" onclick="showUserProfile('${item.userId}')">${item.userName}</span>`;
    } else {
        let timeStr = "--:--";
        if (item.timestamp && item.timestamp.seconds) {
            const date = new Date(item.timestamp.seconds * 1000);
            timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        }
        col1 = `<span class="h-col h-time">${timeStr}</span>`;
    }

    div.innerHTML = `
        ${col1}
        <span class="h-col h-type ${actionClass}">${displayType}</span>
        <span class="h-col h-asset">${item.companyName}</span>
        <span class="h-col h-val">${formatujWalute(item.totalValue)}</span>
    `;
    
    feed.prepend(div);
}

window.showUserProfile = async function(uid) {
    const d = (await getDoc(doc(db, "uzytkownicy", uid))).data();
    
    dom.modalUsername.textContent = d.name;
    dom.modalTotalValue.textContent = formatujWalute(d.totalValue);
    dom.modalCash.textContent = formatujWalute(d.cash);
    dom.modalPrestigeLevel.textContent = d.prestigeLevel || 0;
    
    let sharesHtml = "";
    COMPANY_ORDER.forEach(cid => { 
        if((d.shares[cid]||0)>0) sharesHtml += `<p>${market[cid].name}: ${d.shares[cid]}</p>`; 
    });
    dom.modalSharesList.innerHTML = sharesHtml || "<p style='color:var(--text-muted)'>Brak aktywów</p>";
    
    dom.modalOverlay.classList.remove("hidden");

    const isMe = (uid === currentUserId);
    const currentLvl = d.prestigeLevel || 0;
    const nextRequirement = PRESTIGE_REQUIREMENTS[currentLvl];

    if (!isMe) {
        dom.prestigeButton.style.display = "none";
        dom.prestigeNextGoal.textContent = "";
        dom.prestigeInfo.style.display = "none"; 
    } 
    else if (nextRequirement === undefined) {
        dom.prestigeButton.style.display = "none";
        dom.prestigeNextGoal.textContent = "Maksymalny Prestiż Osiągnięty!";
        dom.prestigeInfo.style.display = "block";
    } 
    else {
        dom.prestigeButton.style.display = "block";
        dom.prestigeInfo.style.display = "block";
        dom.prestigeNextGoal.textContent = `Cel: ${formatujWalute(nextRequirement)}`;
        
        if (d.totalValue >= nextRequirement) {
            dom.prestigeButton.disabled = false;
            dom.prestigeButton.textContent = "AWANSUJ (Reset Konta)";
            dom.prestigeButton.classList.add("btn-green"); 
        } else {
            dom.prestigeButton.disabled = true;
            dom.prestigeButton.textContent = "Za mało środków";
            dom.prestigeButton.classList.remove("btn-green");
        }
    }
};

async function onPrestigeReset() {
    if(!confirm("To zresetuje Twoją gotówkę i akcje do zera, ale da Ci gwiazdkę prestiżu. Kontynuować?")) return;
    
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            const currentLvl = d.prestigeLevel || 0;
            
            if (currentLvl >= PRESTIGE_REQUIREMENTS.length) {
                throw new Error("Osiągnięto już maksymalny poziom!");
            }

            const req = PRESTIGE_REQUIREMENTS[currentLvl];
            if (d.totalValue < req) {
                throw new Error(`Brakuje środków! Wymagane: ${req}`);
            }

            t.update(ref, { 
                cash: 10000, 
                shares: {ulanska:0, rychbud:0, brzozair:0, cosmosanit:0, nicorp:0, igirium:0},
                startValue: 10000, 
                zysk: 0, 
                totalValue: 10000, 
                prestigeLevel: currentLvl + 1 
            });
        });
        
        dom.modalOverlay.classList.add("hidden");
        showMessage("Awans udany! Konto zresetowane.", "success");
        
        if(dom.audioKaching) dom.audioKaching.play().catch(()=>{});

    } catch(e) {
        showMessage(e.message, "error");
    }
}

// ==========================================
// === CRASH GAME LOGIC (Rakieta) ===
// ==========================================

function initCrashCanvas() {
    crashCanvas = dom.crashCanvas;
    if(!crashCanvas) return;
    crashCtx = crashCanvas.getContext('2d');
    crashCtx.lineCap = 'round';
    crashCtx.lineJoin = 'round';
    drawCrashFrame(true); 
}

async function onCrashAction() {
    if (!crashIsRunning) {
        const amount = parseInt(dom.crashAmount.value);
        if (isNaN(amount) || amount <= 0) return showMessage("Podaj stawkę!", "error");
        if (amount > portfolio.cash) return showMessage("Brak środków!", "error");
        if (!currentUserId) return showMessage("Zaloguj się!", "error");

        try {
            await runTransaction(db, async (t) => {
                const userRef = doc(db, "uzytkownicy", currentUserId);
                const userDoc = await t.get(userRef);
                const d = userDoc.data();
                if (d.cash < amount) throw new Error("Brak środków!");
                
                const newCash = d.cash - amount;
                const newVal = calculateTotalValue(newCash, d.shares);
                t.update(userRef, { cash: newCash, totalValue: newVal });
            });

            crashBetAmount = amount;
            startCrashGame();

        } catch (e) {
            showMessage(e.message, "error");
        }
    } 
    else if (crashIsRunning && !crashHasCashedOut) {
        doCrashCashout();
    }
}

function startCrashGame() {
    crashIsRunning = true;
    crashHasCashedOut = false;
    crashMultiplier = 1.00;
    crashCurvePoints = [{x: 0, y: crashCanvas.height}];
    
    dom.btnCrashAction.textContent = "WYPŁAĆ!";
    dom.btnCrashAction.classList.add("btn-cashout");
    dom.crashMultiplierText.classList.remove("crashed", "cashed-out");
    dom.crashInfo.textContent = `Lecimy za ${formatujWalute(crashBetAmount)}...`;
    if(dom.crashAmount) dom.crashAmount.disabled = true;

    const r = Math.random();
    crashCurrentCrashPoint = Math.max(1.00, (0.99 / (1 - r))); 
    if(crashCurrentCrashPoint > 50) crashCurrentCrashPoint = 50 + Math.random() * 50;

    let time = 0;
    clearInterval(crashGameLoop);
    
    crashGameLoop = setInterval(() => {
        time += 0.05; 
        
        crashMultiplier = Math.pow(Math.E, 0.06 * time); 

        updateCrashCurve();
        
        dom.crashMultiplierText.textContent = crashMultiplier.toFixed(2) + "x";
        
        if(crashHasCashedOut) {
        } else {
             dom.btnCrashAction.textContent = `WYPŁAĆ (${formatujWalute(crashBetAmount * crashMultiplier)})`;
        }

        if (crashMultiplier >= crashCurrentCrashPoint) {
            endCrashGame();
        }

    }, 16); 
}

function updateCrashCurve() {
    const width = crashCanvas.width;
    const height = crashCanvas.height;

    const stepX = (crashMultiplier - 1) * 80; 
    const stepY = (crashMultiplier - 1) * 60; 

    const newX = stepX; 
    const newY = height - stepY;

    let offsetX = 0;
    let offsetY = 0;
    
    if (newX > width - 50) offsetX = newX - (width - 50);
    if (newY < 50) offsetY = 50 - newY; 

    crashCtx.clearRect(0, 0, width, height);
    
    crashCtx.beginPath();
    crashCtx.moveTo(0 - offsetX, height + offsetY); 
    
    crashCtx.quadraticCurveTo(
        (newX / 2) - offsetX, height + offsetY, 
        newX - offsetX, newY + offsetY
    );
    
    crashCtx.lineWidth = 4;
    crashCtx.strokeStyle = crashHasCashedOut ? '#00e676' : '#00d2ff'; 
    crashCtx.stroke();

    crashCtx.save();
    crashCtx.translate(newX - offsetX, newY + offsetY);
    const angle = -Math.PI / 4 - (crashMultiplier * 0.05); 
    crashCtx.rotate(Math.max(angle, -Math.PI / 2)); 
    
    crashCtx.font = "30px Arial";
    crashCtx.fillText("🚀", -15, 10);
    crashCtx.restore();
}

async function doCrashCashout() {
    if(crashHasCashedOut || !crashIsRunning) return;
    
    crashHasCashedOut = true;
    const cashoutMultiplier = crashMultiplier;
    const winAmount = crashBetAmount * cashoutMultiplier;
    const profit = winAmount - crashBetAmount;

    dom.btnCrashAction.textContent = "WYPŁACONO!";
    dom.btnCrashAction.classList.remove("btn-cashout");
    dom.btnCrashAction.style.background = "#333";
    
    dom.crashMultiplierText.classList.add("cashed-out"); 
    
    dom.crashInfo.textContent = `Wygrałeś ${formatujWalute(winAmount)}!`;

    if(dom.audioKaching) dom.audioKaching.play().catch(()=>{});

    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const d = userDoc.data();
            
            const newCash = d.cash + winAmount;
            const newZysk = (d.zysk || 0) + profit;
            const newVal = calculateTotalValue(newCash, d.shares);

            t.update(userRef, { cash: newCash, zysk: newZysk, totalValue: newVal });
        });
        showNotification(`Crash: Wygrana ${formatujWalute(winAmount)}`, 'news', 'positive');
    } catch(e) {
        console.error("Błąd zapisu Crash:", e);
    }
}

function endCrashGame() {
    clearInterval(crashGameLoop);
    crashIsRunning = false;
    
    dom.crashMultiplierText.textContent = crashCurrentCrashPoint.toFixed(2) + "x";
    dom.crashMultiplierText.classList.add("crashed");
    dom.crashMultiplierText.classList.remove("cashed-out");
    
    dom.btnCrashAction.textContent = "START";
    dom.btnCrashAction.classList.remove("btn-cashout");
    dom.btnCrashAction.style.background = ""; 
    if(dom.crashAmount) dom.crashAmount.disabled = false;

    drawCrashFrame(false, true);

    if(!crashHasCashedOut) {
        dom.crashInfo.textContent = `Rakieta wybuchła przy ${crashCurrentCrashPoint.toFixed(2)}x. Straciłeś ${formatujWalute(crashBetAmount)}.`;
        if(dom.audioError) dom.audioError.play().catch(()=>{});
    }

    addCrashHistory(crashCurrentCrashPoint);
}

function drawCrashFrame(reset = false, exploded = false) {
    if(!crashCtx) return;
    const w = crashCanvas.width;
    const h = crashCanvas.height;
    
    if(reset) {
        crashCtx.clearRect(0, 0, w, h);
        crashCtx.font = "50px Arial";
        crashCtx.fillStyle = "#333";
        crashCtx.fillText("🚀", 20, h - 20);
        return;
    }

    if(exploded) {
        crashCtx.save();
        crashCtx.fillStyle = "rgba(255, 0, 0, 0.3)";
        crashCtx.fillRect(0, 0, w, h);
        crashCtx.font = "60px Arial";
        crashCtx.textAlign = "center";
        crashCtx.fillText("💥", w/2, h/2);
        crashCtx.restore();
    }
}

function addCrashHistory(mult) {
    const item = document.createElement("div");
    item.className = "crash-history-item";
    item.textContent = mult.toFixed(2) + "x";
    
    if(mult < 1.10) item.classList.add("bad");
    else if(mult >= 2.00 && mult < 10.00) item.classList.add("good");
    else if(mult >= 10.00) item.classList.add("excellent");
    
    dom.crashHistoryList.prepend(item);
    if(dom.crashHistoryList.children.length > 10) dom.crashHistoryList.lastChild.remove();
}
// ==========================================
// === PLINKO GAME LOGIC ===
// ==========================================

const PLINKO_ROWS = 16;
const PLINKO_MULTIPLIERS = [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110];
const PLINKO_COLORS = PLINKO_MULTIPLIERS.map(m => {
    if(m >= 10) return 'pb-ultra';
    if(m >= 3) return 'pb-high';
    if(m >= 1) return 'pb-med';
    return 'pb-low';
});

let plinkoCanvas, plinkoCtx;
let plinkoBalls = [];
let plinkoPins = [];
let plinkoEngineRunning = false;

document.addEventListener("DOMContentLoaded", () => {
    const btnPlinko = document.getElementById("btn-plinko-drop");
    if(btnPlinko) btnPlinko.addEventListener("click", onPlinkoDrop);
    
    setTimeout(initPlinko, 1000); 
});

function initPlinko() {
    plinkoCanvas = document.getElementById("plinko-canvas");
    if(!plinkoCanvas) return;
    plinkoCtx = plinkoCanvas.getContext('2d');

    const bucketContainer = document.getElementById("plinko-multipliers");
    if(bucketContainer) {
        bucketContainer.innerHTML = "";
        PLINKO_MULTIPLIERS.forEach((m, i) => {
            const div = document.createElement("div");
            div.className = `plinko-bucket ${PLINKO_COLORS[i]}`;
            div.id = `plinko-bucket-${i}`;
            div.innerText = m + 'x';
            bucketContainer.appendChild(div);
        });
    }

    plinkoPins = [];
    const startX = 400; 
    const startY = 50;  
    const gapX = 40;    
    const gapY = 32;    

    for (let row = 0; row <= PLINKO_ROWS; row++) {
        const pinsInRow = row + 3; 
        const rowWidth = (pinsInRow - 1) * gapX;
        const xOffset = startX - (rowWidth / 2);

        for (let col = 0; col < pinsInRow; col++) {
            plinkoPins.push({
                x: xOffset + (col * gapX),
                y: startY + (row * gapY),
                r: 4 
            });
        }
    }

    if(!plinkoEngineRunning) {
        plinkoEngineRunning = true;
        requestAnimationFrame(plinkoLoop);
    }
}

async function onPlinkoDrop() {
    const amountInput = document.getElementById("plinko-amount");
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount <= 0) return showMessage("Podaj stawkę!", "error");
    if (!currentUserId) return showMessage("Zaloguj się!", "error");
    if (amount > portfolio.cash) return showMessage("Brak środków!", "error");

    const btn = document.getElementById("btn-plinko-drop");
    btn.style.transform = "scale(0.95)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);

    try {
        portfolio.cash -= amount;
        updatePortfolioUI();

        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const d = userDoc.data();
            if (d.cash < amount) throw new Error("Brak środków (server)!");
            
            const newCash = d.cash - amount;
            const newVal = calculateTotalValue(newCash, d.shares);
            t.update(userRef, { cash: newCash, totalValue: newVal });
        });

        spawnPlinkoBall(amount);

    } catch (e) {
        portfolio.cash += amount;
        updatePortfolioUI();
        showMessage(e.message, "error");
    }
}

function spawnPlinkoBall(betAmount) {
    let path = [];
    let finalBucketIndex = 0;

    for(let i = 0; i < PLINKO_ROWS; i++) {
        const dir = Math.random() > 0.5 ? 1 : 0;
        path.push(dir);
        finalBucketIndex += dir;
    }

    plinkoBalls.push({
        x: 400 + (Math.random() * 4 - 2), 
        y: 20,
        vx: 0,
        vy: 0,
        radius: 6,
        color: '#ff00cc', 
        path: path,         
        currentRow: 0,      
        finished: false,
        bet: betAmount,
        bucketIndex: finalBucketIndex
    });
}

function plinkoLoop() {
    plinkoCtx.clearRect(0, 0, plinkoCanvas.width, plinkoCanvas.height);

    plinkoCtx.fillStyle = "white";
    plinkoCtx.beginPath();
    plinkoPins.forEach(p => {
        plinkoCtx.moveTo(p.x, p.y);
        plinkoCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    });
    plinkoCtx.fill();

    const gravity = 0.25;
    const gapX = 40;
    const gapY = 32;
    const startX = 400;
    const startY = 50;

    for (let i = plinkoBalls.length - 1; i >= 0; i--) {
        let b = plinkoBalls[i];
        
        if (b.finished) {
            plinkoBalls.splice(i, 1);
            continue;
        }

        const targetRowY = startY + (b.currentRow * gapY);
        
        if (b.y >= targetRowY) {
            if (b.currentRow < PLINKO_ROWS) {
                const moveRight = b.path[b.currentRow] === 1;
                b.vx = (moveRight ? 1.5 : -1.5) + (Math.random() * 0.4 - 0.2);
                b.vy = -1.5; 
                b.currentRow++;
            } else {
                finishPlinkoBall(b);
                b.finished = true;
                continue;
            }
        }

        b.vy += gravity;
        b.x += b.vx;
        b.y += b.vy;

        b.vx *= 0.98;

        plinkoCtx.beginPath();
        plinkoCtx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        plinkoCtx.fillStyle = b.color;
        plinkoCtx.shadowBlur = 10;
        plinkoCtx.shadowColor = b.color;
        plinkoCtx.fill();
        plinkoCtx.shadowBlur = 0;
    }

    requestAnimationFrame(plinkoLoop);
}

async function finishPlinkoBall(ball) {
    const multiplier = PLINKO_MULTIPLIERS[ball.bucketIndex];
    const winAmount = ball.bet * multiplier;
    const profit = winAmount - ball.bet;

    const bucketEl = document.getElementById(`plinko-bucket-${ball.bucketIndex}`);
    if(bucketEl) {
        bucketEl.classList.add("hit");
        setTimeout(() => bucketEl.classList.remove("hit"), 300);
    }

    if(multiplier >= 10) {
        if(dom.audioKaching) {
             dom.audioKaching.currentTime = 0;
             dom.audioKaching.play().catch(()=>{});
        }
    } 

    addPlinkoHistory(multiplier);

    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const d = userDoc.data();
            
            const newCash = d.cash + winAmount;
            const newZysk = (d.zysk || 0) + profit;
            const newVal = calculateTotalValue(newCash, d.shares); 

            t.update(userRef, { cash: newCash, zysk: newZysk, totalValue: newVal });
        });
        
        if(multiplier >= 3) {
            showNotification(`Plinko: ${multiplier}x (${formatujWalute(winAmount)})`, 'news', 'positive');
        }

    } catch(e) {
        console.error("Plinko save error:", e);
    }
}

function addPlinkoHistory(mult) {
    const list = document.getElementById("plinko-history-list");
    if(!list) return;

    const item = document.createElement("div");
    item.className = "crash-history-item"; 
    item.textContent = mult + "x";
    
    if(mult < 1) item.classList.add("bad");
    else if(mult >= 3) item.classList.add("good");
    else if(mult >= 10) item.classList.add("excellent");
    
    list.prepend(item);
    if(list.children.length > 8) list.lastChild.remove();
}
// ==========================================
// === VIDEO POKER LOGIC (Jacks or Better) ===
// ==========================================

const POKER_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const POKER_SUITS = ['♥', '♦', '♣', '♠'];
const POKER_VALUES = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

let pokerDeck = [];
let pokerHand = [];
let pokerHeld = [false, false, false, false, false];
let pokerState = 'idle'; 
let pokerBet = 0;

const POKER_PAYTABLE = {
    'ROYAL FLUSH': 250,
    'STRAIGHT FLUSH': 50,
    'FOUR OF A KIND': 25,
    'FULL HOUSE': 9,
    'FLUSH': 6,
    'STRAIGHT': 4,
    'THREE OF A KIND': 3,
    'TWO PAIRS': 2,
    'JACKS OR BETTER': 1
};

function createDeck() {
    pokerDeck = [];
    for(let s of POKER_SUITS) {
        for(let r of POKER_RANKS) {
            pokerDeck.push({ rank: r, suit: s, val: POKER_VALUES[r], color: (s === '♥' || s === '♦') ? 'red' : 'black' });
        }
    }
    for (let i = pokerDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pokerDeck[i], pokerDeck[j]] = [pokerDeck[j], pokerDeck[i]];
    }
}

window.onPokerAction = async function() {
    const btn = document.getElementById("btn-poker-deal");
    const amountInput = document.getElementById("poker-amount");
    const statusText = document.getElementById("poker-result-text");

    if (pokerState === 'idle') {
        const amount = parseInt(amountInput.value);
        if (isNaN(amount) || amount <= 0) return showMessage("Podaj stawkę!", "error");
        if (amount > portfolio.cash) return showMessage("Brak środków!", "error");
        if (!currentUserId) return showMessage("Zaloguj się!", "error");

        try {
            await runTransaction(db, async (t) => {
                 const userRef = doc(db, "uzytkownicy", currentUserId);
                 const userDoc = await t.get(userRef);
                 if(userDoc.data().cash < amount) throw new Error("Brak środków");
                 const newCash = userDoc.data().cash - amount;
                 t.update(userRef, { cash: newCash, totalValue: calculateTotalValue(newCash, userDoc.data().shares) });
            });
            
            pokerBet = amount;
            amountInput.disabled = true;
            createDeck();
            pokerHand = [];
            pokerHeld = [false, false, false, false, false];
            
            for(let i=0; i<5; i++) {
                const cardEl = document.getElementById(`card-${i}`);
                const badgeEl = document.getElementById(`hold-${i}`);
                
                if(cardEl) {
                    cardEl.style.transform = "translateY(0)";
                    cardEl.style.border = ""; 
                    cardEl.classList.add('back'); 
                }
                if(badgeEl) badgeEl.classList.add('hidden');
            }
            
            for(let i=0; i<5; i++) pokerHand.push(pokerDeck.pop());

            renderPokerCards();
            resetPaytableHighlight();
            
            pokerState = 'deal';
            btn.textContent = "WYMIEŃ (DRAW)";
            btn.style.background = "var(--accent-color)";
            statusText.textContent = "ZATRZYMAJ KARTY (HOLD)";

        } catch(e) {
            showMessage(e.message, "error");
        }

    } else if (pokerState === 'deal') {
        
        for(let i=0; i<5; i++) {
            if(!pokerHeld[i]) {
                pokerHand[i] = pokerDeck.pop();
            }
        }

        renderPokerCards(); 

        const result = evaluatePokerHand(pokerHand);
        
        let winAmount = 0;
        let profit = 0 - pokerBet; 

        if (result.win) {
            const multiplier = POKER_PAYTABLE[result.handName];
            winAmount = pokerBet * multiplier;
            profit = winAmount - pokerBet;

            statusText.textContent = `${result.handName}! WYGRANA: ${formatujWalute(winAmount)}`;
            statusText.style.color = "#00e676"; 
            highlightPaytableRow(result.handName);
            if(dom.audioKaching) { dom.audioKaching.currentTime=0; dom.audioKaching.play().catch(()=>{}); }

            try {
                await runTransaction(db, async (t) => {
                    const userRef = doc(db, "uzytkownicy", currentUserId);
                    const d = (await t.get(userRef)).data();
                    const newCash = d.cash + winAmount;
                    const newZysk = (d.zysk || 0) + profit;
                    const newVal = calculateTotalValue(newCash, d.shares);
                    t.update(userRef, { cash: newCash, zysk: newZysk, totalValue: newVal });
                });
            } catch(e) { console.error(e); }

        } else {
            statusText.textContent = "GAME OVER";
            statusText.style.color = "var(--red)";
            if(dom.audioError) dom.audioError.play().catch(()=>{});
        }

        pokerState = 'idle';
        btn.textContent = "ROZDAJ (DEAL)";
        btn.style.background = ""; 
        amountInput.disabled = false;
        
        document.querySelectorAll('.hold-badge').forEach(el => el.classList.add('hidden'));
    }
}

window.toggleHold = function(index) {
    if (pokerState !== 'deal') return; 
    
    pokerHeld[index] = !pokerHeld[index];
    
    const badge = document.getElementById(`hold-${index}`);
    const card = document.getElementById(`card-${index}`);
    
    if (pokerHeld[index]) {
        badge.classList.remove('hidden');
        card.style.border = "2px solid yellow";
        card.style.transform = "translateY(-10px)";
    } else {
        badge.classList.add('hidden');
        card.style.border = "2px solid white";
        card.style.transform = "translateY(0)";
    }
}

function renderPokerCards() {
    for(let i=0; i<5; i++) {
        const cardEl = document.getElementById(`card-${i}`);
        const card = pokerHand[i];
        
        cardEl.className = `poker-card ${card.color}`;
        cardEl.innerHTML = `
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
        `;
    }
}

function evaluatePokerHand(hand) {
    const sorted = [...hand].sort((a, b) => a.val - b.val);
    const ranks = sorted.map(c => c.val);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    
    let isStraight = true;
    for(let i=0; i<4; i++) {
        if(ranks[i+1] !== ranks[i] + 1) {
            isStraight = false; 
            break; 
        }
    }
    if (!isStraight && ranks.join(',') === '2,3,4,5,14') isStraight = true;

    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const countValues = Object.values(counts);

    if (isFlush && isStraight && ranks[0] === 10 && ranks[4] === 14) return { win: true, handName: 'ROYAL FLUSH' };
    if (isFlush && isStraight) return { win: true, handName: 'STRAIGHT FLUSH' };
    if (countValues.includes(4)) return { win: true, handName: 'FOUR OF A KIND' };
    if (countValues.includes(3) && countValues.includes(2)) return { win: true, handName: 'FULL HOUSE' };
    if (isFlush) return { win: true, handName: 'FLUSH' };
    if (isStraight) return { win: true, handName: 'STRAIGHT' };
    if (countValues.includes(3)) return { win: true, handName: 'THREE OF A KIND' };
    if (countValues.filter(c => c === 2).length === 2) return { win: true, handName: 'TWO PAIRS' };
    if (countValues.includes(2)) {
        for(const [rank, count] of Object.entries(counts)) {
            if (count === 2 && parseInt(rank) >= 11) {
                return { win: true, handName: 'JACKS OR BETTER' };
            }
        }
    }

    return { win: false, handName: '' };
}

function highlightPaytableRow(handName) {
    const rows = document.querySelectorAll('.pay-row');
    rows.forEach(row => {
        if(row.firstElementChild.textContent === handName) {
            row.classList.add('active-win');
        }
    });
}

function resetPaytableHighlight() {
    document.querySelectorAll('.pay-row').forEach(r => r.classList.remove('active-win'));
}

// --- FUNKCJA ROLLING NUMBERS (ANIMACJA CYFEREK) ---
function animateValue(obj, start, end, duration) {
    if (!obj) return;
    // Jeśli różnica jest znikoma, po prostu wyświetl wynik
    if (start === end) {
        obj.textContent = formatujWalute(end);
        return;
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Używamy matematyki dla liczb zmiennoprzecinkowych (zachowujemy grosze)
        const currentVal = start + (end - start) * progress;
        
        obj.textContent = formatujWalute(currentVal);
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatujWalute(end);
        }
    };
    window.requestAnimationFrame(step);
}
