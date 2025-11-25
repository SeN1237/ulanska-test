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
    nicorp:     { name: "NiCorp",        price: 1000, previousPrice: null, history: [], type: 'crypto' }, 
    igirium:    { name: "Igirium",       price: 500, previousPrice: null, history: [], type: 'crypto' }
};

const companyAbbreviations = {
    ulanska: "UŁDEV", rychbud: "RBUD", brzozair: "BAIR", cosmosanit: "COSIT",
    nicorp: "NIC", igirium: "IGI"
};

let currentCompanyId = "ulanska";
let currentUserId = null;

// Zmienne UI
let chart = null;
let portfolioChart = null;
let modalPortfolioChart = null;

// PORTFEL UŻYTKOWNIKA
let portfolio = {
    name: "Gracz", cash: 0,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
    stats: { totalTrades: 0, tipsPurchased: 0, bondsPurchased: 0 },
    startValue: 100, zysk: 0, totalValue: 0, prestigeLevel: 0 
};

const PRESTIGE_REQUIREMENTS = [15000, 30000, 60000, 120000];
const TIP_COSTS = [1500, 1400, 1200, 1100, 1000];
const CRYPTO_PRESTIGE_REQUIREMENT = 3; 
const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"];

let dom = {};

// --- INICJALIZACJA ---
document.addEventListener("DOMContentLoaded", () => {
    cacheDOM();
    bindEvents();
    
    // Ustawienie motywu na start (wymuszenie ciemnego)
    document.body.setAttribute('data-theme', 'dark');
    
    // Auth Listener
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            dom.simulatorContainer.classList.remove("hidden");
            dom.authContainer.classList.add("hidden");
            // Ukryj splash screen po zalogowaniu
            const splash = document.getElementById("splash-screen");
            if(splash) splash.style.display = 'none';

            startListeners(currentUserId);
        } else {
            currentUserId = null;
            dom.simulatorContainer.classList.add("hidden");
            dom.authContainer.classList.remove("hidden");
            dom.authContainer.classList.remove("show-register");
        }
    });
});

function cacheDOM() {
    dom = {
        authContainer: document.getElementById("auth-container"),
        simulatorContainer: document.getElementById("simulator-container"),
        
        // --- KLUCZOWE DO NAWIGACJI ---
        navButtons: document.querySelectorAll(".nav-btn"),
        views: document.querySelectorAll(".view-section"),
        // -----------------------------
        
        loginForm: document.getElementById("login-form"),
        registerForm: document.getElementById("register-form"),
        authMessage: document.getElementById("auth-message"),
        showRegisterLink: document.getElementById("show-register-link"),
        showLoginLink: document.getElementById("show-login-link"),
        logoutButton: document.getElementById("logout-button"),
        username: document.getElementById("username"),

        // Market
        companyName: document.getElementById("company-name"),
        stockPrice: document.getElementById("stock-price"),
        chartContainer: document.getElementById("chart-container"),
        companySelector: document.getElementById("company-selector"),
        cryptoSelector: document.getElementById("crypto-selector"),
        marketTypeTabs: document.querySelectorAll(".market-type-tab"),
        
        // Order
        buyButton: document.getElementById("buy-button"),
        sellButton: document.getElementById("sell-button"),
        amountInput: document.getElementById("amount-input"),
        orderPanel: document.getElementById("order-panel"),

        // Portfolio Fun Tab
        cashDisplayFun: document.getElementById("cash-display-fun"),
        valueDisplayFun: document.getElementById("value-display-fun"),
        profitDisplayFun: document.getElementById("profit-display-fun"),
        sharesList: document.getElementById("shares-list"),

        // Ticker & Leaderboard
        tickerContent: document.getElementById("ticker-content"),
        leaderboardList: document.getElementById("leaderboard-list"),

        // Inne
        messageBox: document.getElementById("message-box"),
        notificationContainer: document.getElementById("notification-container"),
        
        // Kasyno
        casinoStatus: document.getElementById("casino-status"),
        casinoAmount: document.getElementById("casino-amount")
    };
}

function bindEvents() {
    // --- OBSŁUGA PRZEŁĄCZANIA ZAKŁADEK (TO NAPRAWIA TWOJE KLIKANIE) ---
    dom.navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            // 1. Usuń klasę active ze wszystkich przycisków
            dom.navButtons.forEach(b => b.classList.remove("active"));
            // 2. Dodaj active do klikniętego
            btn.classList.add("active");
            
            // 3. Ukryj wszystkie widoki
            dom.views.forEach(v => v.classList.remove("active"));
            // 4. Pokaż odpowiedni widok
            const viewId = `view-${btn.dataset.view}`;
            const viewEl = document.getElementById(viewId);
            if(viewEl) viewEl.classList.add("active");

            // Odśwież wykresy, żeby się dobrze przeskalowały po zmianie widoczności
            if(btn.dataset.view === 'market' && chart) {
                setTimeout(() => chart.render(), 50);
            }
        });
    });

    // Obsługa Auth
    dom.loginForm.addEventListener("submit", onLogin);
    dom.registerForm.addEventListener("submit", onRegister);
    dom.logoutButton.addEventListener("click", () => signOut(auth));
    dom.showRegisterLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.add("show-register"); });
    dom.showLoginLink.addEventListener("click", (e) => { e.preventDefault(); dom.authContainer.classList.remove("show-register"); });

    // Obsługa Rynku
    dom.marketTypeTabs.forEach(tab => tab.addEventListener("click", onSelectMarketType));
    dom.companySelector.addEventListener("click", onSelectCompany);
    dom.cryptoSelector.addEventListener("click", onSelectCompany);
    
    dom.buyButton.addEventListener("click", () => tradeShares(true));
    dom.sellButton.addEventListener("click", () => tradeShares(false));

    // Zakładki wewnątrz paneli (Zlecenia, Historia)
    document.querySelectorAll(".order-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const type = e.target.dataset.orderType;
            document.querySelectorAll(".order-container").forEach(c => c.classList.remove("active"));
            document.getElementById(`order-${type}-container`).classList.add("active");
            document.querySelectorAll(".order-tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
        });
    });

    document.querySelectorAll("#history-tabs-panel .tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const t = e.target.dataset.tab;
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            document.getElementById(`tab-${t}`).classList.add("active");
            document.querySelectorAll("#history-tabs-panel .tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
        });
    });
}

// --- LOGIKA GIEŁDY ---

function onSelectMarketType(e) {
    const type = e.target.dataset.marketType;
    dom.marketTypeTabs.forEach(t => t.classList.toggle("active", t.dataset.marketType === type));
    dom.companySelector.classList.toggle("hidden", type !== 'stocks');
    dom.cryptoSelector.classList.toggle("hidden", type !== 'crypto');
    changeCompany(type === 'stocks' ? 'ulanska' : 'nicorp');
}

function onSelectCompany(e) {
    if(e.target.classList.contains("company-tab")) changeCompany(e.target.dataset.company);
}

function changeCompany(cid) {
    if(!market[cid]) return;
    currentCompanyId = cid;
    dom.companyName.textContent = market[cid].name;
    document.querySelectorAll(".company-tab").forEach(t => t.classList.toggle("active", t.dataset.company === cid));
    
    const isCrypto = market[cid].type === 'crypto';
    const locked = isCrypto && portfolio.prestigeLevel < CRYPTO_PRESTIGE_REQUIREMENT;
    dom.orderPanel.classList.toggle("crypto-locked", locked);

    if(chart) chart.updateSeries([{ data: market[cid].history || [] }]);
    updatePriceUI();
}

// --- DANE FIREBASE ---

function startListeners(uid) {
    // 1. Ceny Akcji
    onSnapshot(doc(db, "global", "ceny_akcji"), (snap) => {
        if(snap.exists()) {
            const ceny = snap.data();
            for(const cid in market) {
                // Konwersja starego klucza (bartcoin -> nicorp)
                let dbKey = cid;
                if (cid === 'nicorp' && ceny['bartcoin'] !== undefined) dbKey = 'bartcoin';
                
                if(ceny[dbKey] !== undefined) {
                    market[cid].previousPrice = market[cid].price;
                    market[cid].price = ceny[dbKey];
                    
                    if(market[cid].history.length === 0) {
                        generateFakeHistory(cid);
                    } else {
                        const last = market[cid].history[market[cid].history.length-1];
                        const newTime = new Date(last.x).getTime() + 15000;
                        market[cid].history.push({
                            x: newTime,
                            y: [last.y[3], market[cid].price, market[cid].price, market[cid].price] 
                        });
                        if(market[cid].history.length > 50) market[cid].history.shift();
                    }
                }
            }
            updatePriceUI();
            updatePortfolioUI();
            updateTicker();
            if(!chart) initChart();
        }
    });

    // 2. Portfel Użytkownika
    onSnapshot(doc(db, "uzytkownicy", uid), (snap) => {
        if(snap.exists()) {
            const d = snap.data();
            portfolio.cash = d.cash;
            portfolio.prestigeLevel = d.prestigeLevel || 0;
            
            // Mapowanie akcji
            portfolio.shares = { ...d.shares };
            if (portfolio.shares.bartcoin && !portfolio.shares.nicorp) {
                portfolio.shares.nicorp = portfolio.shares.bartcoin;
            }

            portfolio.name = d.name;
            portfolio.startValue = d.startValue;
            updatePortfolioUI();
        }
    });

    // 3. Ranking
    onSnapshot(query(collection(db, "uzytkownicy"), orderBy("totalValue", "desc"), limit(10)), snap => {
        dom.leaderboardList.innerHTML = "";
        let i = 1;
        snap.forEach(d => {
            const u = d.data();
            const profit = u.totalValue - u.startValue;
            const cls = profit >= 0 ? 'profit-plus' : 'profit-minus';
            const me = d.id === uid ? 'highlight-me' : '';
            dom.leaderboardList.innerHTML += `
                <li class="${me}">
                    <span>${i}. ${u.name} ${getPrestigeStars(u.prestigeLevel)}</span>
                    <span class="${cls}">${formatujWalute(profit)}</span>
                    <strong>${formatujWalute(u.totalValue)}</strong>
                </li>
            `;
            i++;
        });
    });
    
    // Obsługa czatu (podstawowa)
    onSnapshot(query(collection(db, "chat_messages"), orderBy("timestamp", "desc"), limit(20)), snap => {
        const feed = document.getElementById("chat-feed");
        if(feed) {
            feed.innerHTML = "";
            snap.docs.slice().reverse().forEach(d => {
                const m = d.data();
                feed.innerHTML += `<p><strong>${m.authorName}:</strong> ${m.text}</p>`;
            });
            feed.scrollTop = feed.scrollHeight;
        }
    });
}

// --- FUNKCJE POMOCNICZE UI ---

function updatePriceUI() {
    if(!market[currentCompanyId]) return;
    dom.stockPrice.textContent = formatujWalute(market[currentCompanyId].price);
}

function updatePortfolioUI() {
    let sharesVal = 0;
    let listHtml = "";
    
    COMPANY_ORDER.forEach(cid => {
        const amt = portfolio.shares[cid] || 0;
        if(amt > 0) {
            const val = amt * market[cid].price;
            sharesVal += val;
            listHtml += `<div class="wallet-item-row"><span>${market[cid].name}</span> <strong>${amt} szt.</strong></div>`;
        }
    });

    const total = portfolio.cash + sharesVal;
    const profit = total - portfolio.startValue;

    if(dom.cashDisplayFun) {
        dom.cashDisplayFun.textContent = formatujWalute(portfolio.cash);
        dom.valueDisplayFun.textContent = formatujWalute(total);
        dom.profitDisplayFun.textContent = formatujWalute(profit);
        dom.profitDisplayFun.style.color = profit >= 0 ? "var(--green)" : "var(--red)";
    }

    if(dom.sharesList) dom.sharesList.innerHTML = listHtml || "<p style='color:#777; text-align:center'>Portfel pusty</p>";
    if(dom.username) dom.username.innerHTML = `${portfolio.name} ${getPrestigeStars(portfolio.prestigeLevel)}`;
}

function formatujWalute(val) {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val);
}

function getPrestigeStars(lvl) {
    return lvl ? `<span style="color:gold">${'⭐️'.repeat(lvl)}</span>` : '';
}

function generateFakeHistory(cid) {
    const base = market[cid].price;
    let now = Date.now();
    for(let i=0; i<50; i++) {
        market[cid].history.unshift({
            x: now - (i*15000),
            y: [base, base, base, base]
        });
    }
}

function initChart() {
    if(!dom.chartContainer) return;
    chart = new ApexCharts(dom.chartContainer, {
        series: [{ data: [] }],
        chart: { type: 'candlestick', height: 400, background: 'transparent', toolbar: {show:false}, animations: {enabled:false} },
        theme: { mode: 'dark' },
        xaxis: { type: 'datetime', labels: { style: { colors: '#777' } } },
        yaxis: { labels: { style: { colors: '#777' }, formatter: v => v.toFixed(2) } },
        grid: { borderColor: '#333' },
        plotOptions: { candlestick: { colors: { upward: '#10b981', downward: '#ef4444' } } }
    });
    chart.render();
}

function updateTicker() {
    let html = "";
    COMPANY_ORDER.forEach(cid => {
        const p = market[cid].price;
        const prev = market[cid].previousPrice || p;
        const diff = ((p - prev)/p)*100;
        const cls = diff >= 0 ? 'ticker-up' : 'ticker-down';
        html += `<span class="ticker-item">${market[cid].name} <strong>${p.toFixed(2)}</strong> <span class="${cls}">${diff.toFixed(2)}%</span></span>`;
    });
    if(dom.tickerContent) dom.tickerContent.innerHTML = html;
}

// --- OBSŁUGA AUTH ---
async function onLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    try { await signInWithEmailAndPassword(auth, email, pass); } catch(err) { alert(err.message); }
}
async function onRegister(e) {
    e.preventDefault();
    const name = document.getElementById("register-name").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    try { 
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "uzytkownicy", cred.user.uid), {
            name: name, email: email, cash: 1000, shares: {}, startValue: 1000, totalValue: 1000, prestigeLevel: 0
        });
    } catch(err) { alert(err.message); }
}

// --- TRANSAKCJE ---
async function tradeShares(isBuy) {
    if(dom.orderPanel.classList.contains("crypto-locked")) return alert("Zablokowane! Wbij 3 poziom prestiżu.");
    const amt = parseInt(dom.amountInput.value);
    if(!amt || amt<=0) return alert("Podaj ilość");
    
    const cid = currentCompanyId;
    const price = market[cid].price;
    const cost = amt * price;

    try {
        await runTransaction(db, async (t) => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            
            let shares = d.shares || {};
            // Migracja bartcoin -> nicorp w locie
            if(shares.bartcoin && !shares.nicorp) { shares.nicorp = shares.bartcoin; delete shares.bartcoin; }

            if(isBuy && d.cash < cost) throw new Error("Brak kasy");
            if(!isBuy && (shares[cid]||0) < amt) throw new Error("Brak akcji");

            const newCash = isBuy ? d.cash - cost : d.cash + cost;
            shares[cid] = isBuy ? (shares[cid]||0) + amt : shares[cid] - amt;
            
            let val = newCash;
            for(let c in shares) if(market[c]) val += shares[c] * market[c].price;

            t.update(ref, { cash: newCash, shares: shares, totalValue: val });
        });
        dom.amountInput.value = "";
    } catch(e) { alert(e.message); }
}

// --- GLOBALNE FUNKCJE DLA HTML (RULETKA) ---
window.selectBetType = function(type, value) {
    // Prosta obsługa zaznaczania (wizualna)
    document.querySelectorAll('.num-btn, .casino-btn').forEach(b => b.classList.remove('selected'));
    if(type === 'color') {
        document.querySelector(`.btn-${value}`)?.classList.add('selected');
        dom.casinoStatus.textContent = `Wybrano kolor: ${value}`;
    } else {
        document.querySelector(`.num-btn.num-${value}`)?.classList.add('selected');
        dom.casinoStatus.textContent = `Wybrano liczbę: ${value}`;
    }
    // Zapisz wybór w zmiennej globalnej (w tej uproszczonej wersji brakuje logiki gry, ale zaznaczanie działa)
    window.currentCasinoSelection = { type, value };
};

window.commitSpin = async function() {
    if(!window.currentCasinoSelection) return alert("Wybierz stawkę!");
    const amount = parseInt(dom.casinoAmount.value);
    if(!amount || amount > portfolio.cash) return alert("Brak środków!");
    
    dom.casinoStatus.textContent = "Kręcimy...";
    // ... Tu można wkleić pełną logikę ruletki z poprzednich wersji, jeśli jest potrzebna
    // W tej wersji to tylko atrapa dla interfejsu
    setTimeout(() => {
        const win = Math.floor(Math.random() * 37);
        dom.casinoStatus.textContent = `Wynik: ${win}. Sprawdź historię.`;
        // Tutaj powinna być transakcja Firebase
    }, 2000);
};
