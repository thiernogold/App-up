(() => {
  "use strict";

  /* ---------------- STORAGE ---------------- */
  const STORE_KEYS = { products: "gl_products", sales: "gl_sales" };

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let products = load(STORE_KEYS.products, []);
  let sales = load(STORE_KEYS.sales, []);

  const persistProducts = () => save(STORE_KEYS.products, products);
  const persistSales = () => save(STORE_KEYS.sales, sales);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const money = (n) => Math.round(n).toLocaleString("fr-FR") + " FG";

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  /* ---------------- NAVIGATION (sidebar + bottom tabs share .nav-item) ---------------- */
  const views = document.querySelectorAll(".view");
  const navItems = document.querySelectorAll(".nav-item");
  const viewTitle = document.getElementById("viewTitle");
  const viewSubtitle = document.getElementById("viewSubtitle");

  const titles = {
    dashboard: ["Tableau de bord", "Vue d'ensemble de votre activité"],
    products: ["Produits", "Recherchez, vendez et gérez votre inventaire"],
    sales: ["Ventes", "Historique des ventes journalières et mensuelles"],
    benefits: ["Bénéfices", "Suivi des bénéfices réalisés par jour et par mois"],
  };

  function switchView(name) {
    views.forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    navItems.forEach(b => b.classList.toggle("active", b.dataset.view === name));
    viewTitle.textContent = titles[name][0];
    viewSubtitle.textContent = titles[name][1];
    if (name === "dashboard") renderDashboard();
    if (name === "products") renderProducts();
    if (name === "sales") renderSales();
    if (name === "benefits") renderBenefits();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  navItems.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  /* ---------------- CLOCK ---------------- */
  function tickClock() {
    const now = new Date();
    document.getElementById("clockDate").textContent =
      now.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    document.getElementById("clockTime").textContent =
      now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------------- TOASTS ---------------- */
  function toast(msg, isError = false) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------------- PRODUCTS: RENDER ---------------- */
  const productGrid = document.getElementById("productGrid");
  const productsEmpty = document.getElementById("productsEmpty");
  const searchInput = document.getElementById("searchInput");
  const LOW_STOCK_THRESHOLD = 5;
  let activeFilter = "all";

  document.querySelectorAll("#filterChips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll("#filterChips .chip").forEach(c => c.classList.toggle("active", c === chip));
      renderProducts();
    });
  });

  function renderProducts() {
    const query = searchInput.value.trim().toLowerCase();
    let filtered = products.filter(p => p.name.toLowerCase().includes(query));
    if (activeFilter === "low") filtered = filtered.filter(p => p.quantity > 0 && p.quantity <= LOW_STOCK_THRESHOLD);
    if (activeFilter === "out") filtered = filtered.filter(p => p.quantity <= 0);
    filtered.sort((a, b) => a.name.localeCompare(b.name, "fr"));

    productGrid.innerHTML = "";
    productsEmpty.hidden = products.length !== 0;

    filtered.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "product-card" + (p.quantity <= LOW_STOCK_THRESHOLD ? " low" : "");
      card.style.animationDelay = Math.min(i * 40, 400) + "ms";
      card.innerHTML = `
        <button class="edit-dot" data-edit="${p.id}" title="Modifier">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-cost">Coût : ${money(p.unitCost)} / unité</div>
        <div class="product-meta">
          <div class="product-qty">disponible<br><strong>${p.quantity}</strong></div>
        </div>
        <button class="sell-btn" data-sell="${p.id}" ${p.quantity <= 0 ? "disabled" : ""}>
          ${p.quantity <= 0 ? "Rupture de stock" : "Vendre"}
        </button>
      `;
      productGrid.appendChild(card);
    });

    productGrid.querySelectorAll("[data-sell]").forEach(btn =>
      btn.addEventListener("click", () => openSellModal(btn.dataset.sell)));
    productGrid.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => openProductModal(btn.dataset.edit)));
  }

  searchInput.addEventListener("input", renderProducts);

  /* ---------------- PRODUCTS: ADD / EDIT MODAL ---------------- */
  const productModal = document.getElementById("productModal");
  const productForm = document.getElementById("productForm");
  const productModalTitle = document.getElementById("productModalTitle");
  const deleteProductBtn = document.getElementById("deleteProductBtn");
  const pCartonPrice = document.getElementById("pCartonPrice");
  const pPerCarton = document.getElementById("pPerCarton");
  const pCartons = document.getElementById("pCartons");
  const pQty = document.getElementById("pQty");
  const unitCostHint = document.getElementById("unitCostHint");
  let editingProductId = null;

  document.getElementById("openAddProduct").addEventListener("click", () => openProductModal(null));
  document.getElementById("fabAdd").addEventListener("click", () => { vibrate(10); openProductModal(null); });

  function updateUnitCostHint() {
    const cartonPrice = parseFloat(pCartonPrice.value);
    const perCarton = parseFloat(pPerCarton.value);
    if (!isNaN(cartonPrice) && !isNaN(perCarton) && perCarton > 0) {
      unitCostHint.textContent = `Coût unitaire : ${money(cartonPrice / perCarton)}`;
    } else {
      unitCostHint.textContent = "Coût unitaire : —";
    }
  }
  function recomputeQtyFromCartons() {
    const cartons = parseFloat(pCartons.value);
    const perCarton = parseFloat(pPerCarton.value);
    if (!isNaN(cartons) && !isNaN(perCarton) && cartons >= 0 && perCarton >= 0) {
      pQty.value = Math.round(cartons * perCarton);
    }
  }
  pCartonPrice.addEventListener("input", updateUnitCostHint);
  pPerCarton.addEventListener("input", () => { updateUnitCostHint(); recomputeQtyFromCartons(); });
  pCartons.addEventListener("input", recomputeQtyFromCartons);

  function openProductModal(productId) {
    editingProductId = productId;
    const p = productId ? products.find(x => x.id === productId) : null;
    productModalTitle.textContent = p ? "Modifier le produit" : "Ajouter un produit";
    document.getElementById("pName").value = p ? p.name : "";
    pCartonPrice.value = p ? (p.cartonPrice ?? "") : "";
    pPerCarton.value = p ? (p.qtyPerCarton ?? "") : "";
    pCartons.value = "";
    pQty.value = p ? p.quantity : "";
    updateUnitCostHint();
    deleteProductBtn.hidden = !p;
    productModal.hidden = false;
    setTimeout(() => document.getElementById("pName").focus(), 50);
  }

  document.getElementById("productCancel").addEventListener("click", () => productModal.hidden = true);

  productForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("pName").value.trim();
    const cartonPrice = parseFloat(pCartonPrice.value);
    const qtyPerCarton = parseFloat(pPerCarton.value);
    const quantity = parseInt(pQty.value, 10);

    if (!name || isNaN(cartonPrice) || isNaN(qtyPerCarton) || qtyPerCarton <= 0 || isNaN(quantity)) {
      toast("Veuillez remplir le nom, le prix du carton, la quantité par carton et la quantité totale.", true);
      return;
    }
    const unitCost = cartonPrice / qtyPerCarton;

    if (editingProductId) {
      const p = products.find(x => x.id === editingProductId);
      Object.assign(p, { name, cartonPrice, qtyPerCarton, unitCost, quantity });
      toast(`« ${name} » mis à jour.`);
    } else {
      products.push({ id: uid(), name, cartonPrice, qtyPerCarton, unitCost, quantity });
      toast(`« ${name} » ajouté au stock.`);
    }
    vibrate(10);
    persistProducts();
    productModal.hidden = true;
    renderProducts();
    renderDashboard();
  });

  deleteProductBtn.addEventListener("click", () => {
    if (!editingProductId) return;
    const p = products.find(x => x.id === editingProductId);
    products = products.filter(x => x.id !== editingProductId);
    persistProducts();
    productModal.hidden = true;
    toast(`« ${p.name} » supprimé du stock.`);
    renderProducts();
    renderDashboard();
  });

  /* ---------------- SELL MODAL ---------------- */
  const sellModal = document.getElementById("sellModal");
  const sellQtyInput = document.getElementById("sellQty");
  const sellPriceInput = document.getElementById("sellPriceInput");
  const sellError = document.getElementById("sellError");
  const sellTotalHint = document.getElementById("sellTotalHint");
  let sellingProductId = null;

  function openSellModal(productId) {
    const p = products.find(x => x.id === productId);
    if (!p || p.quantity <= 0) return;
    sellingProductId = productId;
    document.getElementById("sellProductName").textContent = p.name;
    document.getElementById("sellAvailable").textContent = p.quantity;
    document.getElementById("sellCost").textContent = money(p.unitCost);
    sellQtyInput.value = 1;
    sellQtyInput.max = p.quantity;
    sellPriceInput.value = "";
    sellError.hidden = true;
    updateSellTotalHint();
    sellModal.hidden = false;
    setTimeout(() => sellPriceInput.focus(), 50);
  }

  function updateSellTotalHint() {
    const p = products.find(x => x.id === sellingProductId);
    const qty = parseInt(sellQtyInput.value, 10);
    const price = parseFloat(sellPriceInput.value);
    if (!p || isNaN(qty) || qty < 1 || isNaN(price) || price < 0) {
      sellTotalHint.textContent = "Total : — · Bénéfice : —";
      return;
    }
    const total = price * qty;
    const profit = (price - p.unitCost) * qty;
    sellTotalHint.textContent = `Total : ${money(total)} · Bénéfice : ${money(profit)}`;
  }
  sellQtyInput.addEventListener("input", updateSellTotalHint);
  sellPriceInput.addEventListener("input", updateSellTotalHint);

  document.getElementById("sellCancel").addEventListener("click", () => sellModal.hidden = true);
  document.getElementById("sellConfirm").addEventListener("click", confirmSell);
  sellPriceInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmSell(); });

  function confirmSell() {
    const p = products.find(x => x.id === sellingProductId);
    const qty = parseInt(sellQtyInput.value, 10);
    const price = parseFloat(sellPriceInput.value);
    if (!p || isNaN(qty) || qty < 1 || qty > p.quantity || isNaN(price) || price < 0) {
      sellError.hidden = false;
      return;
    }
    p.quantity -= qty;
    persistProducts();

    const now = new Date();
    sales.push({
      id: uid(),
      productId: p.id,
      productName: p.name,
      unitPrice: price,
      unitCost: p.unitCost,
      quantity: qty,
      total: price * qty,
      profit: (price - p.unitCost) * qty,
      iso: now.toISOString(),
      dayKey: dayKey(now),
      monthKey: monthKey(now),
      dateLabel: now.toLocaleDateString("fr-FR"),
      timeLabel: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
    persistSales();
    vibrate(15);

    sellModal.hidden = true;
    toast(`Vente enregistrée : ${qty} × ${p.name} — ${money(price * qty)}`);
    renderProducts();
    renderDashboard();
    populateMonthSelect(monthSelect);
    populateMonthSelect(benefitsMonthSelect);
    renderSales();
    renderBenefits();
  }

  /* ---------------- DATE HELPERS ---------------- */
  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const MONTH_NAMES = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  function monthLabel(key) {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
  }

  /* ---------------- DASHBOARD ---------------- */
  function renderSparkline(values) {
    const svg = document.getElementById("sparkline");
    const w = 100, h = 28;
    const max = Math.max(...values, 1);
    const step = w / (values.length - 1 || 1);
    const points = values.map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePoints = points.join(" ");
    const areaPoints = `0,${h} ${linePoints} ${w},${h}`;
    svg.innerHTML = `
      <polygon points="${areaPoints}" fill="url(#sparkGrad)" opacity="0.35"></polygon>
      <polyline points="${linePoints}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D4AF37"></stop>
          <stop offset="100%" stop-color="#D4AF37" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
    `;
  }

  function renderDashboard() {
    document.getElementById("statProductCount").textContent = products.length;

    const now = new Date();
    const todayKey = dayKey(now);
    const thisMonthKey = monthKey(now);

    const todayTotal = sales.filter(s => s.dayKey === todayKey).reduce((s, x) => s + x.total, 0);
    const monthTotal = sales.filter(s => s.monthKey === thisMonthKey).reduce((s, x) => s + x.total, 0);
    document.getElementById("statTodaySales").textContent = money(todayTotal);
    document.getElementById("statMonthSales").textContent = money(monthTotal);

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      last7.push(sales.filter(s => s.dayKey === k).reduce((s, x) => s + x.total, 0));
    }
    renderSparkline(last7);

    const lowStockList = document.getElementById("lowStockList");
    const low = products.filter(p => p.quantity <= LOW_STOCK_THRESHOLD).sort((a, b) => a.quantity - b.quantity);
    if (low.length === 0) {
      lowStockList.innerHTML = `<p class="empty-note">Aucun produit en stock faible pour le moment.</p>`;
    } else {
      lowStockList.innerHTML = low.map(p => `
        <div class="low-stock-row">
          <span>${escapeHtml(p.name)}</span>
          <span class="qty-badge">${p.quantity} restant(s)</span>
        </div>`).join("");
    }
  }

  /* ---------------- MONTH SELECT HELPER (shared by Ventes & Bénéfices) ---------------- */
  function populateMonthSelect(selectEl) {
    const keys = Array.from(new Set(sales.map(s => s.monthKey))).sort().reverse();
    const currentKey = monthKey(new Date());
    if (!keys.includes(currentKey)) keys.unshift(currentKey);

    const prevValue = selectEl.value;
    selectEl.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join("");
    selectEl.value = keys.includes(prevValue) ? prevValue : currentKey;
  }

  /* ---------------- SALES VIEW ---------------- */
  const monthSelect = document.getElementById("monthSelect");
  monthSelect.addEventListener("change", renderSales);

  function renderSales() {
    const selectedMonth = monthSelect.value || monthKey(new Date());
    const monthSales = sales.filter(s => s.monthKey === selectedMonth);

    const total = monthSales.reduce((s, x) => s + x.total, 0);
    const profit = monthSales.reduce((s, x) => s + x.profit, 0);
    const units = monthSales.reduce((s, x) => s + x.quantity, 0);
    document.getElementById("monthTotal").textContent = money(total);
    document.getElementById("monthProfit").textContent = money(profit);
    document.getElementById("monthUnits").textContent = units;

    const byDay = {};
    monthSales.forEach(s => {
      if (!byDay[s.dayKey]) byDay[s.dayKey] = { count: 0, units: 0, total: 0, profit: 0 };
      byDay[s.dayKey].count += 1;
      byDay[s.dayKey].units += s.quantity;
      byDay[s.dayKey].total += s.total;
      byDay[s.dayKey].profit += s.profit;
    });

    const todayKey = dayKey(new Date());
    const days = Object.keys(byDay).sort().reverse();
    const tbody = document.getElementById("dailySalesBody");
    const salesEmpty = document.getElementById("salesEmpty");

    if (days.length === 0) {
      tbody.innerHTML = "";
      salesEmpty.hidden = false;
    } else {
      salesEmpty.hidden = true;
      tbody.innerHTML = days.map(d => {
        const row = byDay[d];
        const label = new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
        return `<tr class="${d === todayKey ? "today-row" : ""}">
          <td>${label}</td>
          <td>${row.count}</td>
          <td>${row.units}</td>
          <td>${money(row.total)}</td>
          <td>${money(row.profit)}</td>
        </tr>`;
      }).join("");
    }

    const detailedBody = document.getElementById("detailedSalesBody");
    const detailedEmpty = document.getElementById("detailedSalesEmpty");
    const sortedSales = [...monthSales].sort((a, b) => b.iso.localeCompare(a.iso));

    if (sortedSales.length === 0) {
      detailedBody.innerHTML = "";
      detailedEmpty.hidden = false;
    } else {
      detailedEmpty.hidden = true;
      detailedBody.innerHTML = sortedSales.map(s => `
        <tr>
          <td>${s.dateLabel} ${s.timeLabel}</td>
          <td class="product-col">${escapeHtml(s.productName)}</td>
          <td>${s.quantity}</td>
          <td>${money(s.profit)}</td>
        </tr>`).join("");
    }
  }

  /* ---------------- BENEFITS VIEW ---------------- */
  const benefitsMonthSelect = document.getElementById("benefitsMonthSelect");
  benefitsMonthSelect.addEventListener("change", renderBenefits);

  function renderBenefits() {
    const now = new Date();
    const todayKey = dayKey(now);
    const totalProfitAllTime = sales.reduce((s, x) => s + x.profit, 0);
    const todayProfit = sales.filter(s => s.dayKey === todayKey).reduce((s, x) => s + x.profit, 0);
    document.getElementById("statTodayProfit").textContent = money(todayProfit);
    document.getElementById("statTotalProfit").textContent = money(totalProfitAllTime);

    const selectedMonth = benefitsMonthSelect.value || monthKey(now);
    const monthSales = sales.filter(s => s.monthKey === selectedMonth);
    const selectedMonthProfit = monthSales.reduce((s, x) => s + x.profit, 0);
    document.getElementById("statSelectedMonthProfit").textContent = money(selectedMonthProfit);

    const byDay = {};
    monthSales.forEach(s => {
      if (!byDay[s.dayKey]) byDay[s.dayKey] = { count: 0, profit: 0 };
      byDay[s.dayKey].count += 1;
      byDay[s.dayKey].profit += s.profit;
    });

    const days = Object.keys(byDay).sort().reverse();
    const tbody = document.getElementById("benefitsDailyBody");
    const benefitsEmpty = document.getElementById("benefitsEmpty");

    if (days.length === 0) {
      tbody.innerHTML = "";
      benefitsEmpty.hidden = false;
    } else {
      benefitsEmpty.hidden = true;
      tbody.innerHTML = days.map(d => {
        const row = byDay[d];
        const label = new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
        return `<tr class="${d === todayKey ? "today-row" : ""}">
          <td>${label}</td>
          <td>${row.count}</td>
          <td>${money(row.profit)}</td>
        </tr>`;
      }).join("");
    }
  }

  /* ---------------- CLOSE MODALS ON BACKDROP CLICK ---------------- */
  [productModal, sellModal].forEach(modal => {
    modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
  });

  /* ---------------- INIT ---------------- */
  populateMonthSelect(monthSelect);
  populateMonthSelect(benefitsMonthSelect);
  renderDashboard();
  renderProducts();
  renderSales();
  renderBenefits();
})();
