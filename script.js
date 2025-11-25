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
    nicorp:     { name: "Nicorp",        price: 1000, previousPrice: null, history: [], type: 'crypto' }, // ZMIANA NAZWY
    igirium:    { name: "Igirium",       price: 500, previousPrice: null, history: [], type: 'crypto' }
};

const companyAbbreviations = {
    ulanska: "UŁDEV", rychbud: "RBUD", brzozair: "BAIR", cosmosanit: "COSIT",
    nicorp: "NIC", igirium: "IGI" // ZMIANA
};

let currentCompanyId = "ulanska";
let currentMarketType = "stocks"; 

let portfolio = {
    name: "Gość", cash: 0,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 }, // ZMIANA
    stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
    startValue: 100, zysk: 0, totalValue: 0, prestigeLevel: 0 
};

// ... (Reszta stałych bez zmian: PRESTIGE_REQUIREMENTS, TIP_COSTS) ...
const PRESTIGE_REQUIREMENTS = [15000, 30000, 60000, 120000];
const TIP_COSTS = [1500, 1400, 1200, 1100, 1000];
const CRYPTO_PRESTIGE_REQUIREMENT = 3; 
const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"]; // ZMIANA
const CHART_COLORS = ['var(--accent-color)', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF', '#F0B90B', '#627EEA'];

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

// ... (Funkcja generateInitialCandles bez zmian) ...
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

// ... (onSnapshot cenyDocRef - uwaga na mapowanie bartcoin -> nicorp) ...
const cenyDocRef = doc(db, "global", "ceny_akcji");
onSnapshot(cenyDocRef, (docSnap) => {
    if (docSnap.exists()) {
        const aktualneCeny = docSnap.data();
        
        // Mapowanie wsteczne dla starej bazy danych, jeśli tam nadal jest "bartcoin"
        if(aktualneCeny['bartcoin'] && !aktualneCeny['nicorp']) {
            aktualneCeny['nicorp'] = aktualneCeny['bartcoin'];
        }

        for (const companyId in market) {
            if (aktualneCeny[companyId] !== undefined) {
                market[companyId].previousPrice = market[companyId].price;
                market[companyId].price = aktualneCeny[companyId];
            }
        }
        // ... (reszta logiki wykresu bez zmian) ...
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
        
        // ... (Reszta referencji identyczna jak w oryginale, pominięta dla oszczędności miejsca) ...
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
        limitOrderForm: document.getElementById("limit-order-form"),
        limitType: document.getElementById("limit-type"),
        limitAmount: document.getElementById("limit-amount"),
        limitPrice: document.getElementById("limit-price"),
        limitOrdersFeed: document.getElementById("limit-orders-feed"),
        rumorForm: document.getElementById("rumor-form"),
        rumorInput: document.getElementById("rumor-input"),
        rumorsFeed: document.getElementById("rumors-feed"),
        buyTipButton: document.getElementById("buy-tip-button"), 
        tipCost: document.getElementById("tip-cost"), 
        newsFeed: document.getElementById("news-feed"), 
        leaderboardList: document.getElementById("leaderboard-list"),
        chatForm: document.getElementById("chat-form"),
        chatInput: document.getElementById("chat-input"),
        chatFeed: document.getElementById("chat-feed"),
        historyTabButtons: document.querySelectorAll("#history-tabs-panel .tab-btn"),
        globalHistoryFeed: document.getElementById("global-history-feed"),
        personalHistoryFeed: document.getElementById("personal-history-feed"),
        bondsForm: document.getElementById("bonds-form"),
        bondAmount: document.getElementById("bond-amount"),
        bondType: document.getElementById("bond-type"),
        activeBondsFeed: document.getElementById("active-bonds-feed"),
        matchInfo: document.getElementById("match-info"),
        bettingForm: document.getElementById("betting-form"),
        betAmount: document.getElementById("bet-amount"),
        placeBetButton: document.getElementById("place-bet-button"),
        activeBetsFeed: document.getElementById("active-bets-feed"),
        casinoAmount: document.getElementById("casino-amount"),
        casinoStatus: document.getElementById("casino-status"),
        pvpForm: document.getElementById("pvp-create-form"),
        pvpAmount: document.getElementById("pvp-amount"),
        pvpFeed: document.getElementById("pvp-feed"),
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
        audioKaching: document.getElementById("audio-kaching"),
        audioError: document.getElementById("audio-error"),
        audioNews: document.getElementById("audio-news"),
        notificationContainer: document.getElementById("notification-container")
    };

    if(dom.themeSelect) dom.themeSelect.value = savedTheme;

    // Listenery
    dom.navButtons.forEach(btn => btn.addEventListener("click", onSelectView)); // NOWY LISTENER NAWIGACJI
    
    // ... (Reszta listenerów bez zmian) ...
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

// --- NOWA FUNKCJA NAWIGACJI ---
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
            setTimeout(() => { if(!view.classList.contains('active')) view.classList.add('hidden') }, 500); // Hack na animację
        }
    });

    // Jeśli wracamy na giełdę, odświeżamy wykres
    if (viewName === 'market' && chart) {
        chart.render(); // Wymuś przerysowanie (fix dla ApexCharts w hidden div)
    }
}

// ... (Reszta funkcji pomocniczych i logiki bez zmian) ...
// ... (Z wyjątkiem miejsc gdzie było 'bartcoin' - teraz 'nicorp' w logice portfolio) ...

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
    const stars = getPrestigeStars(portfolio.prestigeLevel);
    dom.username.innerHTML = `${portfolio.name} ${stars}`;
    dom.tipCost.textContent = formatujWalute(TIP_COSTS[portfolio.prestigeLevel]);
    dom.buyTipButton.disabled = portfolio.cash < TIP_COSTS[portfolio.prestigeLevel];
    dom.cash.textContent = formatujWalute(portfolio.cash);
    
    // Update gotówki w zakładce rozrywki
    if(dom.entertainmentCash) dom.entertainmentCash.textContent = formatujWalute(portfolio.cash);

    let html = "";
    COMPANY_ORDER.forEach(cid => html += `<p>${market[cid] ? market[cid].name : cid}: <strong id="shares-${cid}">${portfolio.shares[cid]||0}</strong> szt.</p>`);
    dom.sharesList.innerHTML = html;

    let sharesValue = 0;
    const series = [portfolio.cash]; const labels = ['Gotówka'];
    COMPANY_ORDER.forEach(cid => {
        const val = (portfolio.shares[cid] || 0) * (market[cid] ? market[cid].price : 0);
        if(val > 0) { sharesValue += val; series.push(val); labels.push(market[cid].name); }
    });

    const total = portfolio.cash + sharesValue;
    const profit = total - portfolio.startValue;
    if (!portfolioChart) initPortfolioChart();
    portfolioChart.updateOptions({ series: series, labels: labels });

    dom.totalValue.textContent = formatujWalute(total);
    dom.totalProfit.textContent = formatujWalute(profit);
    dom.totalProfit.style.color = profit >= 0 ? "var(--green)" : "var(--red)";
    if (dom.modalOverlay && !dom.modalOverlay.classList.contains("hidden")) updatePrestigeButton(total, portfolio.prestigeLevel);
}

// ... (onRegister z 'nicorp' zamiast 'bartcoin') ...
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
                shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 }, // ZMIANA
                stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
                startValue: 1000.00, zysk: 0.00, totalValue: 1000.00,
                joinDate: Timestamp.fromDate(new Date()), prestigeLevel: 0 
            });
        }
    } catch (err) { showAuthMessage(err.message, "error"); }
}

// ... (onSelectMarketType - zmiana bartcoin na nicorp w domyślnym wyborze) ...
function onSelectMarketType(e) {
    const type = e.target.dataset.marketType;
    dom.marketTypeTabs.forEach(t => t.classList.toggle("active", t.dataset.marketType === type));
    dom.companySelector.classList.toggle("hidden", type !== 'stocks');
    dom.cryptoSelector.classList.toggle("hidden", type !== 'crypto');
    changeCompany(type === 'stocks' ? 'ulanska' : 'nicorp'); // ZMIANA
}

// ... (Reszta pliku script.js pozostaje bez zmian funkcjonalnych, 
//      poza podmianą ciągów 'bartcoin' na 'nicorp' we wszystkich miejscach logicznych) ...

// Funkcja resetująca prestiż również musi mieć zaktualizowaną listę udziałów:
async function onPrestigeReset() {
    if(!confirm("Resetujesz portfel do 1000 zł w zamian za prestiż. Kontynuować?")) return;
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            t.update(ref, { 
                cash: 1000, 
                shares: {ulanska:0,rychbud:0,brzozair:0,cosmosanit:0,nicorp:0,igirium:0}, // ZMIANA
                startValue: 1000, 
                zysk: 0, 
                totalValue: 1000, 
                prestigeLevel: (d.prestigeLevel||0)+1 
            });
        });
        showMessage("Awans prestiżu!", "success"); dom.modalOverlay.classList.add("hidden");
    } catch(e) { showMessage(e.message, "error"); }
}
