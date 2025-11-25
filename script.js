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
    startValue: 100, zysk: 0, totalValue: 0, prestigeLevel: 0 
};

const PRESTIGE_REQUIREMENTS = [15000, 30000, 60000, 120000];
const TIP_COSTS = [1500, 1400, 1200, 1100, 1000];
const CRYPTO_PRESTIGE_REQUIREMENT = 3; 
const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"];
const CHART_COLORS = ['#00d2ff', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF', '#F0B90B', '#627EEA'];

// Zmienne UI/Logic
let chart = null;
let portfolioChart = null; 
let modalPortfolioChart = null; 
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

// Unsubscribes
let unsubscribePortfolio = null;
let unsubscribeRumors = null;
let unsubscribeNews = null; 
let unsubscribeLeaderboard = null;
let unsubscribeChat = null; 
let unsubscribeGlobalHistory = null;
let unsubscribePersonalHistory = null;
let unsubscribeLimitOrders = null; 
let unsubscribeBonds = null;
let unsubscribeMatch = null;
let unsubscribeActiveBets = null;
let unsubscribePvP = null;

let dom = {};

// --- FUNKCJE POMOCNICZE (Definicje przed użyciem) ---
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

function updatePriceUI() { 
    const p = market[currentCompanyId].price; 
    if(dom.stockPrice) dom.stockPrice.textContent = formatujWalute(p); 
}

function checkCryptoAccess() {
    const isCrypto = market[currentCompanyId].type === 'crypto';
    const locked = isCrypto && portfolio.prestigeLevel < CRYPTO_PRESTIGE_REQUIREMENT;
    if(dom.orderPanel) dom.orderPanel.classList.toggle("crypto-locked", locked);
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
        
        // Mapowanie wsteczne dla starej bazy danych
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
        updatePortfolioUI(); 
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
                name: name, email: email, cash: 1000.00,
                shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
                stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
                startValue: 1000.00, zysk: 0.00, totalValue: 1000.00,
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
    
    // Aktualizacja przycisków
    dom.navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
    
    // Przełączanie widoków
    dom.views.forEach(view => {
        if (view.id === `view-${viewName}`) {
            view.classList.add("active");
            view.classList.remove("hidden");
        } else {
            view.classList.remove("active");
            setTimeout(() => { if(!view.classList.contains('active')) view.classList.add('hidden') }, 500);
        }
    });

    // Jeśli wracamy na giełdę, odświeżamy wykres
    if (viewName === 'market' && chart) {
        chart.render();
    }
}

// --- START APLIKACJI ---
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem('simulatorTheme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

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
        
        // Navigation (NOWE)
        navButtons: document.querySelectorAll(".nav-btn"),
        views: document.querySelectorAll(".view-section"),
        entertainmentCash: document.getElementById("entertainment-cash-display"),

        // Main UI
        themeSelect: document.getElementById("theme-select"),
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
        buyTipButton: document.getElementById("buy-tip-button"), 
        tipCost: document.getElementById("tip-cost"), 
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
        bondsForm: document.getElementById("bonds-form"),
        bondAmount: document.getElementById("bond-amount"),
        bondType: document.getElementById("bond-type"),
        activeBondsFeed: document.getElementById("active-bonds-feed"),
        
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

    if(dom.themeSelect) dom.themeSelect.value = savedTheme;

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
    dom.bondsForm.addEventListener("submit", onBuyBond); 
    dom.bettingForm.addEventListener("submit", onPlaceBet);
    dom.pvpForm.addEventListener("submit", onCreatePvP);
    dom.resetPasswordLink.addEventListener("click", onResetPassword);
    dom.themeSelect.addEventListener("change", onChangeTheme);
    dom.buyTipButton.addEventListener("click", onBuyTip);
    dom.prestigeButton.addEventListener("click", onPrestigeReset);
    dom.orderTabMarket.addEventListener("click", onSelectOrderTab);
    dom.orderTabLimit.addEventListener("click", onSelectOrderTab);
    dom.historyTabButtons.forEach(btn => btn.addEventListener("click", onSelectHistoryTab));
    dom.modalCloseButton.addEventListener("click", () => dom.modalOverlay.classList.add("hidden"));
    dom.modalOverlay.addEventListener("click", (e) => { if (e.target === dom.modalOverlay) dom.modalOverlay.classList.add("hidden"); });
    dom.showRegisterLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.add("show-register"); showAuthMessage(""); });
    dom.showLoginLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.remove("show-register"); showAuthMessage(""); });

    startAuthListener();
});

// --- OBSŁUGA DANYCH PORTFELA ---
function listenToPortfolioData(userId) {
    unsubscribePortfolio = onSnapshot(doc(db, "uzytkownicy", userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            portfolio.name = data.name;
            portfolio.cash = data.cash;
            
            // Mapowanie shares w locie jeśli stare dane mają bartcoin
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

function updatePortfolioUI() {
    if (!dom || !dom.username) return;
    
    // 1. Aktualizacja nagłówka i statystyk tekstowych
    const stars = getPrestigeStars(portfolio.prestigeLevel);
    dom.username.innerHTML = `${portfolio.name} ${stars}`;
    dom.tipCost.textContent = formatujWalute(TIP_COSTS[portfolio.prestigeLevel]);
    dom.buyTipButton.disabled = portfolio.cash < TIP_COSTS[portfolio.prestigeLevel];
    
    dom.cash.textContent = formatujWalute(portfolio.cash);
    if(dom.entertainmentCash) dom.entertainmentCash.textContent = formatujWalute(portfolio.cash);

    // 2. Generowanie listy aktywów (Poprawiona struktura HTML dla CSS)
    let html = "";
    let sharesValue = 0;
    
    // Dane do wykresu
    const series = [portfolio.cash]; 
    const labels = ['Gotówka'];

    COMPANY_ORDER.forEach(cid => {
        const amount = portfolio.shares[cid] || 0;
        const company = market[cid];
        const currentPrice = company ? company.price : 0;
        const value = amount * currentPrice;

        // Dodajemy do wykresu tylko jeśli wartość > 0
        if (value > 0) {
            sharesValue += value;
            series.push(value);
            labels.push(company.name);
        }

        // Generujemy wiersz tabeli z klasami pasującymi do nowego CSS
        html += `
            <div class="asset-row">
                <span class="asset-name">${company ? company.name : cid}:</span>
                <span class="asset-value">
                    <strong id="shares-${cid}">${amount}</strong> szt.
                </span>
            </div>`;
    });

    // Tylko tutaj wstawiamy wygenerowany HTML
    dom.sharesList.innerHTML = html;

    // 3. Obliczenia całkowite
    const total = portfolio.cash + sharesValue;
    const profit = total - portfolio.startValue;

    dom.totalValue.textContent = formatujWalute(total);
    dom.totalProfit.textContent = formatujWalute(profit);
    dom.totalProfit.style.color = profit >= 0 ? "var(--green)" : "var(--red)";

    // 4. Konfiguracja i renderowanie wykresu (Z sumą w środku)
    if (!portfolioChart) {
        portfolioChart = new ApexCharts(dom.portfolioChartContainer, {
            series: series,
            labels: labels,
            chart: { 
                type: 'donut', 
                height: 280, // Nieco większy
                background: 'transparent',
                fontFamily: 'inherit'
            },
            colors: CHART_COLORS,
            theme: { mode: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark' },
            stroke: { show: false }, // Usunięcie obramowania segmentów
            dataLabels: { enabled: false }, // Wyłączenie cyferek na wykresie dla czystości
            legend: { show: false }, // Ukrywamy legendę (bo mamy listę pod spodem)
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
                                    // Sumuje wszystkie wartości serii
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
        // Aktualizacja danych istniejącego wykresu
        portfolioChart.updateOptions({ series: series, labels: labels });
        // Wymuszenie aktualizacji motywu przy zmianie danych
        const currentTheme = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        portfolioChart.updateOptions({ theme: { mode: currentTheme }});
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
    if(dom.orderPanel.classList.contains("crypto-locked")) return showMessage("Wymagany poziom 3 prestiżu", "error");
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
        theme: { mode: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark' },
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

// Funkcja initPortfolioChart została zintegrowana w updatePortfolioUI dla lepszego działania "total"

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
            listenToActiveBonds(currentUserId);
            listenToActiveBets(currentUserId);
            listenToPvP();
            listenToActiveMatch();
            
            // Default view
            dom.navButtons[0].click();
        } else {
            currentUserId = null;
            dom.simulatorContainer.classList.add("hidden");
            dom.authContainer.classList.remove("hidden");
            dom.authContainer.classList.remove("show-register");
            
            if (unsubscribePortfolio) unsubscribePortfolio();
            // ... reszta unsubów ...
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

function onChangeTheme(e) {
    const theme = e.target.value;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('simulatorTheme', theme);
    const newMode = (theme === 'light') ? 'light' : 'dark';
    if (chart) chart.updateOptions({ theme: { mode: newMode } });
    if (portfolioChart) portfolioChart.updateOptions({ theme: { mode: newMode } });
}

// --- HANDLERS (Pozostałe) ---
function onBuyMax() { const p = market[currentCompanyId].price; if(p>0) dom.amountInput.value = Math.floor(portfolio.cash/p); }
function onSellMax() { dom.amountInput.value = portfolio.shares[currentCompanyId]||0; }
function onSelectMarketType(e) {
    const type = e.target.dataset.marketType;
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
    unsubscribeNews = onSnapshot(query(collection(db, "gielda_news"), orderBy("timestamp", "desc"), limit(5)), snap => {
        snap.docChanges().forEach(c => { if(c.type==='added') {
            const n = c.doc.data();
            if(initialNewsLoaded) showNotification(n.text, 'news', n.impactType);
            dom.newsFeed.insertAdjacentHTML('afterbegin', `<p style="color:${n.impactType==='positive'?'var(--green)':'var(--red)'}">${n.text}</p>`);
        }});
        initialNewsLoaded = true;
    });
}
function listenToRumors() {
    unsubscribeRumors = onSnapshot(query(collection(db, "plotki"), orderBy("timestamp", "desc"), limit(10)), snap => {
        dom.rumorsFeed.innerHTML = "";
        snap.forEach(d => {
            const r = d.data();
            dom.rumorsFeed.innerHTML += `<p style="color:${r.sentiment==='positive'?'var(--green)':'var(--red)'}">[${market[r.companyId]?market[r.companyId].name:'??'}] ${r.text} <small>- ${r.authorName}</small></p>`;
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
                    if (m.authorId !== currentUserId) showNotification(`${m.authorName}: ${m.text}`, 'chat');
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
            const profitValue = u.totalValue - u.startValue;
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
    if (dom.orderPanel.classList.contains("crypto-locked")) return showMessage("Wymagany poziom 3", "error");
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
    unsubscribeLimitOrders = onSnapshot(query(collection(db, "limit_orders"), where("userId", "==", userId), orderBy("timestamp", "desc")), snap => {
        dom.limitOrdersFeed.innerHTML = "";
        if(snap.empty) dom.limitOrdersFeed.innerHTML = "<p>Brak zleceń.</p>";
        snap.forEach(d => {
            const o = d.data();
            dom.limitOrdersFeed.innerHTML += `<p>${o.type} ${o.companyName} (${o.amount}szt @ ${o.limitPrice}) - ${o.status} <button onclick="cancelLimit('${d.id}')">X</button></p>`;
        });
    });
}
window.cancelLimit = async function(id) { if(confirm("Anulować?")) await updateDoc(doc(db, "limit_orders", id), {status: "cancelled"}); };

async function onBuyBond(e) {
    e.preventDefault();
    const amt = parseFloat(dom.bondAmount.value);
    const type = dom.bondType.value;
    if(amt <= 0 || amt > portfolio.cash) return showMessage("Błędna kwota", "error");
    const days = type==="1"?1:(type==="2"?2:3);
    const rate = type==="1"?0.05:(type==="2"?0.10:0.15);
    const profit = amt * rate;
    try {
        await runTransaction(db, async t => {
            const uRef = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(uRef)).data();
            if(d.cash < amt) throw new Error("Brak środków");
            t.update(uRef, { cash: d.cash - amt, totalValue: calculateTotalValue(d.cash-amt, d.shares), 'stats.bondsPurchased': increment(1) });
            const bondRef = doc(collection(db, "active_bonds"));
            t.set(bondRef, { userId: currentUserId, name: `Obligacja ${days}d (${rate*100}%)`, investment: amt, profit, redeemAt: Timestamp.fromMillis(Date.now()+(days*86400000)), status: "pending", createdAt: serverTimestamp() });
        });
        showMessage("Kupiono obligację!", "success");
    } catch(e) { showMessage(e.message, "error"); }
}
function listenToActiveBonds(userId) {
    unsubscribeBonds = onSnapshot(query(collection(db, "active_bonds"), where("userId", "==", userId), orderBy("createdAt", "desc")), snap => {
        dom.activeBondsFeed.innerHTML = snap.empty ? "<p>Brak obligacji.</p>" : "";
        snap.forEach(d => {
            const b = d.data();
            const st = b.status==='pending' ? `Oczekuje` : 'Wykupiona';
            dom.activeBondsFeed.innerHTML += `<p><strong>${b.name}</strong>: ${formatujWalute(b.investment)} -> ${formatujWalute(b.investment+b.profit)} (${st})</p>`;
        });
    });
}

// --- NOWA LOGIKA BUKMACHERKI (Z TABELĄ I DNIAMI) ---

function listenToActiveMatch() {
    if (unsubscribeMatch) unsubscribeMatch();
    // Nasłuchujemy dokumentu z meczami
    unsubscribeMatch = onSnapshot(doc(db, "global", "zaklady"), (docSnap) => {
        if (docSnap.exists()) {
            matchesCache = docSnap.data().mecze || [];
            renderBettingPanel();
        } else {
            dom.matchInfo.innerHTML = "<p>Brak danych zakładów.</p>";
        }
    });
}

// *** NOWA FUNKCJA DO NASŁUCHIWANIA TWOICH KUPONÓW ***
function listenToActiveBets(userId) {
    if (unsubscribeActiveBets) unsubscribeActiveBets();
    const q = query(collection(db, "active_bets"), where("userId", "==", userId), orderBy("createdAt", "desc"));
    unsubscribeActiveBets = onSnapshot(q, (snap) => {
        dom.activeBetsFeed.innerHTML = "";
        if (snap.empty) {
            dom.activeBetsFeed.innerHTML = "<p>Brak aktywnych zakładów.</p>";
            return;
        }
        snap.forEach(d => {
            const bet = d.data();
            let statusColor = "var(--text-muted)";
            let statusText = "W TOKU";
            let profitInfo = "";

            if (bet.status === 'won') {
                statusColor = "var(--green)";
                statusText = "WYGRANA";
                profitInfo = ` | <span style="color:var(--green)">+${formatujWalute(bet.betAmount * bet.odds)}</span>`;
            } else if (bet.status === 'lost') {
                statusColor = "var(--red)";
                statusText = "PRZEGRANA";
            }
            const matchName = bet.matchTitle || "Zakład Sportowy";
            const teamName = bet.betOn === 'draw' ? 'Remis (X)' : (bet.betOn === 'teamA' ? 'Gospodarz (1)' : 'Gość (2)');

            const html = `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; font-size: 0.9em; color: var(--accent-color);">${matchName}</span>
                        <span style="color: ${statusColor}; font-weight: 800; font-size: 0.8em;">${statusText}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #ccc; margin-top: 4px;">
                        <span>Twój typ: <strong>${teamName}</strong> (@${bet.odds.toFixed(2)})</span>
                    </div>
                    <div style="text-align: right; font-size: 0.85em; margin-top: 2px;">
                        Stawka: ${formatujWalute(bet.betAmount)}${profitInfo}
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

    // 1. Grupowanie po dniach
    const matchesByDay = {};
    matchesCache.forEach(match => {
        const date = match.closeTime.toDate();
        const dateKey = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
        if (!matchesByDay[dateKey]) matchesByDay[dateKey] = [];
        matchesByDay[dateKey].push(match);
    });

    // Sortowanie dni
    const sortedDays = Object.keys(matchesByDay).sort();
    
    // Ustawienie aktywnego taba (jeśli null lub nieistniejący)
    if (!activeDayTab || !matchesByDay[activeDayTab]) activeDayTab = sortedDays[0];

    // 2. Renderowanie Paska Dni (Nav)
    const navContainer = document.createElement("div");
    navContainer.className = "betting-days-nav";

    sortedDays.forEach(dayKey => {
        const btn = document.createElement("button");
        btn.className = "day-tab-btn";
        if (dayKey === activeDayTab) btn.classList.add("active");
        
        const dateObj = new Date(dayKey);
        // Formatowanie daty na polski (np. Sobota, 26.11)
        const btnLabel = dateObj.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });
        btn.textContent = btnLabel.charAt(0).toUpperCase() + btnLabel.slice(1);
        
        btn.onclick = () => { 
            activeDayTab = dayKey; 
            renderBettingPanel(); // Przeładowanie widoku
        };
        navContainer.appendChild(btn);
    });
    dom.matchInfo.appendChild(navContainer);

    // 3. Renderowanie Tabeli Meczów dla aktywnego dnia
    const dayMatches = matchesByDay[activeDayTab];
    // Sortowanie po godzinie
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

        // Kolumna Czasu
        let timeHtml = timeStr;
        if (isResolved) timeHtml = "Koniec";
        else if (isClosed) timeHtml = `<span class="match-live">LIVE</span>`;

        // Kolumna Meczu (Drużyny + ewentualny wynik)
        let matchHtml = `<strong>${match.teamA}</strong><br><small>vs</small><br><strong>${match.teamB}</strong>`;
        if (isResolved) {
            let w = match.winner === 'draw' ? 'REMIS' : (match.winner === 'teamA' ? match.teamA : match.teamB);
            matchHtml += `<br><span class="match-finished">Wynik: ${w}</span>`;
        }

        // Helper do przycisków
        const createBtn = (teamCode, odds, label) => `
            <button class="table-bet-btn" ${isClosed ? 'disabled' : ''}
                onclick="selectBet('${match.id}', '${teamCode}', ${odds}, '${match.teamA} vs ${match.teamB} [${label}]')">
                ${label}<small>${odds.toFixed(2)}</small>
            </button>`;

        const oddsHtml = `<div class="odds-btn-group">
            ${createBtn('teamA', match.oddsA, '1')}
            ${createBtn('draw', match.oddsDraw, 'X')}
            ${createBtn('teamB', match.oddsB, '2')}
        </div>`;

        tr.innerHTML = `<td class="col-time">${timeHtml}</td><td class="col-match">${matchHtml}</td><td class="col-odds">${oddsHtml}</td>`;
        tbody.appendChild(tr);
    });
    
    dom.matchInfo.appendChild(table);
}

// Funkcja globalna (na window) do obsługi kliknięcia w tabeli
window.selectBet = function(id, team, odds, label) {
    // *** POPRAWKA: ZAPAMIĘTUJEMY TYTUŁ MECZU ***
    currentBetSelection = { id, team, odds, matchTitle: label };
    
    // Pokazujemy formularz
    dom.bettingForm.classList.remove("hidden");
    
    // Wyciągamy samą nazwę meczu z labela (usuwamy nawiasy [1] itp.)
    const cleanLabel = label.split('[')[0].trim();
    
    // Aktualizujemy tekst przycisku
    dom.placeBetButton.textContent = `Postaw na: ${cleanLabel} (Kurs: ${odds.toFixed(2)})`;
    dom.placeBetButton.style.background = "var(--green)";
    dom.placeBetButton.style.color = "#000";
    
    // Scroll do formularza (dla wygody na mobile)
    dom.bettingForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    dom.betAmount.focus();
};

async function onPlaceBet(e) {
    e.preventDefault();
    if (!currentBetSelection || !currentUserId) return;
    
    const amount = parseFloat(dom.betAmount.value);
    
    // Walidacja
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj poprawną kwotę", "error");
    if (amount > portfolio.cash) return showMessage("Brak gotówki", "error");

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await transaction.get(userRef);
            
            if(userDoc.data().cash < amount) throw new Error("Brak środków (walidacja serwera)");
            
            // Pobranie gotówki
            const newCash = userDoc.data().cash - amount;
            // Aktualizacja wartości portfela (gotówka spada, akcje bez zmian)
            const newVal = calculateTotalValue(newCash, userDoc.data().shares);
            
            transaction.update(userRef, { cash: newCash, totalValue: newVal });
            
            // Utworzenie zakładu (DODANO MATCH TITLE)
            const betRef = doc(collection(db, "active_bets"));
            transaction.set(betRef, {
                userId: currentUserId,
                userName: portfolio.name,
                matchId: currentBetSelection.id,
                matchTitle: currentBetSelection.matchTitle, // Zapisujemy nazwę meczu!
                betOn: currentBetSelection.team, // 'teamA', 'teamB' lub 'draw'
                odds: currentBetSelection.odds,
                betAmount: amount,
                matchResolveTime: null, 
                status: "pending",
                createdAt: serverTimestamp()
            });
        });

        // Dodanie wpisu do historii
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

async function onCreatePvP(e) {
    e.preventDefault();
    const amount = parseFloat(dom.pvpAmount.value);
    if (isNaN(amount) || amount < 1000) return showMessage("Minimum 1000 zł!", "error");
    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userData = (await t.get(userRef)).data();
            if (userData.cash < amount) throw new Error("Za mało gotówki!");
            t.update(userRef, { cash: userData.cash - amount, totalValue: calculateTotalValue(userData.cash - amount, userData.shares) });
            t.set(doc(collection(db, "pvp_duels")), { creatorId: currentUserId, creatorName: portfolio.name, creatorPrestige: portfolio.prestigeLevel || 0, amount: amount, status: "open", createdAt: serverTimestamp() });
        });
        showMessage("Wyzwanie rzucone!", "success");
        await addDoc(collection(db, "chat_messages"), { text: `⚔️ PVP na ${formatujWalute(amount)}!`, authorName: "SYSTEM", authorId: "sys", prestigeLevel: 0, timestamp: serverTimestamp() });
    } catch (e) { showMessage(e.message, "error"); }
}

function listenToPvP() {
    unsubscribePvP = onSnapshot(query(collection(db, "pvp_duels"), where("status", "in", ["open", "battling"]), limit(20)), (snap) => {
        dom.pvpFeed.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            if(d.status === 'battling' && !playedAnimations.has(doc.id)) { playedAnimations.add(doc.id); triggerGlobalPvPAnimation({id: doc.id, ...d}); }
            const btn = d.creatorId === currentUserId ? `<button disabled>Twój</button>` : `<button onclick="joinPvP('${doc.id}', ${d.amount}, '${d.creatorName}')">WALCZ!</button>`;
            dom.pvpFeed.innerHTML += `<div class="pvp-item"><span>${d.creatorName} (${formatujWalute(d.amount)})</span>${d.status==='battling'?'<span>WALKA...</span>':btn}</div>`;
        });
    });
}
const playedAnimations = new Set();
const WINNER_INDEX = 60; const CARD_WIDTH = 120;
function getSeededRandom(seedStr) { let h = 0x811c9dc5; for(let i=0;i<seedStr.length;i++) { h^=seedStr.charCodeAt(i); h=Math.imul(h,0x01000193); } return function() { h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return ((h>>>0)/4294967296); } }

function triggerGlobalPvPAnimation(duel) {
    const container = document.getElementById('pvp-embedded-roulette');
    const strip = document.getElementById('roulette-strip');
    const winnerText = document.getElementById('pvp-roulette-winner');
    const rng = getSeededRandom(duel.id);
    container.classList.remove('hidden');
    strip.innerHTML = ""; strip.style.transition = "none"; strip.style.transform = "translateX(0px)"; winnerText.textContent = "LOSOWANIE...";
    
    const cardsData = [];
    for (let i = 0; i < 90; i++) cardsData.push(i === WINNER_INDEX ? (duel.winner === duel.creatorName ? 'creator' : 'joiner') : (rng() > 0.5 ? 'creator' : 'joiner'));
    
    cardsData.forEach(type => {
        const div = document.createElement('div');
        div.className = `roulette-card ${type === 'creator' ? 'card-creator' : 'card-joiner'}`;
        div.textContent = type === 'creator' ? duel.creatorName : duel.joinerName;
        strip.appendChild(div);
    });

    const target = (WINNER_INDEX * CARD_WIDTH) + (CARD_WIDTH / 2) + (rng()-0.5)*(CARD_WIDTH*0.7);
    const offset = (document.querySelector('.roulette-window').offsetWidth / 2) - target;
    
    setTimeout(() => {
        strip.style.transition = "transform 5s cubic-bezier(0.15, 0.85, 0.35, 1.0)";
        strip.style.transform = `translateX(${offset}px)`;
        setTimeout(() => {
            winnerText.textContent = `WYGRAŁ: ${duel.winner}`;
            setTimeout(() => { container.classList.add('hidden'); if(currentUserId===duel.joinerId) updateDoc(doc(db,"pvp_duels",duel.id),{status:"closed"}); }, 5000);
        }, 5000);
    }, 100);
}

window.joinPvP = async function(duelId, amount, opponentName) {
    if (!confirm(`Walczyć za ${formatujWalute(amount)}?`)) return;
    try {
        await runTransaction(db, async (t) => {
            const duelRef = doc(db, "pvp_duels", duelId);
            const joinerRef = doc(db, "uzytkownicy", currentUserId);
            const duelDoc = await t.get(duelRef);
            const joinerDoc = await t.get(joinerRef);
            if (duelDoc.data().status !== "open") throw new Error("Za późno!");
            if (joinerDoc.data().cash < amount) throw new Error("Brak środków!");
            
            const creatorRef = doc(db, "uzytkownicy", duelDoc.data().creatorId);
            const creatorWins = Math.random() > 0.5;
            const winnerAmount = amount * 2;
            
            t.update(joinerRef, { cash: joinerDoc.data().cash - amount });
            if(creatorWins) {
                 t.update(creatorRef, { cash: increment(winnerAmount), totalValue: increment(winnerAmount), zysk: increment(amount) });
            } else {
                 t.update(joinerRef, { cash: increment(winnerAmount), totalValue: increment(winnerAmount), zysk: increment(amount) });
                 t.update(creatorRef, { zysk: increment(-amount) });
            }
            t.update(duelRef, { status: "battling", winner: creatorWins ? duelDoc.data().creatorName : portfolio.name, joinerId: currentUserId, joinerName: portfolio.name });
        });
    } catch(e) { showMessage(e.message, "error"); }
};

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

// --- RULETKA (Zaktualizowana do wersji animowanej) ---
window.commitSpin = async function() {
    if (isSpinning) return;
    if (!currentUserId) return showMessage("Zaloguj się!", "error");
    if (!currentSelection) return showMessage("Wybierz stawkę (kolor lub liczbę)!", "error");

    const amount = parseInt(dom.casinoAmount.value);
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj poprawną kwotę!", "error");
    if (amount > portfolio.cash) return showMessage("Brak środków!", "error");

    isSpinning = true;
    dom.casinoStatus.textContent = "Kręcimy... Powodzenia!";
    
    // Blokada interfejsu
    const allBtns = document.querySelectorAll('.casino-btn, .num-btn, .spin-btn');
    allBtns.forEach(b => b.disabled = true);
    if(dom.amountInput) dom.amountInput.disabled = true;

    // Reset widoku koła
    const innerRing = document.querySelector('.inner');
    const dataContainer = document.querySelector('.data');
    const resultNumberEl = document.querySelector('.result-number');
    const resultColorEl = document.querySelector('.result-color');
    const resultBg = document.querySelector('.result');

    innerRing.removeAttribute('data-spinto');
    innerRing.classList.remove('rest');
    dataContainer.classList.remove('reveal');

    // --- 1. LOSOWANIE WYNIKU (0-36) ---
    const winningNumber = Math.floor(Math.random() * 37);
    
    // Sprawdzenie koloru wyniku
    const redNumbers = [32, 19, 21, 25, 34, 27, 36, 30, 23, 5, 16, 1, 14, 9, 18, 7, 12, 3];
    let resultColor = 'black';
    if (winningNumber === 0) resultColor = 'green';
    else if (redNumbers.includes(winningNumber)) resultColor = 'red';

    // --- 2. ANIMACJA ---
    // Małe opóźnienie żeby CSS załapał reset
    setTimeout(() => {
        innerRing.setAttribute('data-spinto', winningNumber);
    }, 50);

    const spinDuration = 6000; // 6 sekund animacji (zgodne z CSS)

    try {
        // Czekamy na koniec kręcenia
        await new Promise(r => setTimeout(r, spinDuration));

        // Efekt końcowy
        innerRing.classList.add('rest');
        resultNumberEl.textContent = winningNumber;
        resultColorEl.textContent = resultColor === 'red' ? 'CZERWONE' : (resultColor === 'black' ? 'CZARNE' : 'ZIELONE');
        resultBg.style.backgroundColor = resultColor === 'red' ? 'var(--red)' : (resultColor === 'green' ? 'var(--green)' : '#111');
        dataContainer.classList.add('reveal');

        // Dodanie do historii
        const historyList = document.getElementById('previous-list');
        const li = document.createElement('li');
        li.className = `previous-result color-${resultColor}`;
        li.textContent = winningNumber;
        if(historyList) {
            historyList.prepend(li);
            if(historyList.children.length > 12) historyList.lastChild.remove();
        }

        // --- 3. WERYFIKACJA WYGRANEJ ---
        let multiplier = 0;
        
        if (currentSelection.type === 'color') {
            // Zakład na kolor
            if (currentSelection.value === resultColor) {
                if (resultColor === 'green') multiplier = 36; // Bonus za trafienie zera kolorem
                else multiplier = 2;
            }
        } else if (currentSelection.type === 'number') {
            // Zakład na liczbę
            if (parseInt(currentSelection.value) === winningNumber) {
                multiplier = 36; 
            }
        }

        // --- 4. TRANSAKCJA FIREBASE ---
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            const d = userDoc.data();

            if (d.cash < amount) throw new Error("Brak środków (walidacja serwera)");

            let newCash = d.cash;
            let newProfit = d.zysk || 0; // Zabezpieczenie na starych userów

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
    const p = document.createElement("p");
    const userPart = isGlobal ? `<span onclick="showUserProfile('${item.userId}')">${item.userName}</span> ` : "";
    p.innerHTML = `${userPart}<span>${item.type}</span> <span>${item.companyName}</span> <span>${formatujWalute(item.totalValue)}</span>`;
    feed.prepend(p);
}

window.showUserProfile = async function(uid) {
    const d = (await getDoc(doc(db, "uzytkownicy", uid))).data();
    dom.modalUsername.textContent = d.name;
    dom.modalTotalValue.textContent = formatujWalute(d.totalValue);
    dom.modalCash.textContent = formatujWalute(d.cash);
    dom.modalPrestigeLevel.textContent = d.prestigeLevel;
    
    let sharesHtml = "";
    COMPANY_ORDER.forEach(cid => { if((d.shares[cid]||0)>0) sharesHtml += `<p>${market[cid].name}: ${d.shares[cid]}</p>`; });
    dom.modalSharesList.innerHTML = sharesHtml || "<p>Brak aktywów</p>";
    
    dom.modalOverlay.classList.remove("hidden");
    if(uid === currentUserId) {
        dom.prestigeButton.disabled = d.totalValue < PRESTIGE_REQUIREMENTS[d.prestigeLevel||0];
        dom.prestigeNextGoal.textContent = `Cel: ${formatujWalute(PRESTIGE_REQUIREMENTS[d.prestigeLevel||0])}`;
    }
};

async function onPrestigeReset() {
    if(!confirm("Resetujesz konto dla Prestiżu?")) return;
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            t.update(ref, { 
                cash: 1000, 
                shares: {ulanska:0,rychbud:0,brzozair:0,cosmosanit:0,nicorp:0,igirium:0},
                startValue: 1000, zysk: 0, totalValue: 1000, 
                prestigeLevel: (d.prestigeLevel||0)+1 
            });
        });
        dom.modalOverlay.classList.add("hidden");
    } catch(e) {}
}

async function onBuyTip() {
    const cost = TIP_COSTS[portfolio.prestigeLevel];
    if(portfolio.cash < cost) return showMessage("Brak środków", "error");
    if(!confirm("Kupić info?")) return;
    const isReal = Math.random() < 0.65;
    const cid = COMPANY_ORDER[Math.floor(Math.random()*COMPANY_ORDER.length)];
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            t.update(ref, { cash: d.cash-cost });
            if(isReal) t.set(doc(collection(db, "pending_tips")), { userId: currentUserId, companyId: cid, impactType: Math.random()>0.5?'positive':'negative', executeAt: Timestamp.fromMillis(Date.now()+Math.random()*600000) });
        });
        showNotification(`Info o ${market[cid].name} kupione!`, 'tip');
    } catch(e) {}
}
