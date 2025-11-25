// --- IMPORTY ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, updateDoc, 
    collection, addDoc, query, orderBy, limit, serverTimestamp, 
    runTransaction, increment, getDoc 
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
// WYMUSZENIE LONG POLLING (NAPRAWA BŁĘDU QUIC)
const db = getFirestore(app, { experimentalForceLongPolling: true });

let currentUserId = null;
let currentCompanyId = "ulanska";
let chartInstance = null;

let market = {
    ulanska: { name: "Ułańska Dev", price: 100, previousPrice: 100, history: [] },
    rychbud: { name: "RychBud", price: 50, previousPrice: 50, history: [] },
    brzozair: { name: "BrzozAir", price: 200, previousPrice: 200, history: [] },
    cosmosanit: { name: "Cosmosanit", price: 300, previousPrice: 300, history: [] },
    nicorp: { name: "NiCorp", price: 1000, previousPrice: 1000, history: [] },
    igirium: { name: "Igirium", price: 500, previousPrice: 500, history: [] }
};

const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"];

let portfolio = {
    name: "Gracz", cash: 0, startValue: 1000,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
    prestigeLevel: 0
};

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
    cacheDOM();
    bindEvents();
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            document.getElementById("auth-container").classList.add("hidden");
            document.getElementById("simulator-container").classList.remove("hidden");
            document.getElementById("splash-screen").style.display = 'none';
            initApp(user.uid);
        } else {
            currentUserId = null;
            document.getElementById("auth-container").classList.remove("hidden");
            document.getElementById("simulator-container").classList.add("hidden");
        }
    });
    startLocalSimulation();
});

function cacheDOM() {
    const ids = [
        "login-form", "register-form", "show-register-link", "show-login-link", "logout-button",
        "username", "auth-message", "ticker-content",
        "stock-price", "company-name", "chart-container",
        "cash-display", "value-display", "profit-display",
        "amount-input", "buy-button", "sell-button", "buy-max-button", "sell-max-button",
        "shares-list", "leaderboard-list", "news-feed", "rumors-feed",
        "rumor-form", "rumor-input", "rumor-company-select",
        "global-history-feed", "personal-history-feed",
        "casino-amount", "spin-button", "casino-status",
        "pvp-create-form", "pvp-amount", "pvp-feed",
        "betting-form", "bet-amount", "place-bet-button", "active-bets-feed"
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) dom[id] = el;
    });
}

function bindEvents() {
    dom["login-form"].addEventListener("submit", onLogin);
    dom["register-form"].addEventListener("submit", onRegister);
    dom["logout-button"].addEventListener("click", () => signOut(auth));
    dom["show-register-link"].addEventListener("click", (e) => { e.preventDefault(); document.getElementById("auth-container").classList.add("show-register"); });
    dom["show-login-link"].addEventListener("click", (e) => { e.preventDefault(); document.getElementById("auth-container").classList.remove("show-register"); });

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".view-section").forEach(v => v.classList.remove("active"));
            e.target.classList.add("active");
            document.getElementById(`view-${e.target.dataset.view}`).classList.add("active");
            if(e.target.dataset.view === 'market' && chartInstance) chartInstance.render();
        });
    });

    document.querySelectorAll(".company-tab").forEach(btn => {
        btn.addEventListener("click", (e) => changeCompany(e.target.dataset.company));
    });

    document.querySelectorAll(".market-type-tab").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const type = e.target.dataset.marketType;
            document.querySelectorAll(".market-type-tab").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            document.getElementById("company-selector").classList.toggle("hidden", type !== 'stocks');
            document.getElementById("crypto-selector").classList.toggle("hidden", type !== 'crypto');
            changeCompany(type === 'stocks' ? 'ulanska' : 'nicorp');
        });
    });

    dom["buy-button"].addEventListener("click", () => trade(true));
    dom["sell-button"].addEventListener("click", () => trade(false));
    dom["buy-max-button"].addEventListener("click", () => {
        const price = market[currentCompanyId].price;
        if(price > 0) dom["amount-input"].value = Math.floor(portfolio.cash / price);
    });
    dom["sell-max-button"].addEventListener("click", () => {
        dom["amount-input"].value = portfolio.shares[currentCompanyId] || 0;
    });

    dom["rumor-form"].addEventListener("submit", onPostRumor);
    dom["pvp-create-form"].addEventListener("submit", onCreatePvP);

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            e.target.classList.add("active");
            document.getElementById(`tab-${e.target.dataset.tab}`).classList.add("active");
        });
    });
}

function initApp(uid) {
    // 1. Ceny
    onSnapshot(doc(db, "global", "ceny_akcji"), (snap) => {
        if(snap.exists()) {
            const prices = snap.data();
            COMPANY_ORDER.forEach(cid => {
                let dbKey = cid;
                if(cid === 'nicorp' && prices.bartcoin) dbKey = 'bartcoin';
                
                if(prices[dbKey]) {
                    market[cid].previousPrice = market[cid].price;
                    market[cid].price = prices[dbKey];
                    pushToHistory(cid, prices[dbKey]);
                }
            });
            updateUI();
        }
    }, (err) => console.log("Ticker error (safe to ignore if chart works):", err));

    // 2. Portfel
    onSnapshot(doc(db, "uzytkownicy", uid), (snap) => {
        if(snap.exists()) {
            const d = snap.data();
            portfolio.cash = d.cash;
            portfolio.startValue = d.startValue;
            portfolio.name = d.name;
            portfolio.prestigeLevel = d.prestigeLevel || 0;
            
            portfolio.shares = { ...d.shares };
            if(portfolio.shares.bartcoin && !portfolio.shares.nicorp) {
                portfolio.shares.nicorp = portfolio.shares.bartcoin;
            }
            updateUI();
        }
    });

    // 3. Feedy (Newsy, Plotki, Historia)
    listenToNews();
    listenToRumors();
    listenToHistory();
    listenToRanking();
    listenToBets(uid); // Zakłady
    initChart();
}

function startLocalSimulation() {
    setInterval(() => {
        COMPANY_ORDER.forEach(cid => {
            const currentPrice = market[cid].price;
            const fluctuation = currentPrice * (Math.random() * 0.002 - 0.001);
            const simulatedPrice = currentPrice + fluctuation;
            pushToHistory(cid, simulatedPrice);
        });
        if(chartInstance) updateChart();
    }, 5000);
}

function pushToHistory(cid, price) {
    const now = Date.now();
    market[cid].history.push({ x: now, y: [price, price, price, price] });
    if(market[cid].history.length > 50) market[cid].history.shift();
}

function initChart() {
    if(chartInstance) return;
    const options = {
        series: [{ data: [] }],
        chart: { 
            type: 'candlestick', 
            height: 400, // Wymuszona wysokość
            width: '100%',
            background: 'transparent', 
            toolbar: {show:false}, 
            animations: {enabled:false} 
        },
        theme: { mode: 'dark' },
        xaxis: { type: 'datetime', labels: {style: {colors: '#777'}} },
        yaxis: { labels: {style: {colors: '#777'}, formatter: v => v.toFixed(2)} },
        grid: { borderColor: '#333' },
        plotOptions: { candlestick: { colors: { upward: '#10b981', downward: '#ef4444' } } }
    };
    chartInstance = new ApexCharts(dom["chart-container"], options);
    chartInstance.render();
}

function updateChart() {
    if(!chartInstance) return;
    chartInstance.updateSeries([{ data: market[currentCompanyId].history }]);
}

function changeCompany(cid) {
    currentCompanyId = cid;
    dom["company-name"].textContent = market[cid].name;
    document.querySelectorAll(".company-tab").forEach(b => b.classList.toggle("active", b.dataset.company === cid));
    
    const isCrypto = ["nicorp", "igirium"].includes(cid);
    const locked = isCrypto && portfolio.prestigeLevel < 3;
    document.getElementById("order-panel").classList.toggle("crypto-locked", locked);
    
    updateUI();
    updateChart();
}

function updateUI() {
    dom["stock-price"].textContent = formatCurrency(market[currentCompanyId].price);
    
    let totalSharesVal = 0;
    let sharesHtml = "";
    COMPANY_ORDER.forEach(cid => {
        const amt = portfolio.shares[cid] || 0;
        if(amt > 0) {
            const val = amt * market[cid].price;
            totalSharesVal += val;
            sharesHtml += `<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px dashed #333">
                <span>${market[cid].name}</span> <strong>${amt} szt.</strong>
            </div>`;
        }
    });
    
    dom["shares-list"].innerHTML = sharesHtml || "<p>Portfel pusty</p>";
    
    const totalVal = portfolio.cash + totalSharesVal;
    const profit = totalVal - portfolio.startValue;
    
    dom["cash-display"].textContent = formatCurrency(portfolio.cash);
    dom["value-display"].textContent = formatCurrency(totalVal);
    dom["profit-display"].textContent = formatCurrency(profit);
    dom["profit-display"].style.color = profit >= 0 ? "var(--green)" : "var(--red)";
    
    if(dom["username"]) dom["username"].innerHTML = `${portfolio.name} ${'⭐️'.repeat(portfolio.prestigeLevel)}`;
    
    // TICKER (Poprawiony)
    let tickerHtml = "";
    COMPANY_ORDER.forEach(cid => {
        const p = market[cid].price;
        const prev = market[cid].previousPrice || p;
        const diff = prev > 0 ? ((p - prev) / prev) * 100 : 0;
        const cls = diff >= 0 ? 'ticker-up' : 'ticker-down';
        tickerHtml += `<span class="ticker-item">${market[cid].name} <strong>${p.toFixed(2)}</strong> <span class="${cls}">(${diff.toFixed(2)}%)</span></span>`;
    });
    dom["ticker-content"].innerHTML = tickerHtml;
}

// --- STARA RULETKA LOGIKA ---
let isSpinning = false;
window.selectBetType = function(type, value) {
    if(isSpinning) return;
    document.querySelectorAll(".casino-btn").forEach(b => b.classList.remove("selected"));
    if(type === 'color') {
        document.querySelector(`.btn-${value}`)?.classList.add("selected");
        dom["casino-status"].textContent = `Wybrano: ${value}`;
    }
    window.currentBet = { type, value };
};

window.commitSpin = async function() {
    if(isSpinning) return;
    if(!window.currentBet) return alert("Wybierz na co stawiasz!");
    const amount = parseInt(dom["casino-amount"].value);
    if(isNaN(amount) || amount <= 0 || amount > portfolio.cash) return alert("Brak środków!");

    isSpinning = true;
    dom["spin-button"].disabled = true;
    dom["casino-status"].textContent = "Kręcimy...";

    const innerRing = document.querySelector('.inner');
    const dataContainer = document.querySelector('.data');
    const resultNumberEl = document.querySelector('.result-number');
    const resultColorEl = document.querySelector('.result-color');
    const resultBg = document.querySelector('.result');

    innerRing.removeAttribute('data-spinto');
    innerRing.classList.remove('rest');
    dataContainer.classList.remove('reveal');

    const winningNumber = Math.floor(Math.random() * 37);
    
    setTimeout(() => {
        innerRing.setAttribute('data-spinto', winningNumber);
    }, 50);

    setTimeout(async () => {
        innerRing.classList.add('rest');
        
        const redNumbers = [32, 19, 21, 25, 34, 27, 36, 30, 23, 5, 16, 1, 14, 9, 18, 7, 12, 3];
        let resultColor = winningNumber === 0 ? 'green' : (redNumbers.includes(winningNumber) ? 'red' : 'black');
        
        resultNumberEl.textContent = winningNumber;
        resultColorEl.textContent = resultColor.toUpperCase();
        resultBg.style.backgroundColor = resultColor === 'red' ? 'var(--red)' : (resultColor === 'green' ? 'var(--green)' : '#111');
        dataContainer.classList.add('reveal');

        let winMultiplier = 0;
        if(window.currentBet.type === 'color' && window.currentBet.value === resultColor) {
            winMultiplier = resultColor === 'green' ? 36 : 2;
        }

        try {
            await runTransaction(db, async (t) => {
                const ref = doc(db, "uzytkownicy", currentUserId);
                const d = (await t.get(ref)).data();
                let newCash = d.cash - amount;
                if(winMultiplier > 0) newCash += amount * winMultiplier;
                t.update(ref, { cash: newCash });
            });
            dom["casino-status"].innerHTML = winMultiplier > 0 
                ? `<span style="color:var(--green)">WYGRANA! +${amount*winMultiplier}</span>` 
                : `<span style="color:var(--red)">Wynik: ${winningNumber}. Przegrana.</span>`;
        } catch(e) { console.error(e); }

        isSpinning = false;
        dom["spin-button"].disabled = false;
    }, 6000);
};

// --- LISTENERS ---
function listenToNews() {
    onSnapshot(query(collection(db, "gielda_news"), orderBy("timestamp", "desc"), limit(5)), (snap) => {
        if(dom["news-feed"]) {
            dom["news-feed"].innerHTML = "";
            snap.forEach(d => {
                const n = d.data();
                const color = n.impactType === 'positive' ? 'var(--green)' : 'var(--red)';
                dom["news-feed"].innerHTML += `<p style="color:${color}"><strong>NEWS:</strong> ${n.text}</p>`;
            });
        }
    });
}

function listenToRumors() {
    onSnapshot(query(collection(db, "plotki"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        if(dom["rumors-feed"]) {
            dom["rumors-feed"].innerHTML = "";
            snap.forEach(d => {
                const r = d.data();
                dom["rumors-feed"].innerHTML += `<p>${r.text} <small style="color:#777">- ${r.authorName}</small></p>`;
            });
        }
    });
}

function listenToHistory() {
    onSnapshot(query(collection(db, "historia_transakcji"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        let globalH = ""; let myH = "";
        snap.forEach(d => {
            const h = d.data();
            // STYL HISTORII
            const actionClass = h.type.includes("KUPNO") ? "h-action-buy" : "h-action-sell";
            const el = `<p><span class="${actionClass}">${h.type}</span> ${h.companyName} - <strong>${h.userName}</strong> (${formatCurrency(h.totalValue)})</p>`;
            globalH += el;
            if(h.userId === currentUserId) myH += el;
        });
        dom["global-history-feed"].innerHTML = globalH;
        dom["personal-history-feed"].innerHTML = myH || "<p>Brak twoich transakcji</p>";
    });
}

function listenToRanking() {
    onSnapshot(query(collection(db, "uzytkownicy"), orderBy("totalValue", "desc"), limit(10)), (snap) => {
        let html = ""; let i = 1;
        snap.forEach(d => {
            const u = d.data();
            html += `<li><span>${i}. ${u.name}</span> <strong>${formatCurrency(u.totalValue)}</strong></li>`;
            i++;
        });
        dom["leaderboard-list"].innerHTML = html;
    });
}

function listenToBets(uid) {
    // Nasłuch aktywnych zakładów
    if(dom["active-bets-feed"]) {
        onSnapshot(query(collection(db, "active_bets"), where("userId", "==", uid), limit(5)), (snap) => {
            dom["active-bets-feed"].innerHTML = "";
            if(snap.empty) dom["active-bets-feed"].innerHTML = "<p>Brak zakładów</p>";
            snap.forEach(d => {
                const b = d.data();
                dom["active-bets-feed"].innerHTML += `<p>${b.betOn} - ${formatCurrency(b.betAmount)} (${b.status})</p>`;
            });
        });
    }
    
    // Nasłuch meczów (Globalny) - Naprawa ładowania
    onSnapshot(doc(db, "global", "zaklady"), (docSnap) => {
        const info = document.getElementById("match-info");
        if(docSnap.exists() && info) {
            const matches = docSnap.data().mecze || [];
            if(matches.length > 0) {
                const m = matches[0]; // Pokaż pierwszy
                info.innerHTML = `<p><strong>${m.teamA}</strong> vs <strong>${m.teamB}</strong></p>`;
            } else {
                info.innerHTML = "<p>Brak meczów dzisiaj.</p>";
            }
        }
    });
}

// Utils & Actions
async function trade(isBuy) {
    const amt = parseInt(dom["amount-input"].value);
    if(isNaN(amt) || amt <= 0) return alert("Podaj ilość");
    const price = market[currentCompanyId].price;
    const cost = amt * price;

    try {
        await runTransaction(db, async (t) => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            let shares = d.shares || {};
            if(shares.bartcoin && !shares.nicorp) { shares.nicorp = shares.bartcoin; delete shares.bartcoin; }

            if(isBuy) {
                if(d.cash < cost) throw new Error("Brak środków");
                shares[currentCompanyId] = (shares[currentCompanyId] || 0) + amt;
                t.update(ref, { cash: d.cash - cost, shares: shares });
            } else {
                if((shares[currentCompanyId]||0) < amt) throw new Error("Brak akcji");
                shares[currentCompanyId] -= amt;
                t.update(ref, { cash: d.cash + cost, shares: shares });
            }
            const histRef = doc(collection(db, "historia_transakcji"));
            t.set(histRef, {
                userId: currentUserId, userName: portfolio.name,
                type: isBuy ? "KUPNO" : "SPRZEDAŻ",
                companyName: market[currentCompanyId].name,
                amount: amt, totalValue: cost, timestamp: serverTimestamp()
            });
        });
        dom["amount-input"].value = "";
    } catch(e) { alert(e.message); }
}

async function onCreatePvP(e) {
    e.preventDefault();
    const amount = parseInt(dom["pvp-amount"].value);
    if(isNaN(amount) || amount < 1000) return alert("Min. 1000 zł");
    if(amount > portfolio.cash) return alert("Brak środków");

    try {
        await runTransaction(db, async (t) => {
            const ref = doc(db, "uzytkownicy", currentUserId);
            const d = (await t.get(ref)).data();
            if(d.cash < amount) throw new Error("Brak kasy");
            t.update(ref, { cash: d.cash - amount });
            const duelRef = doc(collection(db, "pvp_duels"));
            t.set(duelRef, {
                creatorId: currentUserId, creatorName: portfolio.name,
                amount: amount, status: "open", createdAt: serverTimestamp()
            });
        });
        dom["pvp-amount"].value = "";
    } catch(e) { alert(e.message); }
}

async function onPostRumor(e) {
    e.preventDefault();
    const txt = dom["rumor-input"].value;
    const cid = document.getElementById("rumor-company-select").value;
    const sent = document.querySelector('input[name="sentiment"]:checked').value;
    await addDoc(collection(db, "plotki"), {
        text: txt, authorId: currentUserId, authorName: portfolio.name,
        companyId: cid, sentiment: sent, impact: 0.05, timestamp: serverTimestamp()
    });
    dom["rumor-input"].value = "";
}

function formatCurrency(val) { return new Intl.NumberFormat('pl-PL', {style:'currency', currency:'PLN'}).format(val); }
async function onLogin(e) { e.preventDefault(); const email = document.getElementById("login-email").value; const pass = document.getElementById("login-password").value; try { await signInWithEmailAndPassword(auth, email, pass); } catch(e){alert(e.message);} }
async function onRegister(e) { e.preventDefault(); const name = document.getElementById("register-name").value; const email = document.getElementById("register-email").value; const pass = document.getElementById("register-password").value; try { const c = await createUserWithEmailAndPassword(auth, email, pass); await setDoc(doc(db, "uzytkownicy", c.user.uid), { name, email, cash: 1000, shares: {}, startValue: 1000, totalValue: 1000 }); } catch(e){alert(e.message);} }
