// --- IMPORTY FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, updateDoc, 
    collection, addDoc, query, orderBy, limit, serverTimestamp, 
    runTransaction, increment 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// --- KONFIGURACJA ---
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
let currentUserId = null;
let currentCompanyId = "ulanska";
let chartInstance = null;
let marketType = "stocks";

// Struktura rynku (pamięć lokalna)
let market = {
    ulanska: { name: "Ułańska Dev", price: 100, history: [] },
    rychbud: { name: "RychBud", price: 50, history: [] },
    brzozair: { name: "BrzozAir", price: 200, history: [] },
    cosmosanit: { name: "Cosmosanit", price: 300, history: [] },
    nicorp: { name: "NiCorp", price: 1000, history: [] },
    igirium: { name: "Igirium", price: 500, history: [] }
};

const COMPANY_ORDER = ["ulanska", "rychbud", "brzozair", "cosmosanit", "nicorp", "igirium"];

let portfolio = {
    name: "Gracz", cash: 0, startValue: 1000,
    shares: { ulanska: 0, rychbud: 0, brzozair: 0, cosmosanit: 0, nicorp: 0, igirium: 0 },
    prestigeLevel: 0
};

// --- ELEMENTY DOM (Cache) ---
const dom = {};

document.addEventListener("DOMContentLoaded", () => {
    cacheDOM();
    bindEvents();
    
    // Auth Listener
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

    // Start symulacji lokalnej (dla płynności wykresów)
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
    ids.forEach(id => dom[id] = document.getElementById(id));
}

function bindEvents() {
    // Auth
    dom["login-form"].addEventListener("submit", onLogin);
    dom["register-form"].addEventListener("submit", onRegister);
    dom["logout-button"].addEventListener("click", () => signOut(auth));
    dom["show-register-link"].addEventListener("click", (e) => { e.preventDefault(); document.getElementById("auth-container").classList.add("show-register"); });
    dom["show-login-link"].addEventListener("click", (e) => { e.preventDefault(); document.getElementById("auth-container").classList.remove("show-register"); });

    // Nawigacja
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".view-section").forEach(v => v.classList.remove("active"));
            e.target.classList.add("active");
            document.getElementById(`view-${e.target.dataset.view}`).classList.add("active");
            if(e.target.dataset.view === 'market' && chartInstance) chartInstance.render();
        });
    });

    // Wybór spółki
    document.querySelectorAll(".company-tab").forEach(btn => {
        btn.addEventListener("click", (e) => changeCompany(e.target.dataset.company));
    });

    // Typ Rynku (Akcje/Krypto)
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

    // Handel
    dom["buy-button"].addEventListener("click", () => trade(true));
    dom["sell-button"].addEventListener("click", () => trade(false));
    dom["buy-max-button"].addEventListener("click", () => {
        const price = market[currentCompanyId].price;
        if(price > 0) dom["amount-input"].value = Math.floor(portfolio.cash / price);
    });
    dom["sell-max-button"].addEventListener("click", () => {
        dom["amount-input"].value = portfolio.shares[currentCompanyId] || 0;
    });

    // Plotki
    dom["rumor-form"].addEventListener("submit", onPostRumor);
    
    // PvP
    dom["pvp-create-form"].addEventListener("submit", onCreatePvP);

    // Zakładki Historii
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
    // 1. Nasłuch Cen (Globalny)
    onSnapshot(doc(db, "global", "ceny_akcji"), (snap) => {
        if(snap.exists()) {
            const prices = snap.data();
            COMPANY_ORDER.forEach(cid => {
                // Obsługa migracji bartcoin -> nicorp
                let dbKey = cid;
                if(cid === 'nicorp' && prices.bartcoin) dbKey = 'bartcoin';
                
                if(prices[dbKey]) {
                    market[cid].price = prices[dbKey];
                    // Dodaj prawdziwy punkt danych do historii
                    pushToHistory(cid, prices[dbKey]);
                }
            });
            updateUI();
        }
    }, (error) => console.log("Błąd nasłuchu cen (ignoruj):", error));

    // 2. Nasłuch Portfela
    onSnapshot(doc(db, "uzytkownicy", uid), (snap) => {
        if(snap.exists()) {
            const d = snap.data();
            portfolio.cash = d.cash;
            portfolio.startValue = d.startValue;
            portfolio.name = d.name;
            portfolio.prestigeLevel = d.prestigeLevel || 0;
            
            // Migracja Shares
            portfolio.shares = { ...d.shares };
            if(portfolio.shares.bartcoin && !portfolio.shares.nicorp) {
                portfolio.shares.nicorp = portfolio.shares.bartcoin;
            }
            updateUI();
        }
    });

    // 3. Nasłuch PvP
    onSnapshot(query(collection(db, "pvp_duels"), orderBy("createdAt", "desc"), limit(10)), (snap) => {
        dom["pvp-feed"].innerHTML = "";
        if(snap.empty) dom["pvp-feed"].innerHTML = "<p>Brak wyzwań.</p>";
        snap.forEach(d => {
            const p = d.data();
            if(p.status === 'open') {
                const btn = p.creatorId === uid 
                    ? `<button disabled style="background:#444">Twoje</button>` 
                    : `<button onclick="window.joinPvP('${d.id}', ${p.amount}, '${p.creatorName}')" style="background:var(--green)">WALCZ</button>`;
                
                dom["pvp-feed"].innerHTML += `
                    <div style="background:#222; padding:10px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                        <span><strong>${p.creatorName}</strong>: ${formatCurrency(p.amount)}</span>
                        ${btn}
                    </div>
                `;
            }
        });
    });
    
    // Inicjalizacja wykresu
    initChart();
    // Feedy (Ranking, Historia - uproszczone dla przykładu)
    listenToRanking();
    listenToHistory();
}

// --- LOGIKA GIEŁDY I WYKRESÓW ---

function startLocalSimulation() {
    // Co 5 sekund dodajemy "sztuczny" punkt, jeśli serwer milczy
    // To sprawia, że wykres zawsze żyje
    setInterval(() => {
        COMPANY_ORDER.forEach(cid => {
            const currentPrice = market[cid].price;
            // Bardzo mała zmiana +/- 0.1% dla wizualizacji
            const fluctuation = currentPrice * (Math.random() * 0.002 - 0.001);
            const simulatedPrice = currentPrice + fluctuation;
            pushToHistory(cid, simulatedPrice);
        });
        // Odśwież wykres
        if(chartInstance) updateChart();
    }, 5000);
}

function pushToHistory(cid, price) {
    const now = Date.now();
    market[cid].history.push({ x: now, y: [price, price, price, price] });
    // Trzymaj tylko ostatnie 50 punktów
    if(market[cid].history.length > 50) market[cid].history.shift();
}

function initChart() {
    if(chartInstance) return;
    const options = {
        series: [{ data: [] }],
        chart: { type: 'candlestick', height: 350, background: 'transparent', toolbar: {show:false}, animations: {enabled:false} },
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
    chartInstance.updateSeries([{
        data: market[currentCompanyId].history
    }]);
}

function changeCompany(cid) {
    currentCompanyId = cid;
    dom["company-name"].textContent = market[cid].name;
    document.querySelectorAll(".company-tab").forEach(b => b.classList.toggle("active", b.dataset.company === cid));
    
    // Blokada krypto
    const isCrypto = ["nicorp", "igirium"].includes(cid);
    const locked = isCrypto && portfolio.prestigeLevel < 3;
    document.getElementById("order-panel").classList.toggle("crypto-locked", locked);
    
    updateUI();
    updateChart();
}

function updateUI() {
    // 1. Cena
    dom["stock-price"].textContent = formatCurrency(market[currentCompanyId].price);
    
    // 2. Portfel
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
    
    // Ticker
    let tickerHtml = "";
    COMPANY_ORDER.forEach(cid => {
        tickerHtml += `<span class="ticker-item">${market[cid].name} <strong>${market[cid].price.toFixed(2)}</strong></span>`;
    });
    dom["ticker-content"].innerHTML = tickerHtml;
}

// --- RULETKA (CSS + JS) ---
let isSpinning = false;
window.selectBetType = function(type, value) {
    if(isSpinning) return;
    document.querySelectorAll(".casino-btn").forEach(b => b.classList.remove("selected"));
    // Logika zaznaczania
    if(type === 'color') {
        const btn = document.querySelector(`.btn-${value}`);
        if(btn) btn.classList.add("selected");
        dom["casino-status"].textContent = `Wybrano: ${value}`;
    }
    window.currentBet = { type, value };
};

window.commitSpin = async function() {
    if(isSpinning) return;
    if(!window.currentBet) return alert("Wybierz na co stawiasz!");
    const amount = parseInt(dom["casino-amount"].value);
    if(isNaN(amount) || amount <= 0 || amount > portfolio.cash) return alert("Błędna stawka!");

    isSpinning = true;
    dom["spin-button"].disabled = true;
    dom["casino-status"].textContent = "Kręcimy...";

    // Animacja
    const wheel = document.querySelector(".wheel-inner");
    const ballTrack = document.querySelector(".ball-track");
    wheel.style.transition = "transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)"; // Reset stylu
    
    // Losowanie (0-36)
    const result = Math.floor(Math.random() * 37);
    
    // Kąt obrotu (wiele obrotów + kąt wyniku)
    // Kąt dla liczby = (360 / 37) * index. 
    // Dla uproszczenia animacji, obracamy o losową wartość + dużo obrotów
    const rotation = 1440 + Math.random() * 360; 
    
    wheel.style.transform = `rotate(-${rotation}deg)`;
    ballTrack.style.transform = `rotate(${rotation}deg)`; // Piłka w drugą stronę

    // Czekamy na koniec animacji
    setTimeout(async () => {
        isSpinning = false;
        dom["spin-button"].disabled = false;
        
        // Logika wyniku (Uproszczona: Czerwone/Czarne/Zero)
        const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        let color = result === 0 ? 'green' : (reds.includes(result) ? 'red' : 'black');
        
        let winMultiplier = 0;
        if(window.currentBet.type === 'color' && window.currentBet.value === color) {
            winMultiplier = color === 'green' ? 36 : 2;
        }

        // Transakcja
        try {
            await runTransaction(db, async (t) => {
                const ref = doc(db, "uzytkownicy", currentUserId);
                const d = (await t.get(ref)).data();
                if(d.cash < amount) throw new Error("Brak środków");
                let newCash = d.cash - amount;
                if(winMultiplier > 0) newCash += amount * winMultiplier;
                t.update(ref, { cash: newCash });
            });
            dom["casino-status"].innerHTML = winMultiplier > 0 
                ? `<span style="color:var(--green)">WYGRANA! +${amount*winMultiplier}</span>` 
                : `<span style="color:var(--red)">Wynik: ${result} (${color}). Przegrana.</span>`;
        } catch(e) {
            console.error(e);
        }
        
        // Reset animacji (cichy)
        setTimeout(() => {
            wheel.style.transition = "none";
            wheel.style.transform = "rotate(0deg)";
            ballTrack.style.transform = "rotate(0deg)";
        }, 1000);

    }, 4000);
};

// --- PVP LOGIC ---
async function onCreatePvP(e) {
    e.preventDefault(); // ZAPOBIEGA ODŚWIEŻANIU STRONY
    const amount = parseInt(dom["pvp-amount"].value);
    
    if(isNaN(amount) || amount < 1000) return alert("Min. 1000 zł");
    if(amount > portfolio.cash) return alert("Brak środków");

    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "uzytkownicy", currentUserId);
            const userDoc = await t.get(userRef);
            if(userDoc.data().cash < amount) throw new Error("Brak kasy");
            
            t.update(userRef, { cash: userDoc.data().cash - amount });
            const duelRef = doc(collection(db, "pvp_duels"));
            t.set(duelRef, {
                creatorId: currentUserId,
                creatorName: portfolio.name,
                amount: amount,
                status: "open",
                createdAt: serverTimestamp()
            });
        });
        dom["pvp-amount"].value = "";
    } catch(e) {
        alert("Błąd: " + e.message);
    }
}

window.joinPvP = async function(duelId, amount, opponentName) {
    if(!confirm(`Walczyć z ${opponentName} o ${amount} zł?`)) return;
    if(portfolio.cash < amount) return alert("Brak środków");

    try {
        await runTransaction(db, async (t) => {
            const duelRef = doc(db, "pvp_duels", duelId);
            const joinerRef = doc(db, "uzytkownicy", currentUserId);
            const duelDoc = await t.get(duelRef);
            
            if(!duelDoc.exists() || duelDoc.data().status !== 'open') throw new Error("Mecz nieaktualny");
            
            // Losowanie
            const creatorId = duelDoc.data().creatorId;
            const creatorRef = doc(db, "uzytkownicy", creatorId);
            const creatorWins = Math.random() > 0.5;
            const pot = amount * 2;

            // Pobieramy wpisowe od dołączającego
            t.update(joinerRef, { cash: increment(-amount) });
            
            // Wypłata dla zwycięzcy
            if(creatorWins) {
                t.update(creatorRef, { cash: increment(pot) });
            } else {
                t.update(joinerRef, { cash: increment(pot) });
            }
            
            t.update(duelRef, { status: "closed", winner: creatorWins ? creatorId : currentUserId });
        });
        alert("Walka zakończona! Sprawdź stan konta.");
    } catch(e) {
        alert(e.message);
    }
};

// --- HANDEL ---
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
            // Fix legacy names
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
            // Zapisz historię
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

// --- POZOSTAŁE FUNKCJE (Plotki, Auth) ---
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

function listenToHistory() {
    onSnapshot(query(collection(db, "historia_transakcji"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        let globalH = ""; let myH = "";
        snap.forEach(d => {
            const h = d.data();
            const el = `<p><strong>${h.userName}</strong>: ${h.type} ${h.companyName} (${formatCurrency(h.totalValue)})</p>`;
            globalH += el;
            if(h.userId === currentUserId) myH += el;
        });
        dom["global-history-feed"].innerHTML = globalH;
        dom["personal-history-feed"].innerHTML = myH || "<p>Brak twoich transakcji</p>";
    });
}

// Utils
function formatCurrency(val) { return new Intl.NumberFormat('pl-PL', {style:'currency', currency:'PLN'}).format(val); }
async function onLogin(e) { e.preventDefault(); const email = document.getElementById("login-email").value; const pass = document.getElementById("login-password").value; try { await signInWithEmailAndPassword(auth, email, pass); } catch(e){alert(e.message);} }
async function onRegister(e) { e.preventDefault(); const name = document.getElementById("register-name").value; const email = document.getElementById("register-email").value; const pass = document.getElementById("register-password").value; try { const c = await createUserWithEmailAndPassword(auth, email, pass); await setDoc(doc(db, "uzytkownicy", c.user.uid), { name, email, cash: 1000, shares: {}, startValue: 1000, totalValue: 1000 }); } catch(e){alert(e.message);} }
