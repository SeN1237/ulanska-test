// Plik: ticker_script/index.js 
// WERSJA FINALNA: Giełda + Krypto + Zakłady (Lista z Auto-Zamykaniem)

const admin = require('firebase-admin');

// --- POBIERANIE KLUCZA Z ZMIENNYCH ŚRODOWISKOWYCH ---
const serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// --- BAZA NEWSÓW ---
const positiveNews = [
    "NEWS: {COMPANY} ogłasza rekordowe zyski kwartalne! Analitycy w szoku!",
    "NEWS: Zysk netto {COMPANY} wzrósł o 300% rok do roku.",
    "NEWS: Fundusz hedgingowy zainwestował w {COMPANY}.",
    "NEWS: {COMPANY} wprowadza rewolucyjny produkt na rynek.",
    "NEWS: Agencja ratingowa podnosi ocenę {COMPANY} do 'AAA'.",
    "NEWS: {COMPANY} podpisuje strategiczny kontrakt rządowy.",
    "NEWS: Nowy CEO {COMPANY} zapowiada agresywną ekspansję.",
    "NEWS: {COMPANY} przejmuje mniejszego konkurenta.",
    "NEWS: Przełom technologiczny w laboratoriach {COMPANY}.",
    "NEWS: {COMPANY} ogłasza skup akcji własnych (buyback).",
    "NEWS: {COMPANY} wchodzi na rynek azjatycki z sukcesem.",
    "NEWS: Rządowe dotacje dla {COMPANY} zatwierdzone."
];

const negativeNews = [
    "NEWS: SKANDAL w {COMPANY}! Prezes oskarżony o malwersacje.",
    "NEWS: {COMPANY} ogłasza straty znacznie większe od prognoz.",
    "NEWS: Awaria głównej linii produkcyjnej {COMPANY}.",
    "NEWS: {COMPANY} traci kluczowego klienta na rzecz konkurencji.",
    "NEWS: Pozew zbiorowy przeciwko {COMPANY} w sprawie wadliwego produktu.",
    "NEWS: Agencja ratingowa obniża rating {COMPANY} do poziomu śmieciowego.",
    "NEWS: Wyciek danych klientów z serwerów {COMPANY}.",
    "NEWS: {COMPANY} zwalnia 20% załogi w ramach cięcia kosztów.",
    "NEWS: Nowe regulacje prawne uderzają w model biznesowy {COMPANY}.",
    "NEWS: Analitycy wydają rekomendację 'SPRZEDAJ' dla {COMPANY}.",
    "NEWS: {COMPANY} wstrzymuje wypłatę dywidendy.",
    "NEWS: Protesty pracowników {COMPANY} paraliżują działanie firmy."
];

try {
  // --- INICJALIZACJA FIREBASE ---
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey),
    databaseURL: 'https.symulator-gielda.firebaseio.com' 
  });

  const db = admin.firestore();
  
  // --- REFERENCJE ---
  const cenyDocRef = db.doc("global/ceny_akcji");
  const newsCollectionRef = db.collection("gielda_news");
  const rumorsRef = db.collection("plotki");
  const limitOrdersRef = db.collection("limit_orders");
  const usersRef = db.collection("uzytkownicy");
  const historyRef = db.collection("historia_transakcji");
  const pendingTipsRef = db.collection("pending_tips");
  const activeBondsRef = db.collection("active_bonds");
  
  // --- HELPERY ---
  function calculateTotalValue(cash, shares, currentPrices) {
    let sharesValue = 0;
    for (const companyId in shares) {
        if (currentPrices[companyId]) {
            sharesValue += (shares[companyId] || 0) * currentPrices[companyId];
        }
    }
    return cash + sharesValue;
  }
  
  // ==========================================================
  // === 1. OBSŁUGA ZLECEŃ LIMIT (LIMIT ORDERS) ===
  // ==========================================================
  async function executeLimitOrder(transaction, orderDoc, executedPrice, currentPrices) {
      const order = orderDoc.data();
      const orderId = orderDoc.id;
      
      const { userId, companyId, amount, limitPrice, type, companyName } = order;
      const isCrypto = type.includes("Krypto");
      
      const userRef = usersRef.doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
          transaction.update(orderDoc.ref, { status: "cancelled", failureReason: "User not found" });
          return;
      }

      const userData = userDoc.data();
      
      if (isCrypto && (userData.prestigeLevel || 0) < 3) {
          transaction.update(orderDoc.ref, { status: "cancelled", failureReason: "Insufficient prestige" });
          return;
      }
      
      const newShares = { ...userData.shares };
      let newCash = userData.cash;
      const costOrRevenue = amount * executedPrice; 

      if (type.startsWith('KUPNO')) {
          if (newCash < costOrRevenue) {
              transaction.update(orderDoc.ref, { status: "cancelled", failureReason: "Insufficient funds" });
              return;
          }
          newCash -= costOrRevenue;
          newShares[companyId] = (newShares[companyId] || 0) + amount;
          
      } else if (type.startsWith('SPRZEDAŻ')) {
          if (!newShares[companyId] || newShares[companyId] < amount) {
              transaction.update(orderDoc.ref, { status: "cancelled", failureReason: "Insufficient shares" });
              return;
          }
          newCash += costOrRevenue;
          newShares[companyId] -= amount;
      }
      
      const newTotalValue = calculateTotalValue(newCash, newShares, currentPrices);
      const newZysk = newTotalValue - userData.startValue;

      transaction.update(userRef, { 
          cash: newCash, 
          shares: newShares, 
          totalValue: newTotalValue, 
          zysk: newZysk,
          'stats.totalTrades': admin.firestore.FieldValue.increment(1)
      });

      transaction.update(orderDoc.ref, { 
          status: "executed", 
          executedPrice: executedPrice 
      });

      const historyDocRef = historyRef.doc(); 
      transaction.set(historyDocRef, {
          userId: userId,
          userName: userData.name, 
          prestigeLevel: userData.prestigeLevel || 0, 
          type: type,
          companyId: companyId,
          companyName: companyName,
          amount: amount,
          pricePerShare: executedPrice, 
          totalValue: costOrRevenue, 
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: "executed"
      });
      
      console.log(`Zrealizowano zlecenie ${orderId} dla ${userData.name}`);
  }
  
  // ==========================================================
  // === 2. OBSŁUGA OBLIGACJI (BONDS) ===
  // ==========================================================
  async function processBonds(currentPrices) {
      const now = admin.firestore.Timestamp.now();
      const bondsQuery = activeBondsRef.where("status", "==", "pending").where("redeemAt", "<=", now);
      const bondsSnapshot = await bondsQuery.get();
      
      if (bondsSnapshot.empty) return;
      
      for (const bondDoc of bondsSnapshot.docs) {
          const bond = bondDoc.data();
          try {
              await db.runTransaction(async (transaction) => {
                  const userRef = usersRef.doc(bond.userId);
                  const userDoc = await transaction.get(userRef);
                  if (!userDoc.exists) return;
                  
                  const userData = userDoc.data();
                  const payout = bond.investment + bond.profit;
                  const newCash = userData.cash + payout;
                  const newTotalValue = calculateTotalValue(newCash, userData.shares, currentPrices);
                  const newZysk = newTotalValue - userData.startValue;

                  transaction.update(userRef, { cash: newCash, totalValue: newTotalValue, zysk: newZysk });
                  transaction.update(bondDoc.ref, { status: "executed" });
                  
                  const historyDocRef = historyRef.doc();
                  transaction.set(historyDocRef, {
                      userId: bond.userId,
                      userName: userData.name, 
                      prestigeLevel: userData.prestigeLevel || 0, 
                      type: "OBLIGACJA (WYKUP)", 
                      companyId: "system",
                      companyName: bond.name,
                      amount: 1,
                      pricePerShare: 0,
                      executedPrice: payout, 
                      totalValue: bond.profit,
                      timestamp: admin.firestore.FieldValue.serverTimestamp(),
                      status: "executed"
                  });
              });
          } catch (e) { console.error("Błąd obligacji:", e); }
      }
  }

  // ==========================================================
  // === 3. NOWA FUNKCJA: ZARZĄDZANIE ZAKŁADAMI (MATCHES) ===
  // ==========================================================
  async function manageMatches(db) {
    const zakladyRef = db.doc("global/zaklady");
    const docSnap = await zakladyRef.get();
    
    if (!docSnap.exists) return;

    let matches = docSnap.data().mecze || [];
    const now = admin.firestore.Timestamp.now();
    let infoChanged = false;

    for (let match of matches) {
        // 1. AUTOMATYCZNE ZAMYKANIE (Time limit)
        // Jeśli status jest 'open', a minął czas zamknięcia -> zamknij
        if (match.status === "open" && now >= match.closeTime) {
            match.status = "closed";
            console.log(`🔒 ZAMYKAM ZAKŁADY: ${match.teamA} vs ${match.teamB}`);
            infoChanged = true;
        }

        // 2. AUTOMATYCZNE WYPŁACANIE (Gdy Admin ustawi status 'resolved')
        // Sprawdzamy flagę 'processed', żeby nie wypłacić dwa razy
        if (match.status === "resolved" && match.processed !== true) {
            console.log(`💰 ROZLICZAM MECZ: ${match.teamA} vs ${match.teamB} (Wygrał: ${match.winner})`);
            await processBetsForMatch(db, match);
            match.processed = true; 
            infoChanged = true;
        }
    }

    if (infoChanged) {
        await zakladyRef.update({ mecze: matches });
        console.log("✅ Zaktualizowano statusy meczów w bazie.");
    }
  }

  async function processBetsForMatch(db, matchData) {
    const activeBetsRef = db.collection("active_bets");
    // Szukamy zakładów tylko na ten konkretny mecz
    const betsQuery = activeBetsRef
        .where("matchId", "==", matchData.id)
        .where("status", "==", "pending");

    const betsSnapshot = await betsQuery.get();
    if (betsSnapshot.empty) return;

    const batch = db.batch();
    let count = 0;

    betsSnapshot.forEach(betDoc => {
        const bet = betDoc.data();
        
        if (bet.betOn === matchData.winner) {
            // WYGRANA
            const payout = bet.betAmount * bet.odds;
            const profit = payout - bet.betAmount;
            const userRef = db.collection("uzytkownicy").doc(bet.userId);
            
            // Bezpieczna aktualizacja salda (increment)
            batch.update(userRef, {
                cash: admin.firestore.FieldValue.increment(payout),
                totalValue: admin.firestore.FieldValue.increment(payout),
                zysk: admin.firestore.FieldValue.increment(profit)
            });
            batch.update(betDoc.ref, { status: "won" });
        } else {
            // PRZEGRANA
            batch.update(betDoc.ref, { status: "lost" });
        }
        count++;
    });

    await batch.commit();
    console.log(`✅ Rozliczono ${count} zakładów.`);
  }
  
  // ==========================================================
  // === 4. GŁÓWNA PĘTLA TICKERA (RUN TICKER) ===
  // ==========================================================
  const runTicker = async () => {
    const docSnap = await cenyDocRef.get();
    if (!docSnap.exists) {
        console.error("Brak dokumentu cen!");
        return;
    }

    const currentPrices = docSnap.data();
    const newPrices = {};
    const now = admin.firestore.Timestamp.now();
    
    const stocks = ["ulanska", "brzozair", "rychbud", "cosmosanit"];
    const cryptos = ["bartcoin", "igirium"];
    const allAssets = [...stocks, ...cryptos];

    const companyReferencePrices = {
        ulanska: 1860.00, brzozair: 2350.00, rychbud: 870.00, cosmosanit: 2000.00,
        bartcoin: 4000.00, igirium: 2000.00
    };
    
    // Wpływ plotek
    const thirtySecondsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 1000);
    const rumorsSnapshot = await rumorsRef.where("timestamp", ">=", thirtySecondsAgo).get();
    const rumorImpacts = {};
    rumorsSnapshot.forEach(doc => {
        const rumor = doc.data();
        rumorImpacts[rumor.companyId] = (rumorImpacts[rumor.companyId] || 0) + rumor.impact;
    });

    // Wymuszone wskazówki (Tips)
    const forcedNews = {}; 
    const tipsSnapshot = await pendingTipsRef.where("executeAt", "<=", now).get();
    const deleteBatch = db.batch(); 
    tipsSnapshot.forEach(doc => {
        const tip = doc.data();
        forcedNews[tip.companyId] = { impactType: tip.impactType };
        deleteBatch.delete(doc.ref);
    });
    await deleteBatch.commit();

    // --- OBLICZANIE NOWYCH CEN ---
    for (const companyId of allAssets) {
      let price = currentPrices[companyId] || companyReferencePrices[companyId] || 50.00;
      
      // Większa zmienność dla krypto
      let volatility = cryptos.includes(companyId) ? 0.20 * price : 0.04 * price;
      let change = (Math.random() - 0.5) * 2 * volatility; 
      
      // Dodaj wpływ plotek
      if (rumorImpacts[companyId]) change += price * rumorImpacts[companyId];

      // Obsługa Newsów (Losowe lub Wymuszone)
      const forcedEvent = forcedNews[companyId];
      if (forcedEvent) {
          const isPositive = forcedEvent.impactType === 'positive';
          const impactPercent = (Math.random() * 0.20) + 0.05;
          change += (isPositive ? impactPercent : -impactPercent) * price;
          
          const newsList = isPositive ? positiveNews : negativeNews;
          const text = newsList[Math.floor(Math.random() * newsList.length)].replace("{COMPANY}", companyId.toUpperCase());
          await newsCollectionRef.add({ text, companyId, impactType: forcedEvent.impactType, timestamp: admin.firestore.FieldValue.serverTimestamp() });
      } else if (Math.random() < 0.07) { // 7% szans na losowy news
           const isPositive = Math.random() > 0.5;
           const impactPercent = (Math.random() * 0.20) + 0.05;
           change += (isPositive ? impactPercent : -impactPercent) * price;
           
           const newsList = isPositive ? positiveNews : negativeNews;
           const text = newsList[Math.floor(Math.random() * newsList.length)].replace("{COMPANY}", companyId.toUpperCase());
           await newsCollectionRef.add({ text, companyId, impactType: isPositive ? 'positive' : 'negative', timestamp: admin.firestore.FieldValue.serverTimestamp() });
      }

      let newPrice = price + change;

      // Odbicie od dna (Różne poziomy dla krypto i akcji)
      const refPrice = companyReferencePrices[companyId] || 50;
      const supportLevel = cryptos.includes(companyId) ? refPrice * 0.10 : refPrice * 0.40;
      const recoveryChance = cryptos.includes(companyId) ? 0.40 : 0.60;
      
      if (newPrice < supportLevel && newPrice > 1.00 && Math.random() < recoveryChance) {
          newPrice += newPrice * (cryptos.includes(companyId) ? 0.25 : 0.20);
      }
      
      newPrices[companyId] = parseFloat(Math.max(1.00, newPrice).toFixed(2));
    }

    // Zapis cen
    await cenyDocRef.set(newPrices, { merge: true });

    // --- WYWOŁANIE FUNKCJI ZAKŁADÓW ---
    await manageMatches(db);

    // --- WYWOŁANIE FUNKCJI OBLIGACJI ---
    await processBonds(newPrices);
    
    // --- REALIZACJA ZLECEŃ LIMIT ---
    for (const companyId of allAssets) {
        const finalPrice = newPrices[companyId];
        if (!finalPrice) continue;
        
        // Kupno Limit
        const buySnapshot = await limitOrdersRef
            .where("companyId", "==", companyId)
            .where("status", "==", "pending")
            .where("type", "in", ["KUPNO (Limit)", "KUPNO (Limit, Krypto)"])
            .where("limitPrice", ">=", finalPrice)
            .get();
        for (const doc of buySnapshot.docs) await db.runTransaction(t => executeLimitOrder(t, doc, finalPrice, newPrices));
        
        // Sprzedaż Limit
        const sellSnapshot = await limitOrdersRef
            .where("companyId", "==", companyId)
            .where("status", "==", "pending")
            .where("type", "in", ["SPRZEDAŻ (Limit)", "SPRZEDAŻ (Limit, Krypto)"])
            .where("limitPrice", "<=", finalPrice)
            .get();
        for (const doc of sellSnapshot.docs) await db.runTransaction(t => executeLimitOrder(t, doc, finalPrice, newPrices));
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Pętla 3-godzinna (dla GitHub Actions)
  const mainLoop = async () => {
    const updatesPerRun = 180;      
    const intervalSeconds = 60;     
    console.log(`Start pętli: ${updatesPerRun} cykli co ${intervalSeconds}s.`);
    for (let i = 1; i <= updatesPerRun; i++) {
      try { await runTicker(); } catch (e) { console.error("Błąd runTicker:", e); }
      if (i < updatesPerRun) await sleep(intervalSeconds * 1000);
    }
  };

  mainLoop();

} catch (e) {
  console.error("Init Error:", e);
  process.exit(1); 
}
