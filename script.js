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
    bartcoin:   { name: "Bartcoin",      price: 1000, previousPrice: null, history: [], type: 'crypto' },
    igirium:    { name: "Igirium",       price: 500, previousPrice: null, history: [], type: 'crypto' }
};

const companyAbbreviations = {
    ulanska: "UŁDEV", rychbud: "RBUD", brzozair: "BAIR", cosmosanit: "COSIT",
    bartcoin: "BRC", igirium: "IGI"
};

let currentCompanyId = "ulanska";
let currentMarketType = "stocks"; 

let portfolio = {
    name: "Gość", cash: 0,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, bartcoin: 0, igirium: 0 },
    stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
    startValue: 100, zysk: 0, totalValue: 0, prestigeLevel: 0 
};

const PRESTIGE_REQUIREMENTS = [15000, 30000, 60000, 120000];
const TIP_COSTS = [1500, 1400, 1200, 1100, 1000];
const CRYPTO_PRESTIGE_REQUIREMENT = 3; 
const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "bartcoin", "igirium"];
const CHART_COLORS = ['var(--blue)', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF', '#F0B90B', '#627EEA'];

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

// --- ZMIENNE DLA ZAKŁADÓW ---
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

// --- NASŁUCHIWACZ CEN ---
const cenyDocRef = doc(db, "global", "ceny_akcji");
onSnapshot(cenyDocRef, (docSnap) => {
    if (docSnap.exists()) {
        const aktualneCeny = docSnap.data();
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

// --- START APLIKACJI ---
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem('simulatorTheme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

    dom = {
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
        
        navButtons: document.querySelectorAll(".nav-btn"),
        views: document.querySelectorAll(".view-section"),
        entertainmentCash: document.getElementById("entertainment-cash-display"),

        themeSelect: document.getElementById("theme-select"),
        tickerContent: document.getElementById("ticker-content"),
        marketTypeTabs: document.querySelectorAll(".market-type-tab"),
        companySelector: document.getElementById("company-selector"),
        cryptoSelector: document.getElementById("crypto-selector"),
        companyName: document.getElementById("company-name"),
        stockPrice: document.getElementById("stock-price"),
        chartContainer: document.getElementById("chart-container"),
        
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
        betTeamSelect: document.getElementById("bet-team"),
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
        modalTipsPurchased: document.getElementById("modal-tips-purchased"),
        modalBondsPurchased: document.getElementById("modal-bonds-purchased"),
        prestigeInfo: document.getElementById("prestige-info"), 
        prestigeNextGoal: document.getElementById("prestige-next-goal"), 
        prestigeButton: document.getElementById("prestige-button"), 

        audioKaching: document.getElementById("audio-kaching"),
        audioError: document.getElementById("audio-error"),
        audioNews: document.getElementById("audio-news"),
        notificationContainer: document.getElementById("notification-container")
    };

    if(dom.themeSelect) dom.themeSelect.value = savedTheme;

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

// --- FUNKCJE UI POMOCNICZE ---
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
    if (modalPortfolioChart) modalPortfolioChart.updateOptions({ theme: { mode: newMode } });
}

// --- NAWIGACJA ---
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
    if (viewName === 'market' && chart) chart.render();
}

// --- AUTH LOGIC ---
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
            listenToActiveMatch();
            listenToActiveBets(currentUserId);
            listenToPvP();
            
            // Default view
            if(dom.navButtons.length > 0) dom.navButtons[0].click();
        } else {
            currentUserId = null;
            dom.simulatorContainer.classList.add("hidden");
            dom.authContainer.classList.remove("hidden");
            dom.authContainer.classList.remove("show-register");
            
            if (unsubscribePortfolio) unsubscribePortfolio();
            if (unsubscribeMatch) unsubscribeMatch();
            if (unsubscribePvP) unsubscribePvP();
            
            chartHasStarted = false; chart = null; portfolioChart = null;
        }
    });
}
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
                shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, bartcoin: 0, igirium: 0 },
                stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
                startValue: 1000.00, zysk: 0.00, totalValue: 1000.00,
                joinDate: Timestamp.fromDate(new Date()), prestigeLevel: 0 
            });
        }
    } catch (err) { showAuthMessage(err.message, "error"); }
}
async function onLogin(e) { e.preventDefault(); try { await signInWithEmailAndPassword(auth, dom.loginForm.querySelector("#login-email").value, dom.loginForm.querySelector("#login-password").value); } catch (err) { showAuthMessage(err.message, "error"); } }
function onLogout() { signOut(auth); }
async function onResetPassword(e) {
    e.preventDefault();
    const email = dom.loginForm.querySelector("#login-email").value;
    if(!email) return showAuthMessage("Podaj email", "error");
    try { await sendPasswordResetEmail(auth, email); showAuthMessage("Wysłano link", "success"); } catch(err) { showAuthMessage(err.message, "error"); }
}

// --- PORTFOLIO DATA ---
function listenToPortfolioData(userId) {
    unsubscribePortfolio = onSnapshot(doc(db, "uzytkownicy", userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            portfolio.name = data.name;
            portfolio.cash = data.cash;
            portfolio.shares = data.shares || portfolio.shares;
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

// =========================================================
// === SEKCJA ZAKŁADÓW (NOWA LOGIKA Z TABELĄ I DNIAMI) ===
// =========================================================

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
        const btnLabel = dateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'numeric' });
        btn.textContent = btnLabel.charAt(0).toUpperCase() + btnLabel.slice(1);
        btn.onclick = () => { activeDayTab = dayKey; renderBettingPanel(); };
        navContainer.appendChild(btn);
    });
    dom.matchInfo.appendChild(navContainer);

    const dayMatches = matchesByDay[activeDayTab];
    dayMatches.sort((a, b) => a.closeTime.seconds - b.closeTime.seconds);

    const table = document.createElement("table");
    table.className = "betting-table";
    table.innerHTML = `<thead><tr><th class="col-time">Godzina</th><th class="col-match">Mecz</th><th class="col-odds">Kursy (1 - X - 2)</th></tr></thead><tbody></tbody>`;
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

        let matchHtml = `<strong>${match.teamA}</strong><br><small>vs</small><br><strong>${match.teamB}</strong>`;
        if (isResolved) {
            let w = match.winner === 'draw' ? 'REMIS' : (match.winner === 'teamA' ? match.teamA : match.teamB);
            matchHtml += `<br><span class="match-finished">Wynik: ${w}</span>`;
        }

        const createBtn = (teamCode, odds, label) => `
            <button class="table-bet-btn" ${isClosed ? 'disabled' : ''}
                onclick="selectBet('${match.id}', '${teamCode}', ${odds}, '${match.teamA} vs ${match.teamB} [${label}]')">
                ${label}<small>${odds.toFixed(2)}</small>
            </button>`;

        const oddsHtml = `<div class="odds-btn-group">
            ${createBtn('teamA', match.oddsA, match.teamA)}
            ${createBtn('draw', match.oddsDraw, 'Remis')}
            ${createBtn('teamB', match.oddsB, match.teamB)}
        </div>`;

        tr.innerHTML = `<td class="col-time">${timeHtml}</td><td class="col-match">${matchHtml}</td><td class="col-odds">${oddsHtml}</td>`;
        tbody.appendChild(tr);
    });
    dom.matchInfo.appendChild(table);
}

window.selectBet = function(id, team, odds, label) {
    currentBetSelection = { id, team, odds };
    dom.bettingForm.classList.remove("hidden");
    if(dom.betTeamSelect) dom.betTeamSelect.style.display = 'none';
    dom.placeBetButton.textContent = `Postaw na: ${label} (Kurs: ${odds.toFixed(2)})`;
    dom.bettingForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    dom.betAmount.focus();
};

async function onPlaceBet(e) {
    e.preventDefault();
    if (!currentBetSelection || !currentUserId) return;
    const amount = parseFloat(dom.betAmount.value);
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj kwotę", "error");
    if (amount > portfolio.cash) return showMessage("Brak gotówki", "error");

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await transaction.get(userRef);
            if(userDoc.data().cash < amount) throw new Error("Brak środków");
            
            const newCash = userDoc.data().cash - amount;
            const newVal = calculateTotalValue(newCash, userDoc.data().shares);
            
            transaction.update(userRef, { cash: newCash, totalValue: newVal });
            const betRef = doc(collection(db, "active_bets"));
            transaction.set(betRef, {
                userId: currentUserId,
                userName: portfolio.name,
                matchId: currentBetSelection.id,
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

// --- NAPRAWIONA FUNKCJA: LISTEN TO ACTIVE BETS ---
function listenToActiveBets(userId) {
    if (unsubscribeActiveBets) unsubscribeActiveBets();

    const q = query(
        collection(db, "active_bets"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(10)
    );

    unsubscribeActiveBets = onSnapshot(q, (snap) => {
        dom.activeBetsFeed.innerHTML = "";
        if (snap.empty) {
            dom.activeBetsFeed.innerHTML = "<p>Brak aktywnych zakładów.</p>";
            return;
        }

        snap.forEach((doc) => {
            const b = doc.data();
            
            // Ustalanie statusu i koloru
            let statusText = 'Oczekuje';
            let statusColor = 'var(--accent-color)';
            
            if (b.status === 'won') {
                statusText = 'WYGRANA';
                statusColor = 'var(--green)';
            } else if (b.status === 'lost') {
                statusText = 'PRZEGRANA';
                statusColor = 'var(--red)';
            }

            // Etykieta typu
            let typeLabel = b.betOn;
            if(typeLabel === 'draw') typeLabel = 'Remis';
            else if(typeLabel === 'teamA') typeLabel = 'Gospodarze';
            else if(typeLabel === 'teamB') typeLabel = 'Goście';

            const html = `
                <p style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 5px; margin: 5px 0;">
                    <span>
                        Typ: <strong>${typeLabel}</strong> <br>
                        <small>Stawka: ${formatujWalute(b.betAmount)} @ ${b.odds.toFixed(2)}</small>
                    </span>
                    <strong style="color:${statusColor}; align-self: center;">${statusText}</strong>
                </p>`;
            
            dom.activeBetsFeed.insertAdjacentHTML('beforeend', html);
        });
    });
}

// --- CORE TRADING ---
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
function onBuyMax() { const p = market[currentCompanyId].price; if(p>0) dom.amountInput.value = Math.floor(portfolio.cash/p); }
function onSellMax() { dom.amountInput.value = portfolio.shares[currentCompanyId]||0; }

// --- CHARTS ---
function initChart() {
    chart = new ApexCharts(dom.chartContainer, {
        series: [{ data: market[currentCompanyId].history }],
        chart: { type: 'candlestick', height: 350, toolbar: {show:false}, animations: {enabled:false} },
        theme: { mode: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark' },
        xaxis: { type: 'datetime' },
        yaxis: { labels: { formatter: v => v.toFixed(2) } },
        plotOptions: { candlestick: { colors: { upward: '#28a745', downward: '#dc3545' } } }
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
            const newCandle = { x: new Date(newTime), y: [open.toFixed(2), high.toFixed(2), low.toFixed(2), close.toFixed(2)] };
            history.push(newCandle);
            if (history.length > 50) history.shift();
        }
        if (chart && market[currentCompanyId].history.length > 0) {
            chart.updateSeries([{ data: market[currentCompanyId].history }]);
        }
    }, 15000); 
}
function initPortfolioChart() {
    portfolioChart = new ApexCharts(dom.portfolioChartContainer, {
        series: [portfolio.cash], labels: ['Gotówka'],
        chart: { type: 'donut', height: 300 }, 
        colors: CHART_COLORS,
        theme: { mode: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark' },
        legend: { position: 'bottom' }, 
        dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { labels: { show: true, total: { show: true, label: 'Wartość Portfela', formatter: w => formatujWalute(w.globals.seriesTotals.reduce((a, b) => a + b, 0)) } } } } }
    });
    portfolioChart.render();
}

// --- INNE FUNKCJE ---
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
        const t = document.createElement("table"); t.className="limit-order-table"; t.innerHTML = "<thead><tr><th>Typ</th><th>Spółka</th><th>Ilość</th><th>Cena</th><th>Status</th><th>Akcja</th></tr></thead><tbody></tbody>";
        snap.forEach(d => {
            const o = d.data();
            const cls = o.type.includes("KUPNO") ? (o.type.includes("Krypto")?"l-type-buy-crypto":"l-type-buy") : (o.type.includes("Krypto")?"l-type-sell-crypto":"l-type-sell");
            const act = o.status === 'pending' ? `<button class="cancel-order-btn" onclick="cancelLimit('${d.id}')">Anuluj</button>` : '-';
            t.querySelector("tbody").innerHTML += `<tr><td class="${cls}">${o.type}</td><td>${o.companyName}</td><td>${o.amount}</td><td>${o.limitPrice}</td><td>${o.status}</td><td>${act}</td></tr>`;
        });
        if(!snap.empty) dom.limitOrdersFeed.appendChild(t);
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
        await addDoc(collection(db, "historia_transakcji"), { userId: currentUserId, userName: portfolio.name, type: "OBLIGACJA (ZAKUP)", companyName: `Obligacja ${days}d`, amount:0, pricePerShare:0, totalValue:-amt, timestamp: serverTimestamp(), status:"executed" });
        showMessage("Kupiono obligację!", "success");
    } catch(e) { showMessage(e.message, "error"); }
}
function listenToActiveBonds(userId) {
    unsubscribeBonds = onSnapshot(query(collection(db, "active_bonds"), where("userId", "==", userId), orderBy("createdAt", "desc")), snap => {
        dom.activeBondsFeed.innerHTML = snap.empty ? "<p>Brak obligacji.</p>" : "";
        snap.forEach(d => {
            const b = d.data();
            const st = b.status==='pending' ? `Oczekuje` : 'Wykupiona';
            dom.activeBondsFeed.innerHTML += `<p><strong>${b.name}</strong>: ${formatujWalute(b.investment)} -> ${formatujWalute(b.investment+b.profit)} <br><small>${st}</small></p>`;
        });
    });
}

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
function listenToChat() {
    unsubscribeChat = onSnapshot(query(collection(db, "chat_messages"), orderBy("timestamp", "desc"), limit(30)), snap => {
        dom.chatFeed.innerHTML = "";
        snap.docs.slice().reverse().forEach(d => {
            const m = d.data();
            dom.chatFeed.innerHTML += `<p class="${m.authorId===currentUserId?'my-message':''}"><strong class="clickable-user" onclick="showUserProfile('${m.authorId}')">${m.authorName}</strong>${getPrestigeStars(m.prestigeLevel,'chat')}: ${m.text}</p>`;
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
            let profitClass = profitValue < 0 ? "profit-minus" : "profit-plus";
            let profitSign = profitValue < 0 ? "" : "+";
            dom.leaderboardList.innerHTML += `
                <li class="${d.id === currentUserId ? 'highlight-me' : ''}">
                    <div class="leaderboard-left clickable-area" onclick="showUserProfile('${d.id}')">
                        <div class="leaderboard-top-row">
                            <span class="leaderboard-rank">${r}.</span>
                            <span class="leaderboard-name">${u.name}</span>
                            ${getPrestigeStars(u.prestigeLevel)}
                        </div>
                        <span class="leaderboard-profit ${profitClass}">Zysk: ${profitSign}${formatujWalute(profitValue)}</span>
                    </div>
                    <div class="leaderboard-total">${formatujWalute(u.totalValue)}</div>
                </li>`;
            r++;
        });
    });
}
function listenToGlobalHistory() { unsubscribeGlobalHistory = onSnapshot(query(collection(db, "historia_transakcji"), orderBy("timestamp", "desc"), limit(15)), snap => { dom.globalHistoryFeed.innerHTML=""; snap.forEach(d => displayHistoryItem(dom.globalHistoryFeed, d.data(), true)); }); }
function listenToPersonalHistory(uid) { unsubscribePersonalHistory = onSnapshot(query(collection(db, "historia_transakcji"), where("userId","==",uid), orderBy("timestamp", "desc"), limit(15)), snap => { dom.personalHistoryFeed.innerHTML=""; snap.forEach(d => displayHistoryItem(dom.personalHistoryFeed, d.data(), false)); }); }

function displayHistoryItem(feed, item, isGlobal) {
    const p = document.createElement("p");
    const userPart = isGlobal ? `<span class="h-user clickable-user" onclick="showUserProfile('${item.userId}')">${item.userName}${getPrestigeStars(item.prestigeLevel)}</span> ` : "";
    let typeCls = item.type==="KUPNO"?"h-action-buy":(item.type==="SPRZEDAŻ"?"h-action-sell":"h-total");
    if(item.type.includes("Krypto")) typeCls = item.type.includes("KUPNO") ? "l-type-buy-crypto" : "l-type-sell-crypto";
    p.innerHTML = `${userPart}<span class="${typeCls}">${item.type}</span> <span class="h-details">${item.companyName}</span> <span class="h-total">${formatujWalute(item.totalValue)}</span>`;
    feed.prepend(p);
}

window.showUserProfile = async function(uid) {
    const d = (await getDoc(doc(db, "uzytkownicy", uid))).data();
    dom.modalUsername.textContent = d.name;
    dom.modalTotalValue.textContent = formatujWalute(d.totalValue);
    dom.modalCash.textContent = formatujWalute(d.cash);
    dom.modalPrestigeLevel.textContent = d.prestigeLevel;
    dom.modalTotalTrades.textContent = d.stats?.totalTrades || 0;
    dom.modalTipsPurchased.textContent = d.stats?.tipsPurchased || 0;
    dom.modalBondsPurchased.textContent = d.stats?.bondsPurchased || 0;
    
    const s = [d.cash]; const l = ['Gotówka'];
    let sharesHtml = "";
    COMPANY_ORDER.forEach(cid => {
        const amt = d.shares[cid]||0;
        if(amt>0) {
            const val = amt*(market[cid]?.price||0);
            s.push(val); l.push(market[cid]?.name||cid);
            sharesHtml += `<p>${market[cid]?.name||cid}: <strong>${amt}</strong></p>`;
        }
    });
    dom.modalSharesList.innerHTML = sharesHtml || "<p>Brak akcji</p>";
    
    if(!modalPortfolioChart) modalPortfolioChart = new ApexCharts(dom.modalPortfolioChartContainer, { series: s, labels: l, chart: { type: 'donut', height: 250 }, theme: { mode: document.body.getAttribute('data-theme')==='light'?'light':'dark' }});
    else modalPortfolioChart.updateOptions({ series: s, labels: l });
    modalPortfolioChart.render();
    
    if(uid === currentUserId) {
        dom.prestigeInfo.style.display = 'flex'; dom.prestigeButton.style.display = 'block';
        updatePrestigeButton(d.totalValue, d.prestigeLevel||0);
    } else {
        dom.prestigeInfo.style.display = 'none'; dom.prestigeButton.style.display = 'none';
    }
    dom.modalOverlay.classList.remove("hidden");
};

function updatePrestigeButton(val, lvl) {
    if(lvl >= PRESTIGE_REQUIREMENTS.length) {
        dom.prestigeButton.textContent = "Max Poziom"; dom.prestigeButton.disabled = true;
    } else {
        const req = PRESTIGE_REQUIREMENTS[lvl];
        dom.prestigeNextGoal.textContent = `Cel: ${formatujWalute(req)}`;
        dom.prestigeButton.textContent = val >= req ? `Awansuj na poziom ${lvl+1}` : `Brakuje ${formatujWalute(req-val)}`;
        dom.prestigeButton.disabled = val < req;
    }
}
async function onPrestigeReset() {
    if(!confirm("Resetujesz portfel do 1000 zł w zamian za prestiż. Kontynuować?")) return;
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            t.update(ref, { cash: 1000, shares: {ulanska:0,rychbud:0,brzozair:0,cosmosanit:0,bartcoin:0,igirium:0}, startValue: 1000, zysk: 0, totalValue: 1000, prestigeLevel: (d.prestigeLevel||0)+1 });
        });
        showMessage("Awans prestiżu!", "success"); dom.modalOverlay.classList.add("hidden");
    } catch(e) { showMessage(e.message, "error"); }
}

function calculateTotalValue(cash, shares) {
    let val = cash;
    for(let cid in shares) if(market[cid]) val += shares[cid] * market[cid].price;
    return val;
}
function onSelectMarketType(e) {
    const type = e.target.dataset.marketType;
    dom.marketTypeTabs.forEach(t => t.classList.toggle("active", t.dataset.marketType === type));
    dom.companySelector.classList.toggle("hidden", type !== 'stocks');
    dom.cryptoSelector.classList.toggle("hidden", type !== 'crypto');
    changeCompany(type === 'stocks' ? 'ulanska' : 'bartcoin');
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
async function onBuyTip() {
    const cost = TIP_COSTS[portfolio.prestigeLevel];
    if(portfolio.cash < cost) return showMessage("Brak środków", "error");
    if(!confirm("Kupić wskazówkę?")) return;
    const isReal = Math.random() < 0.65;
    const cid = COMPANY_ORDER[Math.floor(Math.random()*COMPANY_ORDER.length)];
    const isPos = Math.random() > 0.5;
    try {
        await runTransaction(db, async t => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            t.update(ref, { cash: d.cash-cost, 'stats.tipsPurchased': increment(1) });
            if(isReal) t.set(doc(collection(db, "pending_tips")), { userId: currentUserId, companyId: cid, impactType: isPos?'positive':'negative', executeAt: Timestamp.fromMillis(Date.now()+Math.random()*600000) });
        });
        showNotification(`[${isReal?'PRAWDZIWE INFO':'FAŁSZYWKA'}] ${market[cid].name} może ${isPos?'wzrosnąć':'spaść'}...`, 'tip');
    } catch(e) { showMessage("Błąd", "error"); }
}

let isSpinning = false;
let currentSelection = null;
window.selectBetType = function(type, value) {
    if(isSpinning) return;
    currentSelection = { type, value };
    document.querySelectorAll('.casino-btn, .num-btn').forEach(b => b.classList.remove('selected'));
    if(type === 'color') {
        const btn = document.querySelector(`.btn-${value}`);
        if(btn) btn.classList.add('selected');
        dom.casinoStatus.textContent = `Wybrano: ${value === 'red' ? 'Czerwone' : (value === 'black' ? 'Czarne' : 'Zero')}`;
    } else {
        const btn = document.querySelector(`.num-btn.num-${value}`) || Array.from(document.querySelectorAll('.num-btn')).find(b => b.textContent == value);
        if(btn) btn.classList.add('selected');
        dom.casinoStatus.textContent = `Wybrano liczbę: ${value}`;
    }
};

window.commitSpin = async function() {
    if (isSpinning) return;
    if (!currentUserId) return showMessage("Zaloguj się!", "error");
    if (!currentSelection) return showMessage("Wybierz stawkę!", "error");

    const amount = parseInt(dom.casinoAmount.value);
    if (isNaN(amount) || amount <= 0) return showMessage("Podaj kwotę!", "error");
    if (amount > portfolio.cash) return showMessage("Brak środków!", "error");

    isSpinning = true;
    dom.casinoStatus.textContent = "Kręcimy... Powodzenia!";
    
    const allBtns = document.querySelectorAll('.casino-btn, .num-btn, .spin-btn');
    allBtns.forEach(b => b.disabled = true);
    dom.amountInput.disabled = true;

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

    setTimeout(() => { innerRing.setAttribute('data-spinto', winningNumber); }, 50);

    try {
        await new Promise(r => setTimeout(r, 6000));

        innerRing.classList.add('rest');
        resultNumberEl.textContent = winningNumber;
        resultColorEl.textContent = resultColor === 'red' ? 'CZERWONE' : (resultColor === 'black' ? 'CZARNE' : 'ZIELONE');
        resultBg.style.backgroundColor = resultColor === 'red' ? 'var(--red)' : (resultColor === 'green' ? 'var(--green)' : '#111');
        dataContainer.classList.add('reveal');

        const historyList = document.getElementById('previous-list');
        const li = document.createElement('li');
        li.className = `previous-result color-${resultColor}`;
        li.textContent = winningNumber;
        historyList.prepend(li);
        if(historyList.children.length > 12) historyList.lastChild.remove();

        let multiplier = 0;
        if (currentSelection.type === 'color') {
            if (currentSelection.value === resultColor) {
                if (resultColor === 'green') multiplier = 36;
                else multiplier = 2;
            }
        } else if (currentSelection.type === 'number') {
            if (parseInt(currentSelection.value) === winningNumber) multiplier = 36;
        }

        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(userRef)).data();
            if (d.cash < amount) throw new Error("Brak środków");
            let newCash = d.cash;
            let newProfit = d.zysk;
            if (multiplier > 0) {
                const winVal = amount * multiplier;
                newCash = newCash - amount + winVal;
                newProfit += (winVal - amount);
            } else {
                newCash -= amount;
                newProfit -= amount;
            }
            t.update(userRef, { cash: newCash, zysk: newProfit, totalValue: calculateTotalValue(newCash, d.shares) });
        });

        if (multiplier > 0) {
            const winText = formatujWalute(amount * multiplier);
            dom.casinoStatus.innerHTML = `<span style="color:var(--green)">WYGRANA! ${winText}</span>`;
            showNotification(`Wygrałeś ${winText} w ruletce!`, 'news', 'positive');
            dom.audioKaching.play().catch(()=>{});
        } else {
            dom.casinoStatus.innerHTML = `<span style="color:var(--red)">Przegrana... -${formatujWalute(amount)}</span>`;
            dom.audioError.play().catch(()=>{});
        }
    } catch (e) { showMessage("Błąd: " + e.message, "error"); } 
    finally {
        isSpinning = false;
        allBtns.forEach(b => b.disabled = false);
        dom.amountInput.disabled = false;
    }
};

const playedAnimations = new Set();
const WINNER_INDEX = 60; const CARD_WIDTH = 120;
function getSeededRandom(seedStr) { let h = 0x811c9dc5; for(let i=0;i<seedStr.length;i++) { h^=seedStr.charCodeAt(i); h=Math.imul(h,0x01000193); } return function() { h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return ((h>>>0)/4294967296); } }

function listenToPvP() {
    const q = query(collection(db, "pvp_duels"), where("status", "in", ["open", "battling"]), limit(20));
    unsubscribePvP = onSnapshot(q, (snap) => {
        dom.pvpFeed.innerHTML = "";
        let duels = [];
        snap.forEach(doc => duels.push({ id: doc.id, ...doc.data() }));
        duels.sort((a, b) => b.createdAt - a.createdAt);
        if (duels.length === 0) { dom.pvpFeed.innerHTML = "<p>Arena jest pusta. Stwórz wyzwanie!</p>"; return; }
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
                btnHtml = `<span class="pvp-status-battling">🎰 LOSOWANIE...</span>`;
            } else if (isMyDuel) {
                btnHtml = `<button class="pvp-join-btn" disabled style="background:#555; cursor:default;">Twoje</button>`;
            } else {
                btnHtml = `<button class="pvp-join-btn" onclick="joinPvP('${duel.id}', ${duel.amount}, '${duel.creatorName}')">WALCZ!</button>`;
            }
            div.innerHTML = `<div class="pvp-info"><strong>${formatujWalute(duel.amount)}</strong><span>vs ${duel.creatorName} ${getPrestigeStars(duel.creatorPrestige || 0)}</span></div><div>${btnHtml}</div>`;
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
            const userData = (await t.get(userRef)).data();
            if (userData.cash < amount) throw new Error("Za mało gotówki!");
            t.update(userRef, { cash: userData.cash - amount, totalValue: calculateTotalValue(userData.cash - amount, userData.shares) });
            const duelRef = doc(collection(db, "pvp_duels"));
            t.set(duelRef, { creatorId: currentUserId, creatorName: portfolio.name, creatorPrestige: portfolio.prestigeLevel || 0, amount: amount, status: "open", createdAt: serverTimestamp() });
        });
        showMessage("Wyzwanie rzucone!", "success");
        dom.pvpAmount.value = "";
        await addDoc(collection(db, "chat_messages"), { text: `⚔️ Stworzyłem wyzwanie PvP na ${formatujWalute(amount)}!`, authorName: "SYSTEM", authorId: "sys", prestigeLevel: 0, timestamp: serverTimestamp() });
    } catch (e) { showMessage("Błąd: " + e.message, "error"); }
}

window.joinPvP = async function(duelId, amount, opponentName) {
    if (!confirm(`Walczysz o ${formatujWalute(amount)}?`)) return;
    if (portfolio.cash < amount) return showMessage("Nie stać Cię!", "error");
    try {
        let winnerName = "";
        let winnerAmount = amount * 2; 
        await runTransaction(db, async (t) => {
            const duelRef = doc(db, "pvp_duels", duelId);
            const joinerRef = doc(db, "uzytkownicy", currentUserId);
            const duelDoc = await t.get(duelRef);
            const joinerDoc = await t.get(joinerRef);
            if (!duelDoc.exists() || duelDoc.data().status !== "open") throw new Error("Nieaktualne!");
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
            t.update(duelRef, { status: "battling", winner: winnerName, joinerId: currentUserId, joinerName: portfolio.name });
        });
        await addDoc(collection(db, "chat_messages"), { text: `⚔️ PVP: ${portfolio.name} przyjął wyzwanie! Losowanie...`, authorName: "SĘDZIA", authorId: "sys", prestigeLevel: 0, timestamp: serverTimestamp() });
    } catch (e) { showMessage("Błąd: " + e.message, "error"); }
};

function triggerGlobalPvPAnimation(duel) {
    const container = document.getElementById('pvp-embedded-roulette');
    const strip = document.getElementById('roulette-strip');
    const winnerText = document.getElementById('pvp-roulette-winner');
    const title = document.getElementById('pvp-vs-title');
    const rng = getSeededRandom(duel.id);
    container.classList.remove('hidden');
    strip.innerHTML = ""; strip.style.transition = "none"; strip.style.transform = "translateX(0px)"; winnerText.textContent = "LOSOWANIE...";
    title.innerHTML = `<span style="color:var(--blue)">${duel.creatorName}</span> vs <span style="color:var(--red)">${duel.joinerName}</span>`;
    const totalCards = 90; const cardsData = [];
    for (let i = 0; i < totalCards; i++) {
        if (i === WINNER_INDEX) cardsData.push(duel.winner === duel.creatorName ? 'creator' : 'joiner');
        else cardsData.push(rng() > 0.5 ? 'creator' : 'joiner');
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
    const windowWidth = document.querySelector('.roulette-window.embedded').offsetWidth;
    const winnerCenterPosition = (WINNER_INDEX * CARD_WIDTH) + (CARD_WIDTH / 2);
    const randomOffset = (rng() - 0.5) * (CARD_WIDTH * 0.7);
    const targetTranslate = (windowWidth / 2) - (winnerCenterPosition + randomOffset);
    setTimeout(() => {
        strip.style.transition = "transform 5s cubic-bezier(0.15, 0.85, 0.35, 1.0)";
        strip.style.transform = `translateX(${targetTranslate}px)`;
        setTimeout(() => {
            if (duel.winner === portfolio.name) {
                winnerText.textContent = "WYGRAŁEŚ!"; winnerText.style.color = "var(--green)"; dom.audioKaching.play().catch(()=>{});
            } else {
                winnerText.textContent = `WYGRAŁ: ${duel.winner}`; winnerText.style.color = (duel.winner === duel.creatorName) ? "var(--blue)" : "var(--red)";
                if(currentUserId === duel.creatorId || currentUserId === duel.joinerId) if(duel.winner !== portfolio.name) dom.audioError.play().catch(()=>{});
            }
            winnerText.classList.add('animate-winner-text');
            setTimeout(() => { container.classList.add('hidden'); if (currentUserId === duel.joinerId) closeDuelInDb(duel.id); }, 5000);
        }, 5000);
    }, 100);
}
async function closeDuelInDb(duelId) { try { await updateDoc(doc(db, "pvp_duels", duelId), { status: "closed" }); } catch(e) {} }
