// Workshop Estimate, Production & Inventory Calculator - Main Logic Engine (v3)

// --- Default Data Constants ---
const DEFAULT_MATERIALS = [];

const DEFAULT_OPERATIONS = [];

const DEFAULT_TEMPLATES = [];



// --- App State ---
const state = {
  theme: 'dark',
  activeTab: 'dashboard',
  searchQuery: '',
  materialsCatalog: [],
  operationsCatalog: [],
  templatesCatalog: [], // Represents saved Part Blueprint Recipes
  savedEstimates: [],

  activeEstimate: {
    title: 'New Estimate',
    clientName: 'Walk-in Client',
    quantity: 1,
    markup: 30,
    items: [],
    labor: [],
    mfgTime: 0,
    mfgTimeUnit: 'sec',
    templateId: null
  },
  // Modal auxiliary arrays for creating parts
  modalSelectedMaterials: [],
  editingBlueprintId: null,
  editingMaterialId: null,
  activeMaterialFilter: 'all',
  dispatches: []
};

// --- Supabase Cloud Client Setup ---
const supabaseUrl = localStorage.getItem('supabase_url') || '';
const supabaseKey = localStorage.getItem('supabase_key') || '';
let supabaseClient = null;
let isLocalWriting = false;
let localWriteTimeout = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.error("Supabase initialization error:", err);
  }
}

async function syncAllToCloud() {
  if (!supabaseClient) return;
  isLocalWriting = true;
  if (localWriteTimeout) clearTimeout(localWriteTimeout);
  try {
    // 1. Sync Materials
    if (state.materialsCatalog.length > 0) {
      const records = state.materialsCatalog.map(m => ({
        id: m.id,
        name: m.name,
        category: m.category || '',
        cost: m.cost || 0,
        unit: m.unit || '',
        stock: m.stock || 0,
        min_stock: m.minStock || 0,
        item_code: m.itemCode || '',
        invoice_number: m.invoiceNumber || ''
      }));
      await supabaseClient.from('raw_materials').upsert(records);
      const ids = state.materialsCatalog.map(x => x.id);
      await supabaseClient.from('raw_materials').delete().not('id', 'in', `(${ids.join(',')})`);
    } else {
      await supabaseClient.from('raw_materials').delete().neq('id', '');
    }

    // 2. Sync Blueprints
    if (state.templatesCatalog.length > 0) {
      const records = state.templatesCatalog.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description || '',
        po_number: t.poNumber || '',
        mfg_time: t.mfgTime || 0,
        mfg_time_unit: t.mfgTimeUnit || 'sec',
        materials: t.materials || [],
        operations: t.operations || [],
        stock: t.stock || 0
      }));
      await supabaseClient.from('blueprints').upsert(records);
      const ids = state.templatesCatalog.map(x => x.id);
      await supabaseClient.from('blueprints').delete().not('id', 'in', `(${ids.join(',')})`);
    } else {
      await supabaseClient.from('blueprints').delete().neq('id', '');
    }

    // 3. Sync Estimates
    if (state.savedEstimates.length > 0) {
      const records = state.savedEstimates.map(e => ({
        id: e.id,
        title: e.title,
        client_name: e.clientName || '',
        quantity: e.quantity || 1,
        markup: e.markup || 30,
        items: e.items || [],
        labor: e.labor || [],
        mfg_time: e.mfgTime || 0,
        mfg_time_unit: e.mfgTimeUnit || 'sec',
        template_id: e.templateId || null,
        parts: e.parts || [],
        totals: e.totals || {},
        date: e.date,
        time: e.time
      }));
      await supabaseClient.from('estimates').upsert(records);
      const ids = state.savedEstimates.map(x => x.id);
      await supabaseClient.from('estimates').delete().not('id', 'in', `(${ids.join(',')})`);
    } else {
      await supabaseClient.from('estimates').delete().neq('id', '');
    }

    // 4. Sync Dispatches
    if (state.dispatches.length > 0) {
      const records = state.dispatches.map(d => ({
        id: d.id,
        client_name: d.clientName || '',
        estimate_title: d.estimateTitle || '',
        gate_pass: d.gatePass || '',
        vehicle_number: d.vehicleNumber || '',
        driver_name: d.driverName || '',
        status: d.status || '',
        remarks: d.remarks || '',
        date: d.date,
        time: d.time,
        items: d.items || []
      }));
      await supabaseClient.from('dispatches').upsert(records);
      const ids = state.dispatches.map(x => x.id);
      await supabaseClient.from('dispatches').delete().not('id', 'in', `(${ids.join(',')})`);
    } else {
      await supabaseClient.from('dispatches').delete().neq('id', '');
    }
  } catch (err) {
    console.error("Failed to sync to cloud:", err);
  } finally {
    localWriteTimeout = setTimeout(() => {
      isLocalWriting = false;
    }, 1500);
  }
}

let loadCloudTimeout = null;
function debouncedLoadStateFromCloud() {
  if (loadCloudTimeout) clearTimeout(loadCloudTimeout);
  loadCloudTimeout = setTimeout(() => {
    loadStateFromCloud();
  }, 300);
}

async function loadStateFromCloud() {
  if (!supabaseClient) return;
  try {
    const [matsRes, tplsRes, estsRes, dispsRes] = await Promise.all([
      supabaseClient.from('raw_materials').select('*'),
      supabaseClient.from('blueprints').select('*'),
      supabaseClient.from('estimates').select('*'),
      supabaseClient.from('dispatches').select('*')
    ]);

    if (matsRes.error) throw matsRes.error;
    if (tplsRes.error) throw tplsRes.error;
    if (estsRes.error) throw estsRes.error;
    if (dispsRes.error) throw dispsRes.error;

    if (matsRes.data) {
      state.materialsCatalog = matsRes.data.map(m => ({
        id: m.id,
        name: m.name,
        category: m.category || '',
        cost: parseFloat(m.cost) || 0,
        unit: m.unit || 'pcs',
        stock: parseFloat(m.stock) || 0,
        minStock: parseFloat(m.min_stock) || 0,
        itemCode: m.item_code || '',
        invoiceNumber: m.invoice_number || ''
      }));
    }

    if (tplsRes.data) {
      state.templatesCatalog = tplsRes.data.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description || '',
        poNumber: t.po_number || '',
        mfgTime: parseFloat(t.mfg_time) || 0,
        mfgTimeUnit: t.mfg_time_unit || 'sec',
        materials: t.materials || [],
        operations: t.operations || [],
        stock: parseFloat(t.stock) || 0
      }));
    }

    if (estsRes.data) {
      state.savedEstimates = estsRes.data.map(e => ({
        id: e.id,
        title: e.title,
        clientName: e.client_name || '',
        quantity: parseInt(e.quantity) || 1,
        markup: parseFloat(e.markup) || 30,
        items: e.items || [],
        labor: e.labor || [],
        mfgTime: parseFloat(e.mfg_time) || 0,
        mfgTimeUnit: e.mfg_time_unit || 'sec',
        templateId: e.template_id || null,
        parts: e.parts || [],
        totals: e.totals || {},
        date: e.date,
        time: e.time
      }));
    }

    if (dispsRes.data) {
      state.dispatches = dispsRes.data.map(d => ({
        id: d.id,
        clientName: d.client_name || '',
        estimateTitle: d.estimate_title || '',
        gatePass: d.gate_pass || '',
        vehicleNumber: d.vehicle_number || '',
        driverName: d.driver_name || '',
        status: d.status || '',
        remarks: d.remarks || '',
        date: d.date,
        time: d.time,
        items: d.items || []
      }));
    }

    // Update local storage cache
    localStorage.setItem('ws_materials', JSON.stringify(state.materialsCatalog));
    localStorage.setItem('ws_templates', JSON.stringify(state.templatesCatalog));
    localStorage.setItem('ws_estimates', JSON.stringify(state.savedEstimates));
    localStorage.setItem('ws_dispatches', JSON.stringify(state.dispatches));

    // Refresh active views
    const activeTab = state.activeTab || 'dashboard';
    switchTab(activeTab);
    populateSelectors();
    updateGlobalAlerts();
  } catch (err) {
    console.error("Error loading cloud data:", err);
  }
}

function setupRealtimeSync() {
  if (!supabaseClient) return;
  try {
    supabaseClient.channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        if (isLocalWriting) return;
        debouncedLoadStateFromCloud();
      })
      .subscribe();
  } catch (err) {
    console.error("Realtime subscription setup failed:", err);
  }
}

// --- Initializing State from LocalStorage ---
function loadStateFromStorage() {
  state.theme = localStorage.getItem('ws_calc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  
  state.materialsCatalog = JSON.parse(localStorage.getItem('ws_materials')) || DEFAULT_MATERIALS;
  // Ensure stock fields exist for migration/backwards compatibility
  state.materialsCatalog.forEach(mat => {
    if (mat.stock === undefined) mat.stock = 100;
    if (mat.minStock === undefined) mat.minStock = 10;
  });
  state.operationsCatalog = JSON.parse(localStorage.getItem('ws_operations')) || DEFAULT_OPERATIONS;
  state.templatesCatalog = JSON.parse(localStorage.getItem('ws_templates')) || DEFAULT_TEMPLATES;
  state.savedEstimates = JSON.parse(localStorage.getItem('ws_estimates')) || [];
  state.dispatches = JSON.parse(localStorage.getItem('ws_dispatches')) || [];

  if (supabaseClient) {
    loadStateFromCloud();
    setupRealtimeSync();
  }
}

function saveStateToStorage() {
  localStorage.setItem('ws_materials', JSON.stringify(state.materialsCatalog));
  localStorage.setItem('ws_operations', JSON.stringify(state.operationsCatalog));
  localStorage.setItem('ws_templates', JSON.stringify(state.templatesCatalog));
  localStorage.setItem('ws_estimates', JSON.stringify(state.savedEstimates));
  localStorage.setItem('ws_dispatches', JSON.stringify(state.dispatches));
  if (supabaseClient) {
    syncAllToCloud();
  }
}

// --- Helper Functions ---
const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
};

const formatTime = (minutes) => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const formatDurationString = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0s';
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
};

const convertToSeconds = (time, unit) => {
  const t = parseFloat(time) || 0;
  const u = (unit || 'sec').toLowerCase().trim();
  if (u === 'min') return t * 60;
  if (u === 'hr' || u === 'hour' || u === 'hours') return t * 3600;
  return t;
};

const formatWeightForDisplay = (amount, unit) => {
  const u = (unit || '').toLowerCase().trim();
  const amt = parseFloat(amount) || 0;
  
  if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') {
    if (amt >= 1000) {
      return `${(amt / 1000).toFixed(2)} kg`;
    }
    return `${amt.toFixed(2)} ${unit}`;
  }
  
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') {
    if (amt < 1.0 && amt > 0) {
      return `${(amt * 1000).toFixed(2)} g`;
    }
    return `${amt.toFixed(2)} ${unit}`;
  }
  
  if (u === 'oz' || u === 'ounce' || u === 'ounces') {
    if (amt >= 16) {
      return `${(amt / 16).toFixed(2)} lbs`;
    }
    return `${amt.toFixed(2)} ${unit}`;
  }
  
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') {
    if (amt < 1.0 && amt > 0) {
      return `${(amt * 16).toFixed(2)} oz`;
    }
    return `${amt.toFixed(2)} ${unit}`;
  }
  
  return `${amt.toFixed(2)} ${unit}`;
};

const generateId = () => Math.random().toString(36).substr(2, 9);

function convertWeight(amount, fromUnit, toUnit) {
  const from = (fromUnit || 'g').toLowerCase().trim();
  const to = (toUnit || 'pcs').toLowerCase().trim();

  const toGrams = {
    g: 1,
    gram: 1,
    grams: 1,
    kg: 1000,
    kilogram: 1000,
    kilograms: 1000,
    lb: 453.59237,
    lbs: 453.59237,
    pound: 453.59237,
    pounds: 453.59237,
    oz: 28.349523,
    ounce: 28.349523,
    ounces: 28.349523
  };

  const getFactor = (unit) => {
    if (toGrams[unit] !== undefined) return toGrams[unit];
    const matchedKey = Object.keys(toGrams)
      .filter(key => unit.includes(key))
      .sort((a, b) => b.length - a.length)[0];
    return matchedKey ? toGrams[matchedKey] : 1;
  };

  const fromFactor = getFactor(from);
  const toFactor = getFactor(to);

  const valueInGrams = amount * fromFactor;
  return valueInGrams / toFactor;
}

// --- Calculation Logic ---
function calculateActiveEstimate() {
  const qty = Math.max(1, parseInt(state.activeEstimate.quantity) || 1);
  const markupPct = Math.max(0, parseFloat(state.activeEstimate.markup) || 0);

  // 1. Calculate Materials Cost
  let totalMaterialCost = 0;
  state.activeEstimate.items.forEach(item => {
    const catalogItem = state.materialsCatalog.find(m => m.id === item.id) ||
                        state.materialsCatalog.find(m => m.name.toLowerCase() === item.name.toLowerCase());
    if (catalogItem) {
      item.stock = catalogItem.stock;
      item.minStock = catalogItem.minStock;
      item.unit = catalogItem.unit || item.unit; // Force alignment with inventory catalog unit
    }
    const compWeight = parseFloat(item.componentWeight) || 0;
    const runWeight = parseFloat(item.runnerWeight) || 0;
    const qtyPerUnit = parseFloat(item.qtyPerUnit) || 0;

    // Determine the quantity for this specific item (based on its part instance quantity)
    let itemQty = qty;
    if (item.partInstanceId && state.activeEstimate.parts) {
      const part = state.activeEstimate.parts.find(p => p.id === item.partInstanceId);
      if (part) {
        itemQty = part.quantity || 1;
      }
    }

    let calculatedQty;
    if (compWeight > 0 || runWeight > 0) {
      const weightUnit = item.weightUnit || 'g';
      const weightSumConverted = convertWeight(compWeight + (0.75 * runWeight), weightUnit, item.unit);
      calculatedQty = qtyPerUnit * weightSumConverted * itemQty;
    } else {
      calculatedQty = qtyPerUnit * itemQty;
    }

    item.calculatedQty = calculatedQty;
    item.calculatedCost = item.calculatedQty * item.unitCost;
    totalMaterialCost += item.calculatedCost;
  });

  // 2. Calculate Labor Cost (Disabled)
  let totalLaborCost = 0;
  state.activeEstimate.labor = [];

  // Calculate manufacturing duration based on active parts in items list
  let totalMfgSeconds = 0;
  const currentPartInstanceIds = new Set(
    state.activeEstimate.items
      .map(item => item.partInstanceId)
      .filter(id => id)
  );

  const activeParts = [];
  if (state.activeEstimate.parts && state.activeEstimate.parts.length > 0) {
    state.activeEstimate.parts.forEach(part => {
      // Keep parts that have at least one active item in the list
      if (currentPartInstanceIds.has(part.id) || !part.id) {
        activeParts.push(part);
        const partQty = part.quantity || 1;
        totalMfgSeconds += convertToSeconds(part.mfgTime, part.mfgTimeUnit) * partQty;
      }
    });
    state.activeEstimate.parts = activeParts;
    // Keep activeEstimate.mfgTime in sync with active parts base total (sum of raw part times)
    const baseMfgTime = activeParts.reduce((sum, p) => sum + convertToSeconds(p.mfgTime, p.mfgTimeUnit), 0);
    state.activeEstimate.mfgTime = baseMfgTime;
    state.activeEstimate.mfgTimeUnit = 'sec';
  } else {
    // Fallback if no parts array is configured yet
    const mfgTime = parseFloat(state.activeEstimate.mfgTime) || 0;
    const mfgTimeUnit = state.activeEstimate.mfgTimeUnit || 'sec';
    const unitSeconds = convertToSeconds(mfgTime, mfgTimeUnit);
    totalMfgSeconds = unitSeconds * qty;
  }

  // 3. Totals
  const baseCost = totalMaterialCost;
  const markupAmount = baseCost * (markupPct / 100);
  const finalPrice = baseCost + markupAmount;
  const totalWorkDays = 0;

  // Store calculated totals in activeEstimate state
  state.activeEstimate.totals = {
    materialsCost: totalMaterialCost,
    laborCost: totalLaborCost,
    baseCost: baseCost,
    markupAmount: markupAmount,
    finalPrice: finalPrice,
    totalTimeMin: totalMfgSeconds / 60,
    totalTimeHours: totalMfgSeconds / 3600,
    totalMfgSeconds: totalMfgSeconds,
    workDays: totalWorkDays
  };

  // Update Estimator Workspace UI
  updateEstimatorUI();
}

// --- DOM Rendering & Tab Initializers ---
function updateEstimatorUI() {
  const totals = state.activeEstimate.totals;
  if (!totals) return;

  // Update KPI Cards in estimator tab
  const matCostEl = document.getElementById('kpi-materials-cost');
  if (matCostEl) matCostEl.innerText = formatCurrency(totals.materialsCost);
  
  const baseCostEl = document.getElementById('kpi-base-cost');
  if (baseCostEl) baseCostEl.innerText = formatCurrency(totals.baseCost);
  
  const markupAmtEl = document.getElementById('kpi-markup-amount');
  if (markupAmtEl) markupAmtEl.innerText = formatCurrency(totals.markupAmount);
  
  const finalPriceEl = document.getElementById('kpi-final-price');
  if (finalPriceEl) finalPriceEl.innerText = formatCurrency(totals.finalPrice);

  const totalTimeEl = document.getElementById('kpi-total-time');
  if (totalTimeEl) totalTimeEl.innerText = formatDurationString(totals.totalMfgSeconds || 0);

  const timeBreakdownEl = document.getElementById('kpi-time-breakdown');
  if (timeBreakdownEl) {
    const parts = state.activeEstimate.parts || [];
    if (parts.length > 1) {
      const qty = Math.max(1, parseInt(state.activeEstimate.quantity) || 1);
      const listItems = parts.map((p, idx) => {
        const itemSeconds = convertToSeconds(p.mfgTime, p.mfgTimeUnit) * qty;
        return `<div style="margin-top: 2px;">• Part ${idx + 1} (${p.name}): ${formatDurationString(itemSeconds)}</div>`;
      }).join('');
      timeBreakdownEl.innerHTML = `<strong>Breakdown:</strong>${listItems}`;
      timeBreakdownEl.style.display = 'block';
    } else {
      timeBreakdownEl.style.display = 'none';
      timeBreakdownEl.innerHTML = '';
    }
  }

  // Update Margin slider UI
  const markupValEl = document.getElementById('markup-val');
  if (markupValEl) markupValEl.innerText = `${state.activeEstimate.markup}%`;
  
  const markupSliderEl = document.getElementById('markup-slider');
  if (markupSliderEl) markupSliderEl.value = state.activeEstimate.markup;

  // Render lists
  renderMaterialRows();

  // Render Estimator Charts
  renderEstimatorCharts();
}

function renderMaterialRows() {
  const container = document.getElementById('materials-list-container');
  container.innerHTML = '';

  // Populate filter dropdown
  const filterSelect = document.getElementById('material-allocation-filter');
  if (filterSelect) {
    const currentFilter = state.activeMaterialFilter || 'all';
    filterSelect.innerHTML = `<option value="all">All Raw Materials</option>`;
    state.activeEstimate.items.forEach((item, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.innerText = item.name || `Raw Material ${index + 1}`;
      filterSelect.appendChild(opt);
    });
    // Ensure the value exists in options (in case a material was deleted)
    const optionExists = Array.from(filterSelect.options).some(opt => opt.value === String(currentFilter));
    if (optionExists) {
      filterSelect.value = currentFilter;
    } else {
      filterSelect.value = 'all';
      state.activeMaterialFilter = 'all';
    }
  }

  if (state.activeEstimate.items.length === 0) {
    container.innerHTML = `
      <div class="no-items-message" style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--text-muted); font-style: italic;">
        No raw materials added yet. Load a blueprint or select items below.
      </div>`;
    return;
  }

  // Group active estimate items by partInstanceId to keep distinct loads separate
  const partGroups = {};
  state.activeEstimate.items.forEach((item, index) => {
    const key = item.partInstanceId || 'Other/Custom';
    if (!partGroups[key]) {
      partGroups[key] = {
        name: item.partName || 'Other/Custom',
        items: []
      };
    }
    partGroups[key].items.push({ item, index });
  });

  let partIndex = 1;
  for (const [partInstanceId, group] of Object.entries(partGroups)) {
    const partName = group.name;
    const items = group.items;

    // Find the part object to get its quantity
    let partQty = 1;
    let partPoNumber = '';
    if (state.activeEstimate.parts) {
      const part = state.activeEstimate.parts.find(p => p.id === partInstanceId);
      if (part) {
        partQty = part.quantity || 1;
        partPoNumber = part.poNumber || '';
      }
    }

    // Fallback search in templates catalog
    if (!partPoNumber) {
      const template = state.templatesCatalog.find(t => t.name === partName || t.id === state.activeEstimate.templateId);
      if (template) {
        partPoNumber = template.poNumber || '';
      }
    }

    // Render group header for this part in workspace
    const headerEl = document.createElement('div');
    headerEl.className = 'part-group-header';
    headerEl.style.display = 'flex';
    headerEl.style.alignItems = 'center';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.fontWeight = '700';
    headerEl.style.fontSize = '0.85rem';
    headerEl.style.color = 'var(--text-primary)';
    headerEl.style.textTransform = 'uppercase';
    headerEl.style.letterSpacing = '0.05em';
    headerEl.style.padding = '8px 12px';
    headerEl.style.background = 'rgba(255,255,255,0.03)';
    headerEl.style.borderLeft = '4px solid var(--accent-primary)';
    headerEl.style.marginTop = partIndex > 1 ? '16px' : '4px';
    headerEl.style.marginBottom = '8px';
    headerEl.style.borderRadius = '4px';
    headerEl.innerHTML = `
      <span>Part ${partIndex}: ${partName}${partPoNumber ? ` (PO: ${partPoNumber})` : ''}</span>
      <div style="display: flex; align-items: center; gap: 8px; text-transform: none; font-weight: normal; font-size: 0.8rem;">
        <span style="color: var(--text-secondary);">Qty:</span>
        <input type="number" class="part-qty-input form-control" data-part-id="${partInstanceId}" value="${partQty}" min="1" style="width: 70px; height: 26px; padding: 2px 6px; font-size: 0.8rem;">
      </div>
    `;
    container.appendChild(headerEl);
    partIndex++;

    items.forEach(({ item, index }) => {
      const available = item.stock || 0;
      const required = item.calculatedQty || 0;
      const isInsufficient = required > available;
      const difference = required - available;

      let stockStatusHtml = '';
      if (isInsufficient) {
        stockStatusHtml = `
          <span class="badge-stock-alert">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            Short by ${difference.toFixed(1)}
          </span>
        `;
      } else if (available < (item.minStock || 0)) {
        stockStatusHtml = `
          <span class="badge-stock-alert" style="background: rgba(245, 158, 11, 0.12); color: var(--color-warning); border-color: rgba(245, 158, 11, 0.2);">
            Low Stock
          </span>
        `;
      } else {
        stockStatusHtml = `<span class="badge-stock-ok">OK</span>`;
      }

      const currentFilter = state.activeMaterialFilter || 'all';
      const isFilteredOut = currentFilter !== 'all' && currentFilter !== String(index);

      const row = document.createElement('div');
      row.className = 'item-row';
      if (isFilteredOut) {
        row.style.display = 'none';
      }
      row.innerHTML = `
        <div class="item-fields-grid material-fields">
          <div class="form-group" style="margin-bottom: 0;">
            <input type="text" class="form-control item-name-input" value="${item.name}" data-index="${index}" placeholder="Material Name">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; font-size: 0.72rem; padding: 0 2px;">
              <span style="color: var(--text-secondary); font-weight: 500; display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                ${item.itemCode ? `<span style="font-family: monospace; color: var(--accent-tertiary); font-weight: 600; background: rgba(16, 185, 129, 0.1); padding: 1px 4px; border-radius: 4px;">${item.itemCode}</span>` : ''}
                ${item.invoiceNumber ? `<span style="font-family: monospace; color: #a29bfe; font-weight: 600; background: rgba(162, 155, 254, 0.1); padding: 1px 4px; border-radius: 4px;">INV: ${item.invoiceNumber}</span>` : ''}
                <span>Stock: ${available.toFixed(1)} ${item.unit}</span>
              </span>
              ${stockStatusHtml}
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" step="any" min="0" class="form-control item-qty-input" value="${item.qtyPerUnit}" data-index="${index}" style="display: none;">
              <span style="font-size: 0.8rem; color: var(--text-muted); width: 35px;">${item.unit}</span>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <input type="number" step="any" min="0" class="form-control item-comp-weight-input" value="${item.componentWeight || 0}" data-index="${index}" title="Component Weight">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <input type="number" step="any" min="0" class="form-control item-run-weight-input" value="${item.runnerWeight || 0}" data-index="${index}" title="Runner Weight">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <select class="form-control item-weight-unit-select" data-index="${index}" title="Weight Unit" style="height: 38px; padding: 6px 8px;">
              <option value="g" ${item.weightUnit === 'g' || !item.weightUnit ? 'selected' : ''}>g</option>
              <option value="kg" ${item.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
              <option value="lbs" ${item.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
              <option value="oz" ${item.weightUnit === 'oz' ? 'selected' : ''}>oz</option>
            </select>
          </div>
          <div class="item-row-total" style="display: flex; align-items: center; justify-content: flex-end; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); text-align: right; min-width: 80px;">
            ${formatWeightForDisplay(item.calculatedQty, item.unit)}
          </div>
        </div>
        <button class="btn btn-danger btn-icon-only btn-sm remove-material-btn" data-index="${index}" title="Remove Material">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      container.appendChild(row);
    });
  }

  // Attach input listeners
  container.querySelectorAll('.item-name-input').forEach(input => {
    input.addEventListener('change', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].name = e.target.value;
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.item-qty-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].qtyPerUnit = Math.max(0, parseFloat(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.item-comp-weight-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].componentWeight = Math.max(0, parseFloat(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.item-run-weight-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].runnerWeight = Math.max(0, parseFloat(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.item-weight-unit-select').forEach(select => {
    select.addEventListener('change', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].weightUnit = e.target.value;
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.item-cost-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.items[idx].unitCost = Math.max(0, parseFloat(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.part-qty-input').forEach(input => {
    input.addEventListener('change', e => {
      const partId = e.target.getAttribute('data-part-id');
      const val = Math.max(1, parseInt(e.target.value) || 1);
      if (state.activeEstimate.parts) {
        const part = state.activeEstimate.parts.find(p => p.id === partId);
        if (part) {
          part.quantity = val;
          calculateActiveEstimate();
        }
      }
    });
  });

  container.querySelectorAll('.remove-material-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = btn.getAttribute('data-index');
      state.activeEstimate.items.splice(idx, 1);
      calculateActiveEstimate();
    });
  });
}

function renderLaborRows() {
  const container = document.getElementById('labor-list-container');
  if (!container) return;
  container.innerHTML = '';

  if (state.activeEstimate.labor.length === 0) {
    container.innerHTML = `
      <div class="no-items-message" style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--text-muted); font-style: italic;">
        No labor operations added yet. Select operations below.
      </div>`;
    return;
  }

  state.activeEstimate.labor.forEach((step, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div class="item-fields-grid labor-fields">
        <div class="form-group" style="margin-bottom: 0;">
          <input type="text" class="form-control labor-name-input" value="${step.name}" data-index="${index}" placeholder="Operation Name">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <input type="number" min="0" class="form-control labor-setup-input" value="${step.setupTime}" data-index="${index}">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <input type="number" min="0" class="form-control labor-run-input" value="${step.runTime}" data-index="${index}">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <input type="number" step="any" min="0" class="form-control labor-rate-input" value="${step.hourlyRate.toFixed(2)}" data-index="${index}">
        </div>
        <div class="item-row-total">
          ${formatCurrency(step.calculatedCost)}
        </div>
      </div>
      <button class="btn btn-danger btn-icon-only btn-sm remove-labor-btn" data-index="${index}" title="Remove Operation">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    container.appendChild(row);
  });

  // Attach input listeners
  container.querySelectorAll('.labor-name-input').forEach(input => {
    input.addEventListener('change', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.labor[idx].name = e.target.value;
    });
  });

  container.querySelectorAll('.labor-setup-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.labor[idx].setupTime = Math.max(0, parseInt(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.labor-run-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.labor[idx].runTime = Math.max(0, parseInt(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.labor-rate-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.activeEstimate.labor[idx].hourlyRate = Math.max(0, parseFloat(e.target.value) || 0);
      calculateActiveEstimate();
    });
  });

  container.querySelectorAll('.remove-labor-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = btn.getAttribute('data-index');
      state.activeEstimate.labor.splice(idx, 1);
      calculateActiveEstimate();
    });
  });
}

// --- Live Graph Generating Logic (No Fake Data) ---
function renderEstimatorCharts() {
  const totals = state.activeEstimate.totals;
  const costContainer = document.getElementById('cost-chart-container');
  if (!costContainer) return;
  
  if (!totals || totals.finalPrice <= 0) {
    costContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-style: italic;">Enter details to plot costs.</div>`;
    return;
  }

  // 1. Cost Donut
  const matPct = (totals.materialsCost / totals.finalPrice) * 100;
  const markPct = (totals.markupAmount / totals.finalPrice) * 100;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  
  const segments = [
    { value: totals.materialsCost, pct: matPct, color: '#6366f1', label: 'Materials' },
    { value: totals.markupAmount, pct: markPct, color: '#10b981', label: 'Markup' }
  ];

  let accumulatedLength = 0;
  let circlesHtml = '';
  segments.forEach(seg => {
    if (seg.value <= 0) return;
    const segmentLength = (seg.value / totals.finalPrice) * circumference;
    const offset = accumulatedLength;
    circlesHtml += `
      <circle class="donut-segment" cx="60" cy="60" r="${radius}" stroke="${seg.color}" 
              stroke-dasharray="${segmentLength} ${circumference}" stroke-dashoffset="${-offset}" stroke-linecap="round" />
    `;
    accumulatedLength += segmentLength;
  });

  costContainer.innerHTML = `
    <div class="chart-container">
      <svg class="donut-svg" width="120" height="120" viewBox="0 0 120 120">
        <circle class="donut-segment-bg" cx="60" cy="60" r="${radius}" />
        ${circlesHtml}
      </svg>
      <div class="donut-center-text">
        <span class="donut-center-value">${formatCurrency(totals.finalPrice)}</span>
        <span class="donut-center-label">Total</span>
      </div>
    </div>
    <div class="legend-container">
      ${segments.map(seg => `
        <div class="legend-item">
          <div class="legend-label-group">
            <span class="legend-color-dot" style="background-color: ${seg.color}"></span>
            <span>${seg.label}</span>
          </div>
          <div class="legend-val">${formatCurrency(seg.value)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${seg.pct.toFixed(0)}%)</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

// Render dynamic stock levels and financial distribution charts on the dashboard
function renderDashboardCharts() {
  const stockContainer = document.getElementById('dashboard-stock-chart');
  
  if (!stockContainer) return;

  // 1. Calculate general metrics
  let lowStockCount = 0;
  
  // Filter materials based on search query if any
  const filteredMaterials = state.materialsCatalog.filter(m => {
    if (!state.searchQuery) return true;
    return m.name.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
           m.category.toLowerCase().includes(state.searchQuery.toLowerCase());
  });

  state.materialsCatalog.forEach(m => {
    if (m.stock < m.minStock) {
      lowStockCount++;
    }
  });

  // Update KPI counters
  const invValueEl = document.getElementById('kpi-inventory-value');
  if (invValueEl) {
    let totalInvValue = 0;
    state.materialsCatalog.forEach(m => {
      totalInvValue += m.stock * (m.cost || 0);
    });
    invValueEl.innerText = formatCurrency(totalInvValue);
  }

  const lowStockEl = document.getElementById('kpi-low-stock-count');
  if (lowStockEl) lowStockEl.innerText = lowStockCount;

  const savedQuotesEl = document.getElementById('kpi-saved-quotes-count');
  if (savedQuotesEl) savedQuotesEl.innerText = state.savedEstimates.length;

  const dispatchesEl = document.getElementById('kpi-dispatches-count');
  if (dispatchesEl) dispatchesEl.innerText = state.dispatches ? state.dispatches.length : 0;

  // 2. Render Stock level bar charts (Dynamic - real data)
  if (filteredMaterials.length === 0) {
    stockContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 40px;">No material records found.</div>`;
  } else {
    let barsHtml = '';
    filteredMaterials.forEach(m => {
      // Calibrate max range for bar scaling
      const maxRange = Math.max(m.minStock * 3, m.stock, 20);
      const stockPct = (m.stock / maxRange) * 100;
      const minStockPct = (m.minStock / maxRange) * 100;
      const isLow = m.stock < m.minStock;
      
      const barFillStyle = isLow 
        ? 'background: linear-gradient(90deg, #f87171 0%, #ef4444 100%);' 
        : 'background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);';

      barsHtml += `
        <div class="live-bar-row">
          <div class="live-bar-info">
            <span style="font-weight: 600;">${m.name}</span>
            <span style="${isLow ? 'color: var(--color-danger); font-weight: 700;' : ''}">
              ${m.stock.toFixed(1)} / ${m.minStock} ${m.unit}
            </span>
          </div>
          <div class="live-bar-track">
            <!-- Alert threshold marker line -->
            <div style="position: absolute; left: ${minStockPct}%; top: 0; bottom: 0; width: 2px; background: rgba(239, 68, 68, 0.4); z-index: 5;" title="Min Alert Level"></div>
            <div class="live-bar-fill" style="width: ${stockPct}%; ${barFillStyle}"></div>
          </div>
        </div>
      `;
    });
    stockContainer.innerHTML = `<div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 0;">${barsHtml}</div>`;
  }
}

// --- 2. Parts Tab Blueprint Builder ---
function renderPartsTab() {
  const container = document.getElementById('parts-grid-container');
  if (!container) return;

  // Filter templates
  const filteredParts = state.templatesCatalog.filter(tpl => {
    if (!state.searchQuery) return true;
    return tpl.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           (tpl.description && tpl.description.toLowerCase().includes(state.searchQuery.toLowerCase()));
  });

  container.innerHTML = '';

  if (filteredParts.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted); font-style: italic;">
        No parts blueprint match found. Click "Create Part Blueprint" to create one.
      </div>`;
    return;
  }

  filteredParts.forEach(tpl => {
    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.innerHTML = `
      <div class="catalog-card-header">
        <span class="catalog-card-title">${tpl.name}</span>
        <span class="catalog-card-badge" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-tertiary);">Part Blueprint</span>
      </div>
      <div class="catalog-card-details" style="flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
          ${tpl.poNumber ? `<span style="font-size: 0.8rem; color: var(--accent-tertiary); font-weight: 600;">PO: ${tpl.poNumber}</span>` : '<span></span>'}
          ${tpl.mfgTime ? `<span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">⏱️ ${tpl.mfgTime} ${tpl.mfgTimeUnit}</span>` : ''}
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 12px;">
          ${tpl.description || 'No description provided.'}
        </p>
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(79, 70, 229, 0.08); border: 1px solid rgba(79, 70, 229, 0.2); padding: 8px 10px; border-radius: 6px; margin: 10px 0;">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent-primary); display: flex; align-items: center; gap: 6px;">
            📦 Finished Stock: <span class="blueprint-stock-value" style="font-size: 0.95rem; color: var(--text-primary);">${tpl.stock || 0}</span> pcs
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-secondary btn-sm adjust-blueprint-stock-btn" data-id="${tpl.id}" data-action="deduct" title="Deduct stock" style="padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 24px; line-height: 1;">-</button>
            <button class="btn btn-secondary btn-sm adjust-blueprint-stock-btn" data-id="${tpl.id}" data-action="add" title="Add stock" style="padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 24px; line-height: 1;">+</button>
          </div>
        </div>
        <div style="font-size: 0.8rem; background: rgba(0,0,0,0.15); border-radius: 6px; padding: 8px; border: 1px solid var(--border-color);">
          <div style="margin-bottom: 4px; font-weight: 600;">Materials:</div>
          <div style="max-height: 80px; overflow-y: auto; color: var(--text-secondary);">
            ${tpl.materials.map(m => `• ${m.qtyPerUnit} ${m.unit} of ${m.name}${m.itemCode ? ` (${m.itemCode})` : ''}${m.invoiceNumber ? ` [INV: ${m.invoiceNumber}]` : ''}`).join('<br>') || 'None configured'}
          </div>
      </div>
      <div class="catalog-card-actions" style="margin-top: 14px; padding-top: 10px; display: flex; gap: 6px;">
        <button class="btn btn-secondary btn-sm send-estimator-btn" data-id="${tpl.id}" title="Send blueprint details to Estimator Workspace" style="flex: 1;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          Send to Estimator
        </button>
        <button class="btn btn-primary btn-sm edit-blueprint-btn" data-id="${tpl.id}" title="Edit Blueprint Details" style="padding: 0 10px;">
          Edit
        </button>
        <button class="btn btn-danger btn-icon-only btn-sm delete-blueprint-btn" data-id="${tpl.id}" title="Delete Blueprint" style="flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire buttons
  container.querySelectorAll('.send-estimator-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      loadTemplateRecipe(id);
      switchTab('production');
    });
  });

  container.querySelectorAll('.edit-blueprint-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      openEditPartModal(id);
    });
  });

  container.querySelectorAll('.delete-blueprint-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      if (confirm("Are you sure you want to delete this part blueprint recipe?")) {
        const id = btn.getAttribute('data-id');
        state.templatesCatalog = state.templatesCatalog.filter(x => x.id !== id);
        saveStateToStorage();
        renderPartsTab();
        populateSelectors();
      }
    });
  });

  // Wire stock adjustment buttons
  container.querySelectorAll('.adjust-blueprint-stock-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const blueprint = state.templatesCatalog.find(t => t.id === id);
      if (!blueprint) return;

      const amtStr = prompt(`Enter quantity of "${blueprint.name}" to ${action === 'add' ? 'add to' : 'deduct from'} finished stock:`, "100");
      if (amtStr === null) return;
      const amt = parseInt(amtStr);
      if (isNaN(amt) || amt <= 0) {
        alert("Please enter a valid positive number.");
        return;
      }

      if (action === 'add') {
        blueprint.stock = (blueprint.stock || 0) + amt;
      } else {
        blueprint.stock = Math.max(0, (blueprint.stock || 0) - amt);
      }

      saveStateToStorage();
      renderPartsTab();
    });
  });
}

// Parts Creation Modals
function openAddPartModal() {
  state.editingBlueprintId = null;
  state.modalSelectedMaterials = [];
  
  // Reset modal title and button text
  const modalHeader = document.querySelector('#catalog-part-modal .modal-header h3');
  if (modalHeader) modalHeader.textContent = 'Create New Part Blueprint';

  const submitBtn = document.querySelector('#catalog-part-modal button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Create Part Blueprint';

  // Reset mixing options
  const mixToggle = document.getElementById('blueprint-mix-toggle');
  if (mixToggle) mixToggle.checked = false;
  const mixDiv = document.getElementById('blueprint-mixing-options');
  if (mixDiv) mixDiv.style.display = 'none';
  const mixWeightsDiv = document.getElementById('blueprint-mixing-weights');
  if (mixWeightsDiv) mixWeightsDiv.style.display = 'none';
  const mixSumDiv = document.getElementById('blueprint-mix-percentage-sum');
  if (mixSumDiv) mixSumDiv.style.display = 'none';

  // Clear inputs
  document.getElementById('new-part-name').value = '';
  document.getElementById('new-part-desc').value = '';
  const poEl = document.getElementById('new-part-po');
  if (poEl) poEl.value = '';
  const mfgTimeEl = document.getElementById('new-part-mfg-time');
  if (mfgTimeEl) mfgTimeEl.value = '0';
  const mfgTimeUnitEl = document.getElementById('new-part-mfg-time-unit');
  if (mfgTimeUnitEl) mfgTimeUnitEl.value = 'sec';
  
  // Reset input fields in the add material group
  const inputEl = document.getElementById('modal-add-material-input');
  const costEl = document.getElementById('modal-add-material-cost');
  const unitEl = document.getElementById('modal-add-material-unit');
  const qtyInput = document.getElementById('modal-add-material-qty');
  const compWeightInput = document.getElementById('modal-add-material-component-weight');
  const runWeightInput = document.getElementById('modal-add-material-runner-weight');
  const weightUnitEl = document.getElementById('modal-add-material-weight-unit');
  if (inputEl) inputEl.value = '';
  if (costEl) costEl.value = '0';
  if (unitEl) unitEl.value = 'pcs';
  if (qtyInput) qtyInput.value = '1';
  if (compWeightInput) compWeightInput.value = '0';
  if (runWeightInput) runWeightInput.value = '0';
  if (weightUnitEl) weightUnitEl.value = 'g';

  // Populate datalist in modal
  populateModalDropdowns();
  renderModalSublists();
  
  document.getElementById('catalog-part-modal').classList.add('active');
}

function openEditPartModal(blueprintId) {
  const tpl = state.templatesCatalog.find(t => t.id === blueprintId);
  if (!tpl) return;

  state.editingBlueprintId = blueprintId;

  // Reset modal title and button text
  const modalHeader = document.querySelector('#catalog-part-modal .modal-header h3');
  if (modalHeader) modalHeader.textContent = 'Edit Part Blueprint';

  const submitBtn = document.querySelector('#catalog-part-modal button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Save Changes';

  // Fill input fields
  document.getElementById('new-part-name').value = tpl.name;
  document.getElementById('new-part-desc').value = tpl.description || '';
  const editPoEl = document.getElementById('new-part-po');
  if (editPoEl) editPoEl.value = tpl.poNumber || '';
  const mfgTimeEl = document.getElementById('new-part-mfg-time');
  if (mfgTimeEl) mfgTimeEl.value = tpl.mfgTime || 0;
  const mfgTimeUnitEl = document.getElementById('new-part-mfg-time-unit');
  if (mfgTimeUnitEl) mfgTimeUnitEl.value = tpl.mfgTimeUnit || 'sec';

  // Copy selected materials
  state.modalSelectedMaterials = JSON.parse(JSON.stringify(tpl.materials));
  
  // Handle mixing setup for Edit mode
  const mixToggle = document.getElementById('blueprint-mix-toggle');
  const mixDiv = document.getElementById('blueprint-mixing-options');
  const mixWeightsDiv = document.getElementById('blueprint-mixing-weights');
  const mixSumDiv = document.getElementById('blueprint-mix-percentage-sum');

  if (state.modalSelectedMaterials && state.modalSelectedMaterials.length > 1) {
    if (mixDiv) mixDiv.style.display = 'flex';
    const hasPercentages = state.modalSelectedMaterials.some(m => m.percentage !== undefined);
    if (hasPercentages && mixToggle) {
      mixToggle.checked = true;
      if (mixWeightsDiv) mixWeightsDiv.style.display = 'grid';
      if (mixSumDiv) mixSumDiv.style.display = 'block';

      // Reconstruct total weights
      let totalComp = 0;
      let totalRun = 0;
      let unit = 'g';
      state.modalSelectedMaterials.forEach(m => {
        totalComp += m.componentWeight || 0;
        totalRun += m.runnerWeight || 0;
        if (m.weightUnit) unit = m.weightUnit;
      });

      document.getElementById('blueprint-mix-comp-weight').value = parseFloat(totalComp.toFixed(3));
      document.getElementById('blueprint-mix-run-weight').value = parseFloat(totalRun.toFixed(3));
      document.getElementById('blueprint-mix-weight-unit').value = unit;
    } else if (mixToggle) {
      mixToggle.checked = false;
      if (mixWeightsDiv) mixWeightsDiv.style.display = 'none';
      if (mixSumDiv) mixSumDiv.style.display = 'none';
    }
  } else {
    if (mixToggle) mixToggle.checked = false;
    if (mixDiv) mixDiv.style.display = 'none';
    if (mixWeightsDiv) mixWeightsDiv.style.display = 'none';
    if (mixSumDiv) mixSumDiv.style.display = 'none';
  }

  // Reset input fields in the add material group
  const inputEl = document.getElementById('modal-add-material-input');
  const costEl = document.getElementById('modal-add-material-cost');
  const unitEl = document.getElementById('modal-add-material-unit');
  const qtyInput = document.getElementById('modal-add-material-qty');
  const compWeightInput = document.getElementById('modal-add-material-component-weight');
  const runWeightInput = document.getElementById('modal-add-material-runner-weight');
  const weightUnitEl = document.getElementById('modal-add-material-weight-unit');
  if (inputEl) inputEl.value = '';
  if (costEl) costEl.value = '0';
  if (unitEl) unitEl.value = 'pcs';
  if (qtyInput) qtyInput.value = '1';
  if (compWeightInput) compWeightInput.value = '0';
  if (runWeightInput) runWeightInput.value = '0';
  if (weightUnitEl) weightUnitEl.value = 'g';

  // Populate datalist in modal
  populateModalDropdowns();
  renderModalSublists();
  
  document.getElementById('catalog-part-modal').classList.add('active');
}

function closeAddPartModal() {
  document.getElementById('catalog-part-modal').classList.remove('active');
}

function populateModalDropdowns() {
  const datalist = document.getElementById('modal-material-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  state.materialsCatalog.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    datalist.appendChild(opt);
  });
}

function renderModalSublists() {
  const matContainer = document.getElementById('new-part-materials-container');
  if (!matContainer) return;
  matContainer.innerHTML = '';
  
  const mixToggle = document.getElementById('blueprint-mix-toggle');
  const mixEnabled = mixToggle && mixToggle.checked;

  const mixDiv = document.getElementById('blueprint-mixing-options');
  if (mixDiv) {
    if (state.modalSelectedMaterials.length > 1) {
      mixDiv.style.display = 'flex';
    } else {
      mixDiv.style.display = 'none';
      if (mixToggle) mixToggle.checked = false;
      const weightsDiv = document.getElementById('blueprint-mixing-weights');
      if (weightsDiv) weightsDiv.style.display = 'none';
      const sumDiv = document.getElementById('blueprint-mix-percentage-sum');
      if (sumDiv) sumDiv.style.display = 'none';
      state.modalSelectedMaterials.forEach(m => delete m.percentage);
    }
  }

  state.modalSelectedMaterials.forEach((item, index) => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '6px';
    div.style.fontSize = '0.85rem';

    if (mixEnabled) {
      if (item.percentage === undefined) {
        item.percentage = parseFloat((100 / state.modalSelectedMaterials.length).toFixed(1));
      }
      div.innerHTML = `
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name}">
          ${item.name} 
          ${item.itemCode ? `<span style="font-size: 0.7rem; font-family: monospace; color: var(--accent-tertiary); background: rgba(16, 185, 129, 0.1); padding: 1px 4px; border-radius: 4px; margin-left: 4px; margin-right: 4px;">${item.itemCode}</span>` : ''}
          ${item.invoiceNumber ? `<span style="font-size: 0.7rem; font-family: monospace; color: #a29bfe; background: rgba(162, 155, 254, 0.1); padding: 1px 4px; border-radius: 4px; margin-right: 4px;">INV: ${item.invoiceNumber}</span>` : ''}
          <span style="font-size: 0.75rem; color: var(--text-muted);">(${item.unit})</span>
        </span>
        <input type="number" step="any" min="0.01" class="form-control modal-mat-qty" value="${item.qtyPerUnit}" style="width: 70px; padding: 4px; display: none;" data-index="${index}">
        <input type="text" class="form-control modal-mat-unit" value="${item.unit}" style="width: 55px; padding: 4px;" data-index="${index}" title="Unit" placeholder="pcs">
        
        <span style="font-size: 0.75rem; color: var(--text-secondary); margin-right: 2px;">Ratio:</span>
        <input type="number" step="any" min="0" max="100" class="form-control modal-mat-percentage" value="${item.percentage}" style="width: 65px; padding: 4px;" data-index="${index}" title="Percentage" required>
        <span style="color: var(--text-muted); font-size: 0.8rem; margin-right: 6px;">%</span>
        
        <span class="modal-mat-calculated-weight-display" style="font-size: 0.75rem; color: var(--accent-primary); font-weight: 500; min-width: 120px;">
          Comp: ${item.componentWeight || 0}${item.weightUnit || 'g'}, Run: ${item.runnerWeight || 0}${item.weightUnit || 'g'}
        </span>
        
        <select class="form-control modal-mat-weight-unit" data-index="${index}" style="display: none;">
          <option value="g" selected>g</option>
        </select>
        <button type="button" class="btn btn-danger btn-icon-only btn-sm remove-modal-mat" data-index="${index}" style="width: 24px; height: 24px;">&times;</button>
      `;
    } else {
      div.innerHTML = `
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name}">
          ${item.name} 
          ${item.itemCode ? `<span style="font-size: 0.7rem; font-family: monospace; color: var(--accent-tertiary); background: rgba(16, 185, 129, 0.1); padding: 1px 4px; border-radius: 4px; margin-left: 4px; margin-right: 4px;">${item.itemCode}</span>` : ''}
          ${item.invoiceNumber ? `<span style="font-size: 0.7rem; font-family: monospace; color: #a29bfe; background: rgba(162, 155, 254, 0.1); padding: 1px 4px; border-radius: 4px; margin-right: 4px;">INV: ${item.invoiceNumber}</span>` : ''}
          <span style="font-size: 0.75rem; color: var(--text-muted);">(${item.unit})</span>
        </span>
        <input type="number" step="any" min="0.01" class="form-control modal-mat-qty" value="${item.qtyPerUnit}" style="width: 70px; padding: 4px; display: none;" data-index="${index}">
        <input type="text" class="form-control modal-mat-unit" value="${item.unit}" style="width: 55px; padding: 4px;" data-index="${index}" title="Unit" placeholder="pcs">
        <input type="number" step="any" min="0" class="form-control modal-mat-comp-weight" value="${item.componentWeight || 0}" style="width: 60px; padding: 4px;" data-index="${index}" title="Comp. Weight">
        <span style="color: var(--text-muted); font-size: 0.75rem;">(c)</span>
        <input type="number" step="any" min="0" class="form-control modal-mat-run-weight" value="${item.runnerWeight || 0}" style="width: 60px; padding: 4px;" data-index="${index}" title="Runner Weight">
        <span style="color: var(--text-muted); font-size: 0.75rem;">(r)</span>
        <select class="form-control modal-mat-weight-unit" data-index="${index}" title="Weight Unit" style="width: 60px; padding: 4px; font-size: 0.8rem; height: 28px;">
          <option value="g" ${item.weightUnit === 'g' || !item.weightUnit ? 'selected' : ''}>g</option>
          <option value="kg" ${item.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="lbs" ${item.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
          <option value="oz" ${item.weightUnit === 'oz' ? 'selected' : ''}>oz</option>
        </select>
        <button type="button" class="btn btn-danger btn-icon-only btn-sm remove-modal-mat" data-index="${index}" style="width: 24px; height: 24px;">&times;</button>
      `;
    }
    matContainer.appendChild(div);
  });

  // Attach listeners
  matContainer.querySelectorAll('.modal-mat-qty').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.modalSelectedMaterials[idx].qtyPerUnit = parseFloat(e.target.value) || 0;
    });
  });

  matContainer.querySelectorAll('.modal-mat-unit').forEach(input => {
    input.addEventListener('input', e => {
      const idx = e.target.getAttribute('data-index');
      state.modalSelectedMaterials[idx].unit = e.target.value.trim() || 'pcs';
    });
  });

  if (mixEnabled) {
    matContainer.querySelectorAll('.modal-mat-percentage').forEach(input => {
      input.addEventListener('input', e => {
        const idx = e.target.getAttribute('data-index');
        if (state.modalSelectedMaterials[idx]) {
          state.modalSelectedMaterials[idx].percentage = parseFloat(e.target.value) || 0;
        }
        recalculateMixingWeights();
      });
    });
  } else {
    matContainer.querySelectorAll('.modal-mat-comp-weight').forEach(input => {
      input.addEventListener('input', e => {
        const idx = e.target.getAttribute('data-index');
        state.modalSelectedMaterials[idx].componentWeight = parseFloat(e.target.value) || 0;
      });
    });

    matContainer.querySelectorAll('.modal-mat-run-weight').forEach(input => {
      input.addEventListener('input', e => {
        const idx = e.target.getAttribute('data-index');
        state.modalSelectedMaterials[idx].runnerWeight = parseFloat(e.target.value) || 0;
      });
    });

    matContainer.querySelectorAll('.modal-mat-weight-unit').forEach(select => {
      select.addEventListener('change', e => {
        const idx = e.target.getAttribute('data-index');
        state.modalSelectedMaterials[idx].weightUnit = e.target.value;
      });
    });
  }

  matContainer.querySelectorAll('.remove-modal-mat').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-index');
      state.modalSelectedMaterials.splice(idx, 1);
      renderModalSublists();
    });
  });

  if (mixEnabled) {
    recalculateMixingWeights();
  }
}

function recalculateMixingWeights() {
  const mixToggle = document.getElementById('blueprint-mix-toggle');
  const mixEnabled = mixToggle && mixToggle.checked;
  if (!mixEnabled) return;

  const totalComp = parseFloat(document.getElementById('blueprint-mix-comp-weight').value) || 0;
  const totalRun = parseFloat(document.getElementById('blueprint-mix-run-weight').value) || 0;
  const weightUnit = document.getElementById('blueprint-mix-weight-unit').value;

  let sumPercent = 0;
  const pctInputs = document.querySelectorAll('.modal-mat-percentage');
  pctInputs.forEach(input => {
    const idx = parseInt(input.getAttribute('data-index'));
    const val = parseFloat(input.value) || 0;
    sumPercent += val;

    if (state.modalSelectedMaterials[idx]) {
      state.modalSelectedMaterials[idx].percentage = val;
      state.modalSelectedMaterials[idx].componentWeight = parseFloat((totalComp * (val / 100)).toFixed(3));
      state.modalSelectedMaterials[idx].runnerWeight = parseFloat((totalRun * (val / 100)).toFixed(3));
      state.modalSelectedMaterials[idx].weightUnit = weightUnit;
      
      // Update display text inside row
      const row = input.parentElement;
      const display = row.querySelector('.modal-mat-calculated-weight-display');
      if (display) {
        display.innerText = `Comp: ${state.modalSelectedMaterials[idx].componentWeight}${weightUnit}, Run: ${state.modalSelectedMaterials[idx].runnerWeight}${weightUnit}`;
      }
    }
  });

  // Update total percentage sum display
  const sumValEl = document.getElementById('blueprint-mix-percentage-sum-val');
  if (sumValEl) {
    sumValEl.innerText = `${sumPercent.toFixed(1)}%`;
    if (Math.abs(sumPercent - 100) < 0.15) {
      sumValEl.style.color = 'var(--color-success)';
    } else {
      sumValEl.style.color = 'var(--color-danger)';
    }
  }
}

function handleAddPartSubmit(e) {
  e.preventDefault();

  const mixToggle = document.getElementById('blueprint-mix-toggle');
  const mixEnabled = mixToggle && mixToggle.checked;

  // Read current values of materials from the modal container to ensure they are updated
  const matContainer = document.getElementById('new-part-materials-container');
  if (matContainer) {
    const matRows = matContainer.children;
    for (let i = 0; i < matRows.length; i++) {
      const row = matRows[i];
      const qtyInput = row.querySelector('.modal-mat-qty');
      const unitInput = row.querySelector('.modal-mat-unit');
      
      if (state.modalSelectedMaterials[i]) {
        if (qtyInput) state.modalSelectedMaterials[i].qtyPerUnit = parseFloat(qtyInput.value) || 0;
        if (unitInput) state.modalSelectedMaterials[i].unit = unitInput.value.trim() || 'pcs';
        
        if (mixEnabled) {
          const percentageInput = row.querySelector('.modal-mat-percentage');
          if (percentageInput) {
            state.modalSelectedMaterials[i].percentage = parseFloat(percentageInput.value) || 0;
          }
        } else {
          const compWeightInput = row.querySelector('.modal-mat-comp-weight');
          const runWeightInput = row.querySelector('.modal-mat-run-weight');
          const weightUnitSelect = row.querySelector('.modal-mat-weight-unit');
          
          if (compWeightInput) state.modalSelectedMaterials[i].componentWeight = parseFloat(compWeightInput.value) || 0;
          if (runWeightInput) state.modalSelectedMaterials[i].runnerWeight = parseFloat(runWeightInput.value) || 0;
          if (weightUnitSelect) state.modalSelectedMaterials[i].weightUnit = weightUnitSelect.value;
          delete state.modalSelectedMaterials[i].percentage;
        }
      }
    }
  }

  if (mixEnabled) {
    recalculateMixingWeights();
    
    let sumPercent = 0;
    state.modalSelectedMaterials.forEach(m => {
      sumPercent += m.percentage || 0;
    });
    if (Math.abs(sumPercent - 100) > 0.15) {
      if (!confirm(`WARNING: Total mixing percentage is ${sumPercent.toFixed(1)}% (should be 100%).\nDo you want to save anyway?`)) {
        return;
      }
    }
  }

  // Auto-add any pending material details typed in the input fields
  const inputEl = document.getElementById('modal-add-material-input');
  const matName = inputEl ? inputEl.value.trim() : '';
  if (matName) {
    const costEl = document.getElementById('modal-add-material-cost');
    const unitEl = document.getElementById('modal-add-material-unit');
    const qtyInput = document.getElementById('modal-add-material-qty');
    const compWeightInput = document.getElementById('modal-add-material-component-weight');
    const runWeightInput = document.getElementById('modal-add-material-runner-weight');
    const weightUnitEl = document.getElementById('modal-add-material-weight-unit');

    const cost = parseFloat(costEl.value) || 0;
    const unit = unitEl.value.trim() || 'pcs';
    const qty = parseFloat(qtyInput.value) || 1;
    const compWeight = parseFloat(compWeightInput.value) || 0;
    const runWeight = parseFloat(runWeightInput.value) || 0;
    const weightUnit = weightUnitEl ? weightUnitEl.value : 'g';

    if (qty > 0) {
      const catalogItem = state.materialsCatalog.find(m => m.name.toLowerCase() === matName.toLowerCase());
      let materialId = catalogItem ? catalogItem.id : `cust-${generateId()}`;

      if (!state.modalSelectedMaterials.some(m => m.id === materialId)) {
        state.modalSelectedMaterials.push({
          id: materialId,
          name: catalogItem ? catalogItem.name : matName,
          itemCode: catalogItem ? (catalogItem.itemCode || '') : '',
          invoiceNumber: catalogItem ? (catalogItem.invoiceNumber || '') : '',
          qtyPerUnit: qty,
          componentWeight: compWeight,
          runnerWeight: runWeight,
          weightUnit: weightUnit,
          unit: unit,
          cost: cost
        });
      }
    }
  }

  const name = document.getElementById('new-part-name').value.trim();
  const desc = document.getElementById('new-part-desc').value.trim();
  const po = document.getElementById('new-part-po') ? document.getElementById('new-part-po').value.trim() : '';
  const mfgTime = document.getElementById('new-part-mfg-time') ? parseFloat(document.getElementById('new-part-mfg-time').value) || 0 : 0;
  const mfgTimeUnit = document.getElementById('new-part-mfg-time-unit') ? document.getElementById('new-part-mfg-time-unit').value : 'sec';

  if (!name) return;
  if (state.modalSelectedMaterials.length === 0) {
    alert("Blueprint requires at least one material.");
    return;
  }

  if (state.editingBlueprintId) {
    const idx = state.templatesCatalog.findIndex(t => t.id === state.editingBlueprintId);
    if (idx !== -1) {
      state.templatesCatalog[idx].name = name;
      state.templatesCatalog[idx].description = desc || "Custom manufactured part recipe.";
      state.templatesCatalog[idx].poNumber = po;
      state.templatesCatalog[idx].mfgTime = mfgTime;
      state.templatesCatalog[idx].mfgTimeUnit = mfgTimeUnit;
      state.templatesCatalog[idx].materials = JSON.parse(JSON.stringify(state.modalSelectedMaterials));
    }
    
    // Auto-update active estimate if it's currently using the edited template!
    if (state.activeEstimate.templateId === state.editingBlueprintId) {
      const currentQty = state.activeEstimate.quantity;
      const currentMarkup = state.activeEstimate.markup;
      const currentTitle = state.activeEstimate.title;
      
      // Clear active items to reload them cleanly from the updated template
      state.activeEstimate.items = [];
      loadTemplateRecipe(state.editingBlueprintId);
      
      // Restore quantity/markup/title
      state.activeEstimate.quantity = currentQty;
      state.activeEstimate.markup = currentMarkup;
      state.activeEstimate.title = currentTitle;
      calculateActiveEstimate();
    }
    
    state.editingBlueprintId = null;
    saveStateToStorage();
    alert("Part blueprint updated successfully!");
  } else {
    const newPart = {
      id: `tpl-${generateId()}`,
      name,
      description: desc || "Custom manufactured part recipe.",
      poNumber: po,
      mfgTime,
      mfgTimeUnit,
      materials: JSON.parse(JSON.stringify(state.modalSelectedMaterials)),
      operations: [],
      stock: 0
    };
    state.templatesCatalog.push(newPart);
    saveStateToStorage();
    alert("New part blueprint created successfully!");
  }
  
  // Cleanup
  document.getElementById('add-part-form').reset();
  closeAddPartModal();
  
  // Sync
  renderPartsTab();
  populateSelectors();
}

// --- 3. Inventory Tab Management ---
function renderCatalogMaterials() {
  const container = document.getElementById('catalog-materials-grid');
  if (!container) return;

  // Filter materials based on search
  const filtered = state.materialsCatalog.filter(mat => {
    if (!state.searchQuery) return true;
    return mat.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           mat.category.toLowerCase().includes(state.searchQuery.toLowerCase());
  });

  container.innerHTML = '';
  
  filtered.forEach((mat) => {
    const isLowStock = mat.stock < mat.minStock;
    const stockBadge = isLowStock 
      ? `<span class="badge-stock-alert" style="padding: 1px 6px;">Low Stock (Min: ${mat.minStock})</span>` 
      : `<span style="font-size: 0.75rem; color: var(--text-muted);">Min Threshold: ${mat.minStock}</span>`;

    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.id = `mat-card-${mat.id}`;
    card.innerHTML = `
      <div class="catalog-card-header">
        <span class="catalog-card-title">${mat.name}</span>
        <span class="catalog-card-badge">${mat.category}</span>
      </div>
      <div class="catalog-card-details">
        ${mat.itemCode ? `<span><strong>Item Code:</strong> ${mat.itemCode}</span>` : ''}
        ${mat.invoiceNumber ? `<span><strong>Invoice Number:</strong> ${mat.invoiceNumber}</span>` : ''}
        <span><strong>Unit:</strong> ${mat.unit}</span>
        
        <div class="catalog-stock-row">
          <div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">
              Stock: ${mat.stock.toFixed(1)} ${mat.unit}
            </div>
            ${stockBadge}
          </div>
          <div class="catalog-stock-actions">
            <button class="btn-stock-adjust adjust-minus-btn" data-id="${mat.id}" title="Reduce Stock">-</button>
            <button class="btn-stock-adjust adjust-plus-btn" data-id="${mat.id}" title="Restock">+</button>
          </div>
        </div>
      </div>
      <div class="catalog-card-actions" style="margin-top: 14px; padding-top: 10px; display: flex; gap: 6px;">
        <button class="btn btn-secondary btn-icon-only btn-sm add-to-est-mat" data-id="${mat.id}" title="Add to Active Estimate">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="btn btn-secondary btn-icon-only btn-sm edit-cat-mat" data-id="${mat.id}" title="Edit Material">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn btn-danger btn-icon-only btn-sm delete-cat-mat" data-id="${mat.id}" title="Delete from Catalog">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire buttons
  container.querySelectorAll('.add-to-est-mat').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      addMaterialToActiveEstimate(id);
      switchTab('production');
    });
  });

  container.querySelectorAll('.edit-cat-mat').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      openEditMaterialModal(id);
    });
  });

  container.querySelectorAll('.delete-cat-mat').forEach(btn => {
    btn.addEventListener('click', e => {
      if (confirm("Are you sure you want to delete this material from the catalog?")) {
        const id = btn.getAttribute('data-id');
        state.materialsCatalog = state.materialsCatalog.filter(x => x.id !== id);
        saveStateToStorage();
        renderCatalogMaterials();
        populateSelectors();
        updateGlobalAlerts();
      }
    });
  });

  container.querySelectorAll('.adjust-plus-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const amountStr = prompt("Enter quantity to add to stock:");
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        const mat = state.materialsCatalog.find(x => x.id === id);
        if (mat) {
          mat.stock = parseFloat((mat.stock + amount).toFixed(3));
          saveStateToStorage();
          renderCatalogMaterials();
          calculateActiveEstimate();
          updateGlobalAlerts();
        }
      }
    });
  });

  container.querySelectorAll('.adjust-minus-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const amountStr = prompt("Enter quantity to deduct from stock:");
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        const mat = state.materialsCatalog.find(x => x.id === id);
        if (mat) {
          mat.stock = parseFloat(Math.max(0, mat.stock - amount).toFixed(3));
          saveStateToStorage();
          renderCatalogMaterials();
          calculateActiveEstimate();
          updateGlobalAlerts();
        }
      }
    });
  });
}

function openAddMaterialModal() {
  state.editingMaterialId = null;
  const titleEl = document.querySelector('#catalog-material-modal h3');
  if (titleEl) titleEl.innerText = "Create New Inventory Material";
  
  const submitBtn = document.querySelector('#catalog-material-modal button[type="submit"]');
  if (submitBtn) submitBtn.innerText = "Save to Catalog";

  document.getElementById('add-material-form').reset();
  document.getElementById('catalog-material-modal').classList.add('active');
}

function closeAddMaterialModal() {
  document.getElementById('catalog-material-modal').classList.remove('active');
}

function openEditMaterialModal(materialId) {
  const mat = state.materialsCatalog.find(m => m.id === materialId);
  if (!mat) return;

  state.editingMaterialId = materialId;

  const titleEl = document.querySelector('#catalog-material-modal h3');
  if (titleEl) titleEl.innerText = "Edit Inventory Material";

  const submitBtn = document.querySelector('#catalog-material-modal button[type="submit"]');
  if (submitBtn) submitBtn.innerText = "Save Changes";

  document.getElementById('new-mat-name').value = mat.name;
  if (document.getElementById('new-mat-code')) document.getElementById('new-mat-code').value = mat.itemCode || '';
  if (document.getElementById('new-mat-invoice')) document.getElementById('new-mat-invoice').value = mat.invoiceNumber || '';
  document.getElementById('new-mat-category').value = mat.category;
  document.getElementById('new-mat-unit').value = mat.unit;
  document.getElementById('new-mat-cost').value = mat.cost || 0;
  document.getElementById('new-mat-stock').value = mat.stock;
  document.getElementById('new-mat-min').value = mat.minStock;

  document.getElementById('catalog-material-modal').classList.add('active');
}

function handleAddMaterialSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-mat-name').value.trim();
  const itemCode = document.getElementById('new-mat-code') ? document.getElementById('new-mat-code').value.trim() : '';
  const invoiceNumber = document.getElementById('new-mat-invoice') ? document.getElementById('new-mat-invoice').value.trim() : '';
  const category = document.getElementById('new-mat-category').value.trim();
  const unit = document.getElementById('new-mat-unit').value.trim();
  const stock = parseFloat(document.getElementById('new-mat-stock').value) || 0;
  const minStock = parseFloat(document.getElementById('new-mat-min').value) || 0;
  const cost = parseFloat(document.getElementById('new-mat-cost').value);

  if (!name || !category || !unit || isNaN(cost)) return;

  if (state.editingMaterialId) {
    const mat = state.materialsCatalog.find(m => m.id === state.editingMaterialId);
    if (mat) {
      mat.name = name;
      mat.itemCode = itemCode;
      mat.invoiceNumber = invoiceNumber;
      mat.category = category;
      mat.unit = unit;
      mat.cost = cost;
      mat.stock = stock;
      mat.minStock = minStock;
    }
    state.editingMaterialId = null;
  } else {
    const newMat = {
      id: `mat-${generateId()}`,
      name,
      itemCode,
      invoiceNumber,
      category,
      unit,
      cost,
      stock,
      minStock
    };
    state.materialsCatalog.push(newMat);
  }

  saveStateToStorage();
  
  document.getElementById('add-material-form').reset();
  closeAddMaterialModal();
  
  renderCatalogMaterials();
  populateSelectors();
  updateGlobalAlerts();
}

// --- 5. Reports & History Tab ---
function renderHistoryTab() {
  const container = document.getElementById('history-list-container');
  if (!container) return;

  const filteredHistory = state.savedEstimates.filter(est => {
    if (!state.searchQuery) return true;
    return est.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           est.clientName.toLowerCase().includes(state.searchQuery.toLowerCase());
  });

  container.innerHTML = '';

  if (filteredHistory.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-style: italic;">
        No quotes match your search. Make calculations and save them!
      </div>`;
    return;
  }

  filteredHistory.forEach((est) => {
    const card = document.createElement('div');
    card.className = 'estimate-history-card';
    card.innerHTML = `
      <div class="history-info">
        <h4>${est.title}</h4>
        <div class="history-meta">
          <span>📅 ${est.date} at ${est.time}</span>
          <span>📦 Qty: ${est.quantity}</span>
        </div>
      </div>
      <div class="history-totals">
        <div class="history-total-price">
          <div class="label">Quote Price</div>
          <div class="val" style="color: var(--text-primary); font-size: 1.05rem;">${formatCurrency(est.totals.finalPrice)}</div>
        </div>
        <div class="history-actions">
          <button class="btn btn-secondary btn-icon-only edit-hist-btn" data-id="${est.id}" title="Load/Edit Quote">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn btn-secondary btn-icon-only print-hist-btn" data-id="${est.id}" title="Print Invoice PDF">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          </button>
          <button class="btn btn-danger btn-icon-only delete-hist-btn" data-id="${est.id}" title="Delete Quote">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire buttons
  container.querySelectorAll('.edit-hist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      const est = state.savedEstimates.find(x => x.id === id);
      if (est) {
        state.activeMaterialFilter = 'all';
        state.activeEstimate = JSON.parse(JSON.stringify(est));
        document.getElementById('estimate-title-input').value = state.activeEstimate.title;
        const invEl = document.getElementById('invoice-number-input');
        if (invEl) invEl.value = state.activeEstimate.invoiceNumber || '';
        document.getElementById('product-qty-input').value = state.activeEstimate.quantity;
        document.getElementById('markup-slider').value = state.activeEstimate.markup;

        calculateActiveEstimate();
        switchTab('production');
      }
    });
  });

  container.querySelectorAll('.print-hist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      openPrintPreview(id);
    });
  });

  container.querySelectorAll('.delete-hist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      if (confirm("Are you sure you want to permanently delete this estimate from database?")) {
        const id = btn.getAttribute('data-id');
        state.savedEstimates = state.savedEstimates.filter(x => x.id !== id);
        saveStateToStorage();
        renderHistoryTab();
      }
    });
  });
}

// --- 5a. Finished Goods Stock Ledger ---
function renderLedgerTab() {
  const tableBody = document.getElementById('ledger-table-body');
  const emptyMessage = document.getElementById('ledger-empty-message');
  const table = document.querySelector('#ledger-panel table');
  if (!tableBody) return;

  const filteredParts = state.templatesCatalog.filter(tpl => {
    if (!state.searchQuery) return true;
    const query = state.searchQuery.toLowerCase();
    return tpl.name.toLowerCase().includes(query) || 
           (tpl.poNumber && tpl.poNumber.toLowerCase().includes(query));
  });

  tableBody.innerHTML = '';

  if (filteredParts.length === 0) {
    if (table) table.style.display = 'none';
    if (emptyMessage) {
      emptyMessage.style.display = 'block';
      if (state.templatesCatalog.length === 0) {
        emptyMessage.innerText = 'No parts found in the catalog. Go to the Parts tab to create blueprints first.';
      } else {
        emptyMessage.innerText = 'No parts match your search query.';
      }
    }
    return;
  } else {
    if (table) table.style.display = 'table';
    if (emptyMessage) emptyMessage.style.display = 'none';
  }

  filteredParts.forEach(blueprint => {
    // Calculate total dispatched across all dispatches
    let totalDispatched = 0;
    state.dispatches.forEach(disp => {
      if (disp.items && Array.isArray(disp.items)) {
        disp.items.forEach(item => {
          if (item.id === blueprint.id || item.name.toLowerCase() === blueprint.name.toLowerCase()) {
            totalDispatched += parseFloat(item.dispatchedQty) || 0;
          }
        });
      }
    });

    const currentStock = blueprint.stock || 0;
    const totalProduced = currentStock + totalDispatched;
    const poNumber = blueprint.poNumber || '-';

    const tr = document.createElement('tr');
    
    // Highlight based on stock level
    let stockStyle = 'padding: 12px 8px; text-align: right;';
    if (currentStock < 0) {
      stockStyle += ' color: var(--color-danger); font-weight: 700;';
    } else if (currentStock === 0) {
      stockStyle += ' color: var(--text-muted); font-style: italic;';
    } else {
      stockStyle += ' color: var(--accent-tertiary); font-weight: 600;';
    }

    tr.innerHTML = `
      <td style="padding: 12px 8px; color: var(--text-primary); font-weight: 500;">${blueprint.name}</td>
      <td style="padding: 12px 8px; text-align: right; color: var(--text-primary); font-weight: 600;">${totalProduced.toLocaleString()}</td>
      <td style="padding: 12px 8px; text-align: right; color: var(--text-secondary);">${totalDispatched.toLocaleString()}</td>
      <td style="${stockStyle}">${currentStock.toLocaleString()}</td>
      <td style="padding: 12px 8px; text-align: center; color: var(--text-muted);">${poNumber}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- 5b. Dispatch & Shipping Tab ---
function openCreateDispatchModal() {
  const modal = document.getElementById('create-dispatch-modal');
  const prodContainer = document.getElementById('dispatch-products-container');
  const searchInput = document.getElementById('dispatch-product-search');
  const clientInput = document.getElementById('dispatch-client-input');
  const partsContainer = document.getElementById('dispatch-parts-list-container');
  const vehicleInput = document.getElementById('dispatch-vehicle-input');
  const driverInput = document.getElementById('dispatch-driver-input');
  const gatepassInput = document.getElementById('dispatch-gatepass-input');
  const statusSelect = document.getElementById('dispatch-status-select');
  const remarksInput = document.getElementById('dispatch-remarks-input');

  if (!modal || !prodContainer || !partsContainer) return;

  // Clear inputs
  if (searchInput) searchInput.value = '';
  clientInput.value = '';
  vehicleInput.value = '';
  driverInput.value = '';
  if (remarksInput) remarksInput.value = '';
  statusSelect.value = 'Dispatched';
  partsContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">Select one or more products to configure dispatch quantities.</span>';

  // Generate unique Gate Pass number
  const randNum = Math.floor(10000 + Math.random() * 90000);
  gatepassInput.value = `CH-${randNum}`;

  // Populate Saved Products list
  prodContainer.innerHTML = '';
  if (state.templatesCatalog.length === 0) {
    prodContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; padding: 4px;">No products found in the catalog.</span>';
  } else {
    state.templatesCatalog.forEach(blueprint => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'dispatch-prod-checkbox-item';
      itemDiv.style.display = 'flex';
      itemDiv.style.flexDirection = 'column';
      itemDiv.style.padding = '6px';
      itemDiv.style.borderRadius = '6px';
      itemDiv.style.border = '1px solid var(--border-color)';
      itemDiv.style.background = 'rgba(255,255,255,0.02)';
      itemDiv.style.marginBottom = '4px';

      const mainRow = document.createElement('div');
      mainRow.style.display = 'flex';
      mainRow.style.alignItems = 'center';
      mainRow.style.gap = '8px';
      mainRow.style.width = '100%';

      mainRow.innerHTML = `
        <input type="checkbox" class="dispatch-prod-checkbox" value="${blueprint.id}" id="prod-chk-${blueprint.id}" style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;">
        <label for="prod-chk-${blueprint.id}" style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); cursor: pointer; margin-bottom: 0; flex: 1;">
          ${blueprint.name} <span style="font-size: 0.75rem; color: var(--accent-tertiary); font-weight: normal; margin-left: 8px;">(Stock: ${blueprint.stock || 0} pcs)</span>
        </label>
      `;

      itemDiv.appendChild(mainRow);

      // Create inner container for PO list
      const poListContainer = document.createElement('div');
      poListContainer.id = `prod-po-list-${blueprint.id}`;
      poListContainer.className = 'prod-po-list';
      poListContainer.style.display = 'none';
      poListContainer.style.paddingLeft = '24px';
      poListContainer.style.marginTop = '6px';
      poListContainer.style.flexDirection = 'column';
      poListContainer.style.gap = '4px';

      itemDiv.appendChild(poListContainer);
      prodContainer.appendChild(itemDiv);
    });
  }

  modal.classList.add('active');
}

function closeCreateDispatchModal() {
  const modal = document.getElementById('create-dispatch-modal');
  if (modal) modal.classList.remove('active');
}

// Function to filter products by search input
function handleDispatchProductSearch() {
  const query = document.getElementById('dispatch-product-search').value.toLowerCase().trim();
  const items = document.querySelectorAll('.dispatch-prod-checkbox-item');
  
  items.forEach(item => {
    const label = item.querySelector('label').innerText.toLowerCase();
    if (label.includes(query)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

// Function to render PO list under a checked product
function renderProductPOList(blueprintId, containerEl) {
  const blueprint = state.templatesCatalog.find(t => t.id === blueprintId);
  if (!blueprint) return;

  containerEl.innerHTML = '';
  
  // Find all saved estimates containing this blueprint name (case-insensitive)
  const matchingEstimates = [];
  
  state.savedEstimates.forEach(est => {
    let hasPart = false;
    let orderedQty = 0;
    
    if (est.parts && est.parts.length > 0) {
      const partObj = est.parts.find(p => p.name.toLowerCase() === blueprint.name.toLowerCase());
      if (partObj) {
        hasPart = true;
        orderedQty = partObj.quantity || 0;
      }
    } else {
      const hasItem = est.items.some(it => it.partName && it.partName.toLowerCase() === blueprint.name.toLowerCase());
      if (hasItem) {
        hasPart = true;
        orderedQty = est.quantity || 1;
      }
    }
    
    if (hasPart) {
      // Calculate remaining quantity
      let alreadyDispatched = 0;
      state.dispatches.forEach(disp => {
        if (disp.estimateId) {
          const dispEstIds = disp.estimateId.split(',');
          if (dispEstIds.includes(est.id)) {
            const dispItem = disp.items.find(it => it.name.toLowerCase() === blueprint.name.toLowerCase());
            if (dispItem) {
              alreadyDispatched += parseFloat(dispItem.dispatchedQty) || 0;
            }
          }
        }
      });
      
      const remainingQty = Math.max(0, orderedQty - alreadyDispatched);
      
      matchingEstimates.push({
        estimate: est,
        orderedQty: orderedQty,
        remainingQty: remainingQty,
        poNumber: est.parts && est.parts[0] ? (est.parts[0].poNumber || '') : (est.poNumber || '')
      });
    }
  });

  if (matchingEstimates.length === 0) {
    containerEl.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 4px;">No pending POs found for this product.</span>';
    return;
  }

  matchingEstimates.forEach(item => {
    const est = item.estimate;
    const poDisplay = item.poNumber ? `PO: ${item.poNumber}` : 'No PO';
    
    const poDiv = document.createElement('div');
    poDiv.style.display = 'flex';
    poDiv.style.alignItems = 'center';
    poDiv.style.gap = '8px';
    poDiv.style.padding = '2px 4px';
    poDiv.innerHTML = `
      <input type="checkbox" class="dispatch-po-checkbox" 
             data-blueprint-id="${blueprint.id}" 
             data-estimate-id="${est.id}" 
             data-po-number="${item.poNumber || ''}" 
             data-rem-qty="${item.remainingQty}" 
             data-ord-qty="${item.orderedQty}"
             id="po-chk-${blueprint.id}-${est.id}" 
             style="width: 14px; height: 14px; accent-color: var(--accent-secondary); cursor: pointer;">
      <label for="po-chk-${blueprint.id}-${est.id}" style="font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; margin-bottom: 0; flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
        <strong>${poDisplay}</strong> (${est.title} - ${est.clientName || 'General Client'}) [Ordered: ${item.orderedQty}, Rem: ${item.remainingQty}]
      </label>
    `;
    containerEl.appendChild(poDiv);
  });
}

// Handler for when checked products or nested POs change
function handleDispatchProductOrPOChange() {
  const checkedProducts = document.querySelectorAll('.dispatch-prod-checkbox:checked');
  const partsContainer = document.getElementById('dispatch-parts-list-container');
  const clientInput = document.getElementById('dispatch-client-input');
  
  if (!partsContainer) return;

  if (checkedProducts.length === 0) {
    partsContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">Select one or more products to configure dispatch quantities.</span>';
    if (clientInput) clientInput.value = '';
    return;
  }

  partsContainer.innerHTML = '';
  const clientNames = [];

  checkedProducts.forEach(prodCheckbox => {
    const blueprintId = prodCheckbox.value;
    const blueprint = state.templatesCatalog.find(t => t.id === blueprintId);
    if (!blueprint) return;

    // Find checked POs under this product
    const poContainer = document.getElementById(`prod-po-list-${blueprint.id}`);
    const checkedPOs = poContainer ? poContainer.querySelectorAll('.dispatch-po-checkbox:checked') : [];

    let totalOrdered = 0;
    let totalRemaining = 0;
    const poNumbers = [];
    const estimateIds = [];

    if (checkedPOs.length > 0) {
      checkedPOs.forEach(poCheckbox => {
        const estId = poCheckbox.getAttribute('data-estimate-id');
        const poNum = poCheckbox.getAttribute('data-po-number');
        const remQty = parseFloat(poCheckbox.getAttribute('data-rem-qty')) || 0;
        const ordQty = parseFloat(poCheckbox.getAttribute('data-ord-qty')) || 0;

        totalOrdered += ordQty;
        totalRemaining += remQty;
        estimateIds.push(estId);
        if (poNum && !poNumbers.includes(poNum)) {
          poNumbers.push(poNum);
        }

        const estObj = state.savedEstimates.find(e => e.id === estId);
        if (estObj && estObj.clientName) {
          clientNames.push(estObj.clientName);
        }
      });
    } else {
      totalOrdered = 0;
      totalRemaining = 0;
      if (blueprint.poNumber) {
        poNumbers.push(blueprint.poNumber);
      }
    }

    const defaultQty = totalRemaining > 0 ? totalRemaining : 1;
    const poListStr = poNumbers.join(', ');

    const row = document.createElement('div');
    row.className = 'dispatch-part-row';
    row.setAttribute('data-blueprint-id', blueprint.id);
    row.setAttribute('data-estimate-ids', estimateIds.join(','));
    row.style.background = 'rgba(255, 255, 255, 0.01)';
    row.style.border = '1px solid var(--border-color)';
    row.style.borderRadius = 'var(--border-radius-sm)';
    row.style.padding = '12px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '8px';
    row.style.marginBottom = '12px';
    
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0;">
          <input type="checkbox" class="dispatch-part-checkbox" data-id="${blueprint.id}" checked style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;">
          <span style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 250px;">${blueprint.name}</span>
        </label>
        <span style="font-size: 0.75rem; color: var(--text-secondary);">
          ${checkedPOs.length > 0 ? `Ordered PO Qty: ${totalOrdered} (Rem: ${totalRemaining})` : `Direct Dispatch (Stock: ${blueprint.stock || 0})`}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px; display: block;">Qty to Dispatch</label>
          <input type="number" min="0" step="any" class="form-control dispatch-part-qty-input" data-id="${blueprint.id}" data-name="${blueprint.name}" value="${defaultQty}" style="height: 32px; padding: 4px 8px; font-size: 0.85rem; margin: 0;" required>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px; display: block;">Pcs / Box</label>
          <input type="number" min="1" step="any" class="form-control dispatch-part-pcs-per-box-input" data-id="${blueprint.id}" value="50" style="height: 32px; padding: 4px 8px; font-size: 0.85rem; margin: 0;" required>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px; display: block;">Boxes Required</label>
          <div class="dispatch-part-calculated-boxes" style="height: 32px; line-height: 32px; font-size: 0.85rem; font-weight: 700; color: var(--accent-primary);">${Math.ceil(defaultQty / 50)} Box${Math.ceil(defaultQty / 50) !== 1 ? 'es' : ''}</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
        <div class="form-group" style="margin-bottom: 0; display: flex; gap: 8px; align-items: center;">
          <label style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; margin-bottom: 0;">PO Number(s):</label>
          <input type="text" class="form-control dispatch-part-po-input" data-id="${blueprint.id}" value="${poListStr}" placeholder="e.g. 23451, 23452" style="height: 28px; padding: 2px 8px; font-size: 0.8rem; margin: 0; flex: 1;">
        </div>
        <div class="form-group" style="margin-bottom: 0; display: flex; gap: 8px; align-items: center;">
          <label style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; margin-bottom: 0;">Box Dimensions:</label>
          <input type="text" class="form-control dispatch-part-dims-input" data-id="${blueprint.id}" placeholder="e.g. 12x12x12 in" value="12x12x12 in" style="height: 28px; padding: 2px 8px; font-size: 0.8rem; margin: 0; flex: 1;">
        </div>
      </div>
    `;
    partsContainer.appendChild(row);
  });

  if (clientInput && clientNames.length > 0) {
    const uniqueClients = [...new Set(clientNames.filter(Boolean))];
    clientInput.value = uniqueClients.join(', ');
  }
}

function handleCreateDispatchSubmit(e) {
  e.preventDefault();
  
  const checkedPOBoxes = document.querySelectorAll('.dispatch-po-checkbox:checked');
  const clientInput = document.getElementById('dispatch-client-input');
  const vehicleInput = document.getElementById('dispatch-vehicle-input');
  const driverInput = document.getElementById('dispatch-driver-input');
  const gatepassInput = document.getElementById('dispatch-gatepass-input');
  const statusSelect = document.getElementById('dispatch-status-select');
  const remarksInput = document.getElementById('dispatch-remarks-input');
  const qtyInputs = document.querySelectorAll('.dispatch-part-qty-input');

  const estIds = [];
  checkedPOBoxes.forEach(cb => {
    const estId = cb.getAttribute('data-estimate-id');
    if (estId && !estIds.includes(estId)) {
      estIds.push(estId);
    }
  });

  const selectedEstimates = state.savedEstimates.filter(est => estIds.includes(est.id));

  // Compile dispatched items
  const dispatchedItems = [];
  const validationErrors = [];

  qtyInputs.forEach(input => {
    const row = input.closest('.dispatch-part-row');
    const checkbox = row.querySelector('.dispatch-part-checkbox');
    if (checkbox && !checkbox.checked) return; // Skip if unchecked

    const qty = parseFloat(input.value) || 0;
    if (qty > 0) {
      const partId = input.getAttribute('data-id');
      const partName = input.getAttribute('data-name');
      const pcsInput = row.querySelector('.dispatch-part-pcs-per-box-input');
      const dimsInput = row.querySelector('.dispatch-part-dims-input');
      
      const pcsVal = parseFloat(pcsInput.value) || 50;
      const dimsVal = dimsInput.value.trim() || '12x12x12 in';
      const calcBoxes = Math.ceil(qty / pcsVal);

      // Resolve part PO number from user input in the dispatch modal
      const poInput = row.querySelector('.dispatch-part-po-input');
      const partPoNumber = poInput ? poInput.value.trim() : '';

      // Create a descriptive label to distinguish duplicate part names (e.g. PO or stock batch)
      let partLabel = partName;
      if (partPoNumber) {
        partLabel += ` (PO: ${partPoNumber})`;
      } else {
        const infoLabel = row.querySelector('span[style*="font-size: 0.75rem"]');
        if (infoLabel) {
          const infoText = infoLabel.textContent.trim().replace(/\s+/g, ' ');
          partLabel += ` (${infoText})`;
        }
      }

      // Validation: Dispatched quantity must be a multiple of Pcs / Box so all boxes are fully packed
      if (qty % pcsVal !== 0) {
        const fullQty = calcBoxes * pcsVal;
        const lowerQty = (calcBoxes - 1) * pcsVal;
        const neededQty = fullQty - qty;
        validationErrors.push(`Validation Error for "${partLabel}":\nFor ${calcBoxes} box(es), max pieces are ${fullQty} (each box contains ${pcsVal} pcs). You dispatched ${qty} pcs. Add ${neededQty} pcs to full the last box.`);
      }

      dispatchedItems.push({
        id: partId,
        name: partName,
        dispatchedQty: qty,
        pcsPerBox: pcsVal,
        boxDimensions: dimsVal,
        calculatedBoxes: calcBoxes,
        poNumber: partPoNumber
      });
    }
  });

  if (validationErrors.length > 0) {
    alert(validationErrors[0]);
    return; // Do not go forward!
  }

  if (dispatchedItems.length === 0) {
    alert("Please select at least one part to dispatch and enter a quantity greater than 0.");
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const clientNameVal = clientInput.value.trim() || (selectedEstimates.length > 0 ? selectedEstimates.map(est => est.clientName || 'General Client').filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'General Client');

  const newDispatch = {
    id: `DSP-${generateId()}`,
    estimateId: estIds.length > 0 ? estIds.join(',') : 'direct',
    estimateTitle: selectedEstimates.length > 0 ? selectedEstimates.map(est => est.title).join(', ') : 'Direct Stock Dispatch',
    clientName: clientNameVal,
    vehicleNumber: vehicleInput.value.trim(),
    driverName: driverInput.value.trim(),
    gatePass: gatepassInput.value.trim(),
    status: statusSelect.value,
    remarks: remarksInput ? remarksInput.value.trim() : '',
    items: dispatchedItems,
    date: dateStr,
    time: timeStr
  };

  let stockWarning = "";
  dispatchedItems.forEach(item => {
    const blueprint = state.templatesCatalog.find(t => t.id === item.id) ||
                      state.templatesCatalog.find(t => t.name.toLowerCase() === item.name.toLowerCase());
    if (blueprint) {
      const currentStock = blueprint.stock || 0;
      if (currentStock < item.dispatchedQty) {
        stockWarning += `- ${item.name}: dispatching ${item.dispatchedQty} pcs, but finished stock is only ${currentStock} pcs (short by ${item.dispatchedQty - currentStock} pcs)\n`;
      }
    }
  });

  if (stockWarning) {
    if (!confirm(`WARNING: Some parts have insufficient finished stock for this dispatch:\n\n${stockWarning}\nProceeding will push finished stock levels below zero.\n\nDo you want to proceed?`)) {
      return;
    }
  }

  // Deduct from Finished Goods Stock
  dispatchedItems.forEach(item => {
    const blueprint = state.templatesCatalog.find(t => t.id === item.id) ||
                      state.templatesCatalog.find(t => t.name.toLowerCase() === item.name.toLowerCase());
    if (blueprint) {
      blueprint.stock = (blueprint.stock || 0) - item.dispatchedQty;
    }
  });

  state.dispatches.unshift(newDispatch);
  saveStateToStorage();
  closeCreateDispatchModal();
  renderDispatchTab();
  renderDashboardCharts();
  alert("Dispatch successfully logged & Delivery Challan created!");
}

function renderDispatchTab() {
  const container = document.getElementById('dispatch-list-container');
  if (!container) return;

  const filteredDispatches = state.dispatches.filter(disp => {
    if (!state.searchQuery) return true;
    return disp.clientName.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           disp.id.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           disp.estimateTitle.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           (disp.vehicleNumber && disp.vehicleNumber.toLowerCase().includes(state.searchQuery.toLowerCase())) ||
           (disp.driverName && disp.driverName.toLowerCase().includes(state.searchQuery.toLowerCase()));
  });

  container.innerHTML = '';

  const bulkActionsDiv = document.getElementById('dispatch-bulk-actions');
  if (bulkActionsDiv) {
    if (filteredDispatches.length > 0) {
      bulkActionsDiv.style.display = 'flex';
      // Reset select all state
      const selectAllCheckbox = document.getElementById('dispatch-select-all');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      const countSpan = document.getElementById('dispatch-selected-count');
      if (countSpan) countSpan.innerText = '0';
      const printBtn = document.getElementById('print-selected-dispatches-btn');
      if (printBtn) printBtn.disabled = true;
    } else {
      bulkActionsDiv.style.display = 'none';
    }
  }

  if (filteredDispatches.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 40px; text-align: center; color: var(--text-muted); font-style: italic;">
        No dispatch logs found. Click "New Dispatch / Challan" to log one!
      </div>`;
    return;
  }

  filteredDispatches.forEach(disp => {
    const card = document.createElement('div');
    card.className = 'estimate-history-card';
    
    let statusColor = 'var(--text-secondary)';
    if (disp.status === 'Delivered') statusColor = 'var(--color-success)';
    else if (disp.status === 'Dispatched') statusColor = 'var(--color-primary)';
    else if (disp.status === 'In Transit') statusColor = '#f59e0b';

    const itemsSummary = disp.items.map(it => {
      const boxInfo = it.calculatedBoxes ? ` - ${it.calculatedBoxes} Box${it.calculatedBoxes !== 1 ? 'es' : ''} [${it.boxDimensions || '12x12x12 in'}] (${it.pcsPerBox || 50} pcs/box)` : '';
      return `<span style="display: block; margin-bottom: 4px;">• ${it.name}: <strong>${it.dispatchedQty} pcs</strong>${boxInfo}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="no-print" style="margin-right: 15px; display: flex; align-items: center; align-self: stretch;">
        <input type="checkbox" class="dispatch-select-checkbox" data-id="${disp.id}" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary); margin: 0;">
      </div>
      <div class="history-info" style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <h4 style="margin: 0;">${disp.gatePass || disp.id}</h4>
          <span style="font-size: 0.72rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--text-muted); border: 1px solid var(--border-color);">${disp.id}</span>
        </div>
        <div class="history-meta" style="margin-top: 6px; flex-wrap: wrap;">
          <span>📅 ${disp.date} ${disp.time}</span>
          <span>👤 Client: <strong>${disp.clientName}</strong></span>
          ${disp.vehicleNumber ? `<span>🚚 Vehicle: ${disp.vehicleNumber}</span>` : ''}
          ${disp.driverName ? `<span>👤 Driver: ${disp.driverName}</span>` : ''}
        </div>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 8px; line-height: 1.5;">
          <strong>Dispatched Parts & Packaging:</strong>
          <div style="margin-top: 6px;">${itemsSummary}</div>
          ${disp.remarks ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; font-style: italic; border-top: 1px dotted var(--border-color); padding-top: 4px;">Note: ${disp.remarks}</div>` : ''}
        </div>
      </div>
      <div class="history-totals" style="margin-left: 20px;">
        <div class="history-total-price" style="text-align: right;">
          <div class="label" style="font-size: 0.75rem; color: var(--text-muted);">Status</div>
          <div class="val" style="color: ${statusColor}; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; margin-top: 2px;">${disp.status}</div>
        </div>
        <div class="history-actions" style="margin-top: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary btn-icon-only print-disp-btn" data-id="${disp.id}" title="Print Delivery Challan">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          </button>
          <button class="btn btn-secondary btn-icon-only edit-disp-btn" data-id="${disp.id}" title="Edit Status">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn btn-danger btn-icon-only delete-disp-btn" data-id="${disp.id}" title="Delete Dispatch Log">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  const updateBulkPrintState = () => {
    const checkboxes = container.querySelectorAll('.dispatch-select-checkbox');
    const selectedCheckboxes = Array.from(checkboxes).filter(cb => cb.checked);
    const count = selectedCheckboxes.length;

    const countSpan = document.getElementById('dispatch-selected-count');
    if (countSpan) countSpan.innerText = count;

    const printBtn = document.getElementById('print-selected-dispatches-btn');
    if (printBtn) printBtn.disabled = count === 0;

    const selectAllCheckbox = document.getElementById('dispatch-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = (checkboxes.length > 0 && count === checkboxes.length);
    }
  };

  container.querySelectorAll('.dispatch-select-checkbox').forEach(cb => {
    cb.addEventListener('change', updateBulkPrintState);
  });

  // Wire buttons
  container.querySelectorAll('.print-disp-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      openPrintPreviewForDispatch(id);
    });
  });

  container.querySelectorAll('.edit-disp-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.getAttribute('data-id');
      editDispatchStatus(id);
    });
  });

  container.querySelectorAll('.delete-disp-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      if (confirm("Are you sure you want to permanently delete this dispatch record from history?")) {
        const id = btn.getAttribute('data-id');
        state.dispatches = state.dispatches.filter(x => x.id !== id);
        saveStateToStorage();
        renderDispatchTab();
        renderDashboardCharts();
      }
    });
  });
}

function editDispatchStatus(dispatchId) {
  const dispatch = state.dispatches.find(d => d.id === dispatchId);
  if (!dispatch) return;
  
  const statuses = ["Dispatched", "In Transit", "Delivered", "Pending"];
  let statusList = statuses.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  const choice = prompt(`Update shipping status for challan ${dispatch.gatePass || dispatch.id}:\n\nCurrent Status: ${dispatch.status}\n\nSelect a new status number:\n${statusList}`, statuses.indexOf(dispatch.status) + 1);
  
  if (choice === null) return;
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < statuses.length) {
    dispatch.status = statuses[idx];
    saveStateToStorage();
    renderDispatchTab();
  } else {
    alert("Invalid selection. Status not changed.");
  }
}

function openPrintPreviewForDispatch(dispatchId) {
  openPrintPreviewForMultipleDispatches([dispatchId]);
}

function openPrintPreviewForMultipleDispatches(dispatchIds) {
  if (!dispatchIds || dispatchIds.length === 0) return;

  const printArea = document.getElementById('print-area-container');
  if (!printArea) return;

  let fullHTML = '';

  dispatchIds.forEach(dispatchId => {
    const dispatch = state.dispatches.find(d => d.id === dispatchId);
    if (!dispatch) return;

    let itemsRows = '';
    dispatch.items.forEach((it, idx) => {
      // Backwards-compatibility resolver for old dispatch logs missing poNumber
      let itemPo = it.poNumber || '';
      if (!itemPo && dispatch.estimateId) {
        const estIdList = dispatch.estimateId.split(',');
        const est = state.savedEstimates.find(e => estIdList.includes(e.id));
        if (est && est.parts) {
          const part = est.parts.find(p => p.id === it.id);
          if (part) {
            itemPo = part.poNumber || '';
          }
        }
      }

      const boxDims = it.boxDimensions || '12x12x12 in';
      const pcsPer = it.pcsPerBox || '-';
      const totBoxes = it.calculatedBoxes || '-';

      itemsRows += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>
            <div style="font-weight: 600;">${it.name}</div>
            ${itemPo ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;">PO No: ${itemPo}</div>` : ''}
          </td>
          <td style="text-align: right; font-weight: 500;">${it.dispatchedQty}</td>
          <td style="text-align: center; font-size: 0.8rem; color: #475569;">${boxDims}</td>
          <td style="text-align: right; font-size: 0.8rem; color: #475569;">${pcsPer}</td>
          <td style="text-align: right; font-weight: 600;">${totBoxes}</td>
        </tr>`;
    });

    const dateStr = dispatch.date || new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = dispatch.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Format Reference Quote to only show dispatched part names and their PO numbers
    const dispatchedPartNames = dispatch.items.map(it => it.name).join(' + ');
    
    // Resolve unique PO numbers
    const uniquePos = [...new Set(dispatch.items.map(it => {
      let itemPo = it.poNumber || '';
      if (!itemPo && dispatch.estimateId) {
        const estIdList = dispatch.estimateId.split(',');
        const est = state.savedEstimates.find(e => estIdList.includes(e.id));
        if (est && est.parts) {
          const part = est.parts.find(p => p.id === it.id);
          if (part) {
            itemPo = part.poNumber || '';
          }
        }
      }
      return itemPo;
    }).filter(Boolean))];
    const poDisplay = uniquePos.length > 0 ? ` — PO No: ${uniquePos.join(', ')}` : '';

    fullHTML += `
      <div class="estimate-print-sheet">
        <div class="print-header">
          <div class="print-logo-details">
            <h2>TSRP<br>PLAST</h2>
            <p>Professional Manufacturing & Engineering Services</p>
          </div>
          <div class="print-meta-details" style="text-align: right;">
            <h3 style="margin-bottom: 6px; font-size: 1.3rem; letter-spacing: 1px; color: var(--text-primary);">DELIVERY CHALLAN</h3>
            <p><strong>Challan/GP No:</strong> ${dispatch.gatePass || dispatch.id}</p>
            <p><strong>Date:</strong> ${dateStr} ${timeStr}</p>
          </div>
        </div>
        
        <div class="print-addresses" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; margin-bottom: 24px;">
          <div class="print-address-box">
            <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-bottom: 8px;">Consignee (Client Details)</h4>
            <p><strong>Client Representative:</strong> ${dispatch.clientName || 'General Client'}</p>
            <p><strong>Reference Quote:</strong> ${dispatchedPartNames || 'N/A'}${poDisplay}</p>
          </div>
          <div class="print-address-box">
            <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-bottom: 8px;">Transport & Shipping Details</h4>
            <p><strong>Vehicle Number:</strong> ${dispatch.vehicleNumber || 'Self-Pickup / N/A'}</p>
            <p><strong>Driver Name:</strong> ${dispatch.driverName || 'N/A'}</p>
            <p><strong>Status:</strong> ${dispatch.status}</p>
          </div>
        </div>

        <table class="print-table">
          <thead>
            <tr>
              <th style="width: 8%; text-align: center;">Sr No.</th>
              <th style="width: 37%;">Item / Part Name</th>
              <th style="width: 15%; text-align: right;">Qty Shipped</th>
              <th style="width: 15%; text-align: center;">Box Dims</th>
              <th style="width: 12%; text-align: right;">Pcs/Box</th>
              <th style="width: 13%; text-align: right;">Total Boxes</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        ${dispatch.remarks ? `
          <div style="margin-top: 24px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
            <strong>Remarks / Delivery Notes:</strong>
            <p style="margin: 6px 0 0 0; font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">${dispatch.remarks}</p>
          </div>
        ` : ''}

        <div class="print-signature-section" style="margin-top: 60px;">
          <div class="signature-box">
            <p>Prepared By</p>
            <span style="font-size: 0.72rem; color: var(--text-muted);">TSRP PLAST Warehouse</span>
          </div>
          <div class="signature-box">
            <p>Driver / Carrier Signature</p>
          </div>
          <div class="signature-box">
            <p>Receiver's Signature & Seal</p>
          </div>
        </div>

        <div class="print-footer" style="margin-top: 50px;">
          <p>This delivery challan acts as a gate pass and proof of shipment delivery.</p>
          <p style="margin-top: 10px; font-weight: 500;">Thank you for your business!</p>
        </div>
      </div>
    `;
  });

  printArea.innerHTML = fullHTML;

  // Set Modal title
  const printModalTitle = document.querySelector('#print-modal h3');
  if (printModalTitle) {
    if (dispatchIds.length === 1) {
      printModalTitle.innerText = "Delivery Challan PDF Preview";
    } else {
      printModalTitle.innerText = `Multiple Delivery Challans PDF Preview (${dispatchIds.length})`;
    }
  }

  document.getElementById('print-modal').classList.add('active');
}

function downloadEstimateCSV(estimateId) {
  const est = state.savedEstimates.find(x => x.id === estimateId) || state.activeEstimate;
  if (!est) return;

  const delimiter = ",";
  const rows = [];

  // Header Info
  rows.push(["TSRP PLAST SOLUTIONS - ESTIMATE QUOTE"]);
  rows.push([]);
  rows.push(["Quote ID", est.id || "Active Workspace"]);
  rows.push(["Date Generated", est.date || new Date().toLocaleDateString()]);
  rows.push(["Project Title", est.title]);
  rows.push(["Production Quantity", est.quantity]);
  rows.push(["Total Manufacturing Time", formatDurationString(est.totals ? est.totals.totalMfgSeconds : 0)]);
  rows.push(["Target Markup Profit Margin", `${est.markup}%`]);
  rows.push([]);

  // Materials Allocations Header
  rows.push(["MATERIALS ALLOCATIONS"]);
  rows.push(["Material Name", "Item Code", "Invoice Number", "Qty / Unit", "Comp. Wt", "Runner Wt", "Wt. Unit", "Calculated Qty", "Unit", "Unit Cost (INR)", "Total Cost (INR)"]);

  est.items.forEach(it => {
    const compWeight = parseFloat(it.componentWeight) || 0;
    const runWeight = parseFloat(it.runnerWeight) || 0;
    const qtyPerUnit = parseFloat(it.qtyPerUnit) || 0;
    const calcQty = it.calculatedQty || 0;
    const lineCost = calcQty * it.unitCost;
    rows.push([
      it.name,
      it.itemCode || "",
      it.invoiceNumber || "",
      qtyPerUnit.toFixed(2),
      compWeight.toFixed(1),
      runWeight.toFixed(1),
      it.weightUnit || 'g',
      calcQty.toFixed(2),
      it.unit,
      it.unitCost.toFixed(2),
      lineCost.toFixed(2)
    ]);
  });
  rows.push([]);

  // Summary Header
  rows.push(["SUMMARY"]);
  rows.push(["Workshop Production Cost (INR)", est.totals.baseCost.toFixed(2)]);
  rows.push([`Profit Margin Markup (${est.markup}%) (INR)`, est.totals.markupAmount.toFixed(2)]);
  rows.push(["Grand Total Price (INR)", est.totals.finalPrice.toFixed(2)]);

  // Format CSV
  const csvContent = rows.map(e => e.map(val => {
    if (typeof val === 'string') {
      let clean = val.replace(/"/g, '""');
      return `"${clean}"`;
    }
    return val;
  }).join(delimiter)).join("\n");

  // Create downloadable link using Blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = `Estimate_${est.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${est.id || 'active'}.csv`;
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openPrintPreview(estimateId) {
  const estimate = state.savedEstimates.find(x => x.id === estimateId) || state.activeEstimate;
  if (!estimate) return;

  const printArea = document.getElementById('print-area-container');
  let materialRows = '';
  // Group materials by partInstanceId to keep distinct loads separate
  const partGroups = {};
  estimate.items.forEach(item => {
    const key = item.partInstanceId || 'Other';
    if (!partGroups[key]) {
      partGroups[key] = {
        name: item.partName || 'Other/Custom',
        items: []
      };
    }
    partGroups[key].items.push(item);
  });
  // Build rows with part sub-headers
  let partIndex = 1;
  for (const [partInstanceId, group] of Object.entries(partGroups)) {
    let partQty = 1;
    let partPoNumber = '';
    if (estimate.parts) {
      const part = estimate.parts.find(p => p.id === partInstanceId);
      if (part) {
        partQty = part.quantity || 1;
        partPoNumber = part.poNumber || '';
      }
    }
    
    // Fallback search in templates catalog
    if (!partPoNumber) {
      const template = state.templatesCatalog.find(t => t.name === group.name || t.id === estimate.templateId);
      if (template) {
        partPoNumber = template.poNumber || '';
      }
    }

    materialRows += `
      <tr class="print-part-header">
        <td colspan="3" style="font-weight: 600; background: var(--bg-card); padding: 6px;">Part ${partIndex}: ${group.name} (Qty: ${partQty})${partPoNumber ? ` — PO No: ${partPoNumber}` : ''}</td>
      </tr>`;
    partIndex++;
    const items = group.items;
    items.forEach(it => {
      let weightDesc = '';
      if ((it.componentWeight || 0) > 0 || (it.runnerWeight || 0) > 0) {
        const u = it.weightUnit || 'g';
        weightDesc = `
          <div>Comp. Wt: ${it.componentWeight || 0}${u}</div>
          <div style="margin-top: 2px;">Runner Wt: ${it.runnerWeight || 0}${u}</div>
        `;
      } else {
        weightDesc = '-';
      }
      materialRows += `
        <tr>
          <td>
            <div style="font-weight: 600;">${it.name}</div>
            <div style="font-size: 0.72rem; color: rgba(128, 128, 128, 0.85); font-family: monospace; display: flex; flex-wrap: wrap; gap: 8px;">
              ${it.itemCode ? `<span>Code: ${it.itemCode}</span>` : ''}
              ${it.invoiceNumber ? `<span>INV: ${it.invoiceNumber}</span>` : ''}
            </div>
          </td>
          <td style="font-size: 0.82rem; color: #475569; line-height: 1.3;">${weightDesc}</td>
          <td style="text-align: right; font-weight: 500;">${formatWeightForDisplay(it.calculatedQty, it.unit)}</td>
        </tr>`;
    });
  }

  const dateStr = estimate.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = estimate.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  printArea.innerHTML = `
    <div class="estimate-print-sheet">
      <div class="print-header">
        <div class="print-logo-details">
          <h2>TSRP<br>PLAST</h2>
          <p>Professional Manufacturing & Engineering Services</p>
        </div>
        <div class="print-meta-details">
          <h3>Work Estimate</h3>
          <p><strong>Date Generated:</strong> ${dateStr}</p>
          <p><strong>Time Generated:</strong> ${timeStr}</p>
        </div>
      </div>
      
      <div class="print-addresses" style="grid-template-columns: 1fr;">
        <div class="print-address-box">
          <h4>Project Details</h4>
          <p><strong>Project Title:</strong> ${estimate.title}</p>
          <p><strong>Production Qty:</strong> ${estimate.quantity} unit(s)</p>
          <p><strong>Total Mfg. Time:</strong> ${formatDurationString(estimate.totals ? estimate.totals.totalMfgSeconds : 0)}</p>
          ${estimate.parts && estimate.parts.length > 1 ? `
            <div style="font-size: 0.8rem; color: #475569; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
              <strong>Time Breakdown by Part:</strong>
              <ul style="margin: 4px 0 0 0; padding-left: 20px;">
                ${estimate.parts.map((p, idx) => `<li>Part ${idx + 1} (${p.name}): ${formatDurationString(convertToSeconds(p.mfgTime, p.mfgTimeUnit) * (p.quantity || 1))} (Qty: ${p.quantity || 1})</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 40%;">Raw Material</th>
            <th style="width: 35%;">Weight Detail</th>
            <th style="width: 25%; text-align: right;">Calculated Qty</th>
          </tr>
        </thead>
        <tbody>
          ${materialRows}
        </tbody>
      </table>

      <div class="print-totals-section" style="display: none;">
        <table class="print-totals-table">
          <tr>
            <td class="lbl">Raw Material Total:</td>
            <td class="val">${formatCurrency(estimate.totals.materialsCost)}</td>
          </tr>
          <tr>
            <td class="lbl">Workshop Production Cost:</td>
            <td class="val">${formatCurrency(estimate.totals.baseCost)}</td>
          </tr>
          <tr>
            <td class="lbl">Markup / Client Margin (${estimate.markup}%):</td>
            <td class="val">${formatCurrency(estimate.totals.markupAmount)}</td>
          </tr>
          <tr class="grand-total">
            <td class="lbl">Grand Total Quote:</td>
            <td class="val">${formatCurrency(estimate.totals.finalPrice)}</td>
          </tr>
        </table>
      </div>

      <div class="print-signature-section">
        <div class="signature-box">
          <p>Prepared By</p>
          <span>TSRP PLAST Authorized Estimator</span>
        </div>
        <div class="signature-box">
          <p>Person Acceptance</p>
        </div>
      </div>

      <div class="print-footer">
        <p>This document is an engineering/manufacturing material and duration estimate valid for 30 days.</p>
        <p style="margin-top: 10px; font-weight: 500;">Thank you for your business!</p>
      </div>
    </div>
  `;

  const printModalTitle = document.querySelector('#print-modal h3');
  if (printModalTitle) {
    printModalTitle.innerText = "Estimate Quote PDF Preview";
  }

  document.getElementById('print-modal').classList.add('active');
}

function openSummaryPrintPreview() {
  const filteredHistory = state.savedEstimates.filter(est => {
    if (!state.searchQuery) return true;
    return est.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           est.clientName.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
           (est.invoiceNumber && est.invoiceNumber.toLowerCase().includes(state.searchQuery.toLowerCase()));
  });

  if (filteredHistory.length === 0) {
    alert("No historical estimates found to generate a report summary.");
    return;
  }

  // Calculate totals
  let totalEstimates = filteredHistory.length;
  let totalValue = 0;
  let totalMaterialCost = 0;
  let totalMarkupSum = 0;

  filteredHistory.forEach(est => {
    totalValue += (est.totals.finalPrice || 0);
    totalMaterialCost += (est.totals.materialsCost || 0);
    totalMarkupSum += (est.markup || 0);
  });

  const avgMarkup = totalEstimates > 0 ? (totalMarkupSum / totalEstimates).toFixed(1) : 0;
  
  const printArea = document.getElementById('print-area-container');
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let rowHtml = '';
  filteredHistory.forEach(est => {
    rowHtml += `
      <tr>
        <td><strong>${est.id || 'N/A'}</strong></td>
        <td>${est.invoiceNumber || '-'}</td>
        <td>${est.date} <br><span style="font-size: 0.75rem; color: #64748b;">${est.time}</span></td>
        <td>${est.title}</td>
        <td class="right-align">${est.quantity}</td>
        <td class="right-align">${est.markup}%</td>
        <td class="right-align" style="font-weight: 600; color: #1e293b;">${formatCurrency(est.totals.finalPrice)}</td>
      </tr>
    `;
  });

  printArea.innerHTML = `
    <div class="summary-print-sheet">
      <div class="print-header">
        <div class="print-logo-details">
          <h2>TSRP<br>PLAST</h2>
          <p>Professional Manufacturing & Engineering Services</p>
        </div>
        <div class="print-meta-details">
          <h3>History Summary Report</h3>
          <p><strong>Date Generated:</strong> ${dateStr}</p>
          <p><strong>Time Generated:</strong> ${timeStr}</p>
        </div>
      </div>

      <div class="print-kpi-grid">
        <div class="print-kpi-card">
          <div class="lbl">Total Quotes</div>
          <div class="val">${totalEstimates}</div>
        </div>
        <div class="print-kpi-card">
          <div class="lbl">Total Estimated Value</div>
          <div class="val" style="color: #10b981;">${formatCurrency(totalValue)}</div>
        </div>
        <div class="print-kpi-card">
          <div class="lbl">Material Capital Cost</div>
          <div class="val" style="color: #6366f1;">${formatCurrency(totalMaterialCost)}</div>
        </div>
        <div class="print-kpi-card">
          <div class="lbl">Avg markup margin</div>
          <div class="val">${avgMarkup}%</div>
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 15%;">Quote ID</th>
            <th style="width: 15%;">Invoice #</th>
            <th style="width: 15%;">Date & Time</th>
            <th style="width: 25%;">Project Title</th>
            <th style="width: 8%; text-align: right;">Qty</th>
            <th style="width: 8%; text-align: right;">Margin</th>
            <th style="width: 14%; text-align: right;">Total Quote</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>

      <div class="print-signature-section">
        <div class="signature-box">
          <p>Prepared By</p>
          <span>Operations Audit Analyst</span>
        </div>
        <div class="signature-box">
          <p>Reviewed By</p>
          <span>Workshop General Manager</span>
        </div>
      </div>

      <div class="print-footer">
        <p>This is a system-generated summary report of saved estimate logs retrieved from local database records.</p>
        <p style="margin-top: 10px; font-weight: 500;">TSRP Plast Administration</p>
      </div>
    </div>
  `;

  const printModalTitle = document.querySelector('#print-modal h3');
  if (printModalTitle) {
    printModalTitle.innerText = "Quote History PDF Preview";
  }

  document.getElementById('print-modal').classList.add('active');
}

function openPrintPreviewForLedger() {
  const filteredParts = state.templatesCatalog.filter(tpl => {
    if (!state.searchQuery) return true;
    const query = state.searchQuery.toLowerCase();
    return tpl.name.toLowerCase().includes(query) || 
           (tpl.poNumber && tpl.poNumber.toLowerCase().includes(query));
  });

  if (filteredParts.length === 0) {
    alert("No parts found to generate a ledger report.");
    return;
  }

  const printArea = document.getElementById('print-area-container');
  if (!printArea) return;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let rowHtml = '';
  filteredParts.forEach((blueprint, idx) => {
    // Calculate total dispatched
    let totalDispatched = 0;
    state.dispatches.forEach(disp => {
      if (disp.items && Array.isArray(disp.items)) {
        disp.items.forEach(item => {
          if (item.id === blueprint.id) {
            totalDispatched += parseFloat(item.dispatchedQty) || 0;
          }
        });
      }
    });

    const currentStock = blueprint.stock || 0;
    const totalProduced = currentStock + totalDispatched;
    const poNumber = blueprint.poNumber || '-';

    rowHtml += `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${blueprint.name}</strong></td>
        <td style="text-align: right; font-weight: 600;">${totalProduced.toLocaleString()}</td>
        <td style="text-align: right;">${totalDispatched.toLocaleString()}</td>
        <td style="text-align: right; font-weight: 600; color: ${currentStock < 0 ? '#ef4444' : currentStock === 0 ? '#64748b' : '#10b981'};">${currentStock.toLocaleString()}</td>
        <td style="text-align: center;">${poNumber}</td>
      </tr>
    `;
  });

  printArea.innerHTML = `
    <div class="summary-print-sheet">
      <div class="print-header">
        <div class="print-logo-details">
          <h2>TSRP<br>PLAST</h2>
          <p>Professional Manufacturing & Engineering Services</p>
        </div>
        <div class="print-meta-details">
          <h3>Finished Stock Ledger Report</h3>
          <p><strong>Date Generated:</strong> ${dateStr}</p>
          <p><strong>Time Generated:</strong> ${timeStr}</p>
        </div>
      </div>

      <table class="print-table" style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">S.No</th>
            <th style="width: 37%;">Part Name</th>
            <th style="width: 15%; text-align: right;">Total Produced (A)</th>
            <th style="width: 15%; text-align: right;">Total Dispatched (B)</th>
            <th style="width: 15%; text-align: right;">Current Stock (A - B)</th>
            <th style="width: 10%; text-align: center;">PO Number</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>

      <div class="print-signature-section" style="margin-top: 30px;">
        <div class="signature-box">
          <p>Prepared By</p>
          <span>Store Officer / Operations</span>
        </div>
        <div class="signature-box">
          <p>Authorized By</p>
          <span>Plant Head / Manager</span>
        </div>
      </div>

      <div class="print-footer">
        <p>This is a system-generated stock ledger report representing finished goods manufactured, dispatched, and balance stock left.</p>
        <p style="margin-top: 10px; font-weight: 500;">TSRP Plast Administration</p>
      </div>
    </div>
  `;

  const printModalTitle = document.querySelector('#print-modal h3');
  if (printModalTitle) {
    printModalTitle.innerText = "Stock Ledger PDF Preview";
  }

  document.getElementById('print-modal').classList.add('active');
}

function closePrintPreview() {
  document.getElementById('print-modal').classList.remove('active');
}

// --- Database Backup & Restore ---
function exportDatabaseBackup() {
  try {
    const backupData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      materials: JSON.parse(localStorage.getItem('ws_materials')) || [],
      operations: JSON.parse(localStorage.getItem('ws_operations')) || [],
      templates: JSON.parse(localStorage.getItem('ws_templates')) || [],
      estimates: JSON.parse(localStorage.getItem('ws_estimates')) || [],
      dispatches: JSON.parse(localStorage.getItem('ws_dispatches')) || [],
      theme: localStorage.getItem('ws_calc_theme') || 'dark'
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `TSRP_PLAST_Database_Backup_${dateStr}.json`;
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Failed to export backup: " + err.message);
  }
}

function importDatabaseBackup(file) {
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backupData = JSON.parse(e.target.result);
      
      // Validation check
      if (!backupData.materials || !backupData.templates || !backupData.estimates) {
        throw new Error("Invalid backup file format. Missing essential database sections.");
      }
      
      const confirmRestore = confirm(
        "WARNING: Importing this backup will overwrite all current materials, saved blueprints, and quote histories.\n\nAre you sure you want to proceed?"
      );
      if (!confirmRestore) return;

      // Save to local storage
      localStorage.setItem('ws_materials', JSON.stringify(backupData.materials));
      localStorage.setItem('ws_operations', JSON.stringify(backupData.operations || []));
      localStorage.setItem('ws_templates', JSON.stringify(backupData.templates));
      localStorage.setItem('ws_estimates', JSON.stringify(backupData.estimates));
      localStorage.setItem('ws_dispatches', JSON.stringify(backupData.dispatches || []));
      if (backupData.theme) {
        localStorage.setItem('ws_calc_theme', backupData.theme);
      }

      alert("Database successfully restored! Reloading...");
      window.location.reload();
      
    } catch(err) {
      alert("Error parsing backup file: " + err.message);
    }
  };
  reader.readAsText(file);
}



// --- Blueprint templates load/reset hooks ---
function loadTemplateRecipe(templateId) {
  const template = state.templatesCatalog.find(t => t.id === templateId);
  if (!template) return;

  state.activeMaterialFilter = 'all';

  // Generate a unique identifier for this part instance
  const partInstanceId = 'inst-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

  const newItems = template.materials.map(m => {
    const catalogItem = state.materialsCatalog.find(x => x.id === m.id) ||
                        state.materialsCatalog.find(x => x.name.toLowerCase() === m.name.toLowerCase()) || m;
    return {
      id: m.id,
      name: m.name,
      partName: template.name,
      partInstanceId: partInstanceId,
      itemCode: catalogItem.itemCode || m.itemCode || '',
      invoiceNumber: catalogItem.invoiceNumber || m.invoiceNumber || '',
      qtyPerUnit: m.qtyPerUnit,
      componentWeight: m.componentWeight || 0,
      runnerWeight: m.runnerWeight || 0,
      weightUnit: m.weightUnit || 'g',
      unit: catalogItem.unit || m.unit || 'kg', // Prioritize inventory catalog unit
      unitCost: m.cost,
      stock: catalogItem.stock || 0,
      minStock: catalogItem.minStock || 0
    };
  });

  if (state.activeEstimate.items.length === 0) {
    state.activeEstimate.title = `Estimate: ${template.name}`;
    state.activeEstimate.items = newItems;
    state.activeEstimate.mfgTime = template.mfgTime || 0;
    state.activeEstimate.mfgTimeUnit = template.mfgTimeUnit || 'sec';
    state.activeEstimate.templateId = templateId;
    state.activeEstimate.parts = [{
      id: partInstanceId,
      name: template.name,
      poNumber: template.poNumber || '',
      mfgTime: template.mfgTime || 0,
      mfgTimeUnit: template.mfgTimeUnit || 'sec',
      quantity: 1 // Default to 1 for fresh start!
    }];
  } else {
    // Append to active items list
    newItems.forEach(newItem => {
      state.activeEstimate.items.push(newItem);
    });
    // Append template name to title if not already present
    if (!state.activeEstimate.title.includes(template.name)) {
      state.activeEstimate.title += ` + ${template.name}`;
    }
    // Combine manufacturing times
    const currentSeconds = convertToSeconds(state.activeEstimate.mfgTime || 0, state.activeEstimate.mfgTimeUnit || 'sec');
    const newSeconds = convertToSeconds(template.mfgTime || 0, template.mfgTimeUnit || 'sec');
    state.activeEstimate.mfgTime = currentSeconds + newSeconds;
    state.activeEstimate.mfgTimeUnit = 'sec';
    state.activeEstimate.templateId = null; // Mixed estimate
    
    if (!state.activeEstimate.parts) state.activeEstimate.parts = [];
    state.activeEstimate.parts.push({
      id: partInstanceId,
      name: template.name,
      poNumber: template.poNumber || '',
      mfgTime: template.mfgTime || 0,
      mfgTimeUnit: template.mfgTimeUnit || 'sec',
      quantity: 1 // Default to 1 for fresh start!
    });
  }
  
  state.activeEstimate.labor = [];

  document.getElementById('estimate-title-input').value = state.activeEstimate.title;
  document.getElementById('client-name-input').value = state.activeEstimate.clientName;
  document.getElementById('product-qty-input').value = state.activeEstimate.quantity;

  calculateActiveEstimate();
}

function resetEstimator() {
  state.activeMaterialFilter = 'all';
  state.activeEstimate = {
    title: 'New Estimate',
    clientName: 'Walk-in Client',
    quantity: 1,
    markup: 30,
    items: [],
    labor: [],
    mfgTime: 0,
    mfgTimeUnit: 'sec',
    templateId: null,
    parts: []
  };

  document.getElementById('estimate-title-input').value = state.activeEstimate.title;
  document.getElementById('client-name-input').value = state.activeEstimate.clientName;
  document.getElementById('product-qty-input').value = state.activeEstimate.quantity;
  document.getElementById('template-select').value = '';

  calculateActiveEstimate();
}

function addMaterialToActiveEstimate(materialId) {
  const catalogItem = state.materialsCatalog.find(m => m.id === materialId);
  if (!catalogItem) return;

  state.activeMaterialFilter = 'all';
  state.activeEstimate.items.push({
    id: catalogItem.id,
    name: catalogItem.name,
    itemCode: catalogItem.itemCode || '',
    invoiceNumber: catalogItem.invoiceNumber || '',
    qtyPerUnit: 1,
    componentWeight: 0,
    runnerWeight: 0,
    weightUnit: 'g',
    unit: catalogItem.unit,
    unitCost: catalogItem.cost,
    stock: catalogItem.stock || 0,
    minStock: catalogItem.minStock || 0
  });

  calculateActiveEstimate();
}

function addLaborToActiveEstimate(operationId) {
  const catalogItem = state.operationsCatalog.find(o => o.id === operationId);
  if (!catalogItem) return;

  state.activeEstimate.labor.push({
    id: catalogItem.id,
    name: catalogItem.name,
    setupTime: 10,
    runTime: 10,
    hourlyRate: catalogItem.rate
  });

  calculateActiveEstimate();
}

function saveActiveEstimate() {
  if (state.activeEstimate.items.length === 0 && state.activeEstimate.labor.length === 0) {
    alert("Cannot save an empty estimate. Add materials or labor first.");
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  const savedEstimate = {
    id: state.activeEstimate.id || generateId(),
    title: state.activeEstimate.title || 'Untitled Estimate',
    clientName: state.activeEstimate.clientName || 'General Client',
    quantity: state.activeEstimate.quantity,
    markup: state.activeEstimate.markup,
    mfgTime: state.activeEstimate.mfgTime || 0,
    mfgTimeUnit: state.activeEstimate.mfgTimeUnit || 'sec',
    parts: JSON.parse(JSON.stringify(state.activeEstimate.parts || [])),
    items: JSON.parse(JSON.stringify(state.activeEstimate.items)),
    labor: JSON.parse(JSON.stringify(state.activeEstimate.labor)),
    totals: JSON.parse(JSON.stringify(state.activeEstimate.totals)),
    date: dateStr,
    time: timeStr
  };

  state.activeEstimate.id = savedEstimate.id;

  const existingIdx = state.savedEstimates.findIndex(e => e.id === savedEstimate.id);
  if (existingIdx > -1) {
    state.savedEstimates[existingIdx] = savedEstimate;
  } else {
    state.savedEstimates.unshift(savedEstimate);
  }

  saveStateToStorage();
  alert("Estimate successfully saved to database!");
}

function bookOrderAndDeductStock() {
  if (state.activeEstimate.items.length === 0) {
    alert("No materials in estimate. Add materials before fulfilling.");
    return;
  }

  const insufficientItems = state.activeEstimate.items.filter(item => {
    return (item.stock || 0) < (item.calculatedQty || 0);
  });

  let confirmMsg = "Fulfill this order and deduct materials from inventory?\n\n";
  if (insufficientItems.length > 0) {
    confirmMsg = "WARNING: Some materials have insufficient stock for this order:\n";
    insufficientItems.forEach(item => {
      const short = (item.calculatedQty || 0) - (item.stock || 0);
      confirmMsg += `- ${item.name}: short by ${short.toFixed(1)} ${item.unit}\n`;
    });
    confirmMsg += "\nProceeding will push inventory levels below zero (backorder).\n\nDo you want to proceed?";
  } else {
    confirmMsg += `Total estimated material cost to issue: ${formatCurrency(state.activeEstimate.totals.materialsCost)}\n\nConfirm deduction?`;
  }

  if (!confirm(confirmMsg)) return;

  state.activeEstimate.items.forEach(item => {
    const catalogItem = state.materialsCatalog.find(m => m.id === item.id) ||
                        state.materialsCatalog.find(m => m.name.toLowerCase() === item.name.toLowerCase());
    if (catalogItem) {
      catalogItem.stock = parseFloat((catalogItem.stock - item.calculatedQty).toFixed(3));
      item.id = catalogItem.id; // Sync the item ID with catalog ID
    }
  });

  // Increment finished stock of the blueprints/parts being manufactured
  if (state.activeEstimate.parts && state.activeEstimate.parts.length > 0) {
    state.activeEstimate.parts.forEach(part => {
      const blueprint = state.templatesCatalog.find(t => t.name === part.name);
      if (blueprint) {
        blueprint.stock = (blueprint.stock || 0) + (part.quantity || 0);
      }
    });
  } else {
    // Fallback to legacy behavior
    const templateId = state.activeEstimate.templateId;
    if (templateId) {
      const blueprint = state.templatesCatalog.find(t => t.id === templateId);
      if (blueprint) {
        blueprint.stock = (blueprint.stock || 0) + (state.activeEstimate.quantity || 1);
      }
    }
  }

  saveStateToStorage();
  calculateActiveEstimate(); 
  updateGlobalAlerts();
  
  // Sync dashboard if active
  renderDashboardCharts();
  
  alert("Order successfully processed! Materials issued and stock levels updated.");
}

function saveActiveAsTemplate() {
  if (state.activeEstimate.items.length === 0 && state.activeEstimate.labor.length === 0) {
    alert("Cannot save an empty estimate as a template.");
    return;
  }
  
  const name = prompt("Enter template recipe name:", state.activeEstimate.title.replace("Estimate: ", ""));
  if (!name) return;
  const desc = prompt("Enter a brief description for this recipe template:");
  
  const newTemplate = {
    id: `tpl-${generateId()}`,
    name: name,
    description: desc || "Saved from customized estimate.",
    materials: state.activeEstimate.items.map(m => ({
      id: m.id,
      name: m.name,
      qtyPerUnit: m.qtyPerUnit,
      componentWeight: m.componentWeight || 0,
      runnerWeight: m.runnerWeight || 0,
      weightUnit: m.weightUnit || 'g',
      unit: m.unit,
      cost: m.unitCost
    })),
    operations: state.activeEstimate.labor.map(o => ({
      id: o.id,
      name: o.name,
      setupTime: o.setupTime,
      runTime: o.runTime,
      rate: o.hourlyRate
    }))
  };

  state.templatesCatalog.push(newTemplate);
  saveStateToStorage();
  
  populateSelectors();
  alert("Successfully saved as recipe template!");
}

function updateGlobalAlerts() {
  const lowStockItems = state.materialsCatalog.filter(m => m.stock < m.minStock);
  const badge = document.getElementById('bell-badge');
  const list = document.getElementById('notification-list');
  
  if (!badge || !list) return;

  if (lowStockItems.length > 0) {
    badge.innerText = lowStockItems.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  if (lowStockItems.length === 0) {
    list.innerHTML = `<div class="notification-empty">No low stock alerts. All materials are fully stocked.</div>`;
  } else {
    list.innerHTML = '';
    lowStockItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'notification-item';
      div.innerHTML = `
        <div class="title">${item.name}</div>
        <div class="desc">
          <span>Stock: ${item.stock.toFixed(1)} / Min: ${item.minStock} ${item.unit}</span>
          <span style="color: var(--color-danger); font-weight: 600;">Short by ${(item.minStock - item.stock).toFixed(1)}</span>
        </div>
      `;
      list.appendChild(div);
    });
  }
}

// --- Wire Selectors & Dropdowns ---
function populateSelectors() {
  const tplSelect = document.getElementById('template-select');
  if (!tplSelect) return;
  tplSelect.innerHTML = `<option value="" disabled selected>-- Select a Part Blueprint --</option>`;
  state.templatesCatalog.forEach(tpl => {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.innerText = tpl.poNumber ? `${tpl.name} (PO: ${tpl.poNumber})` : tpl.name;
    tplSelect.appendChild(opt);
  });

  const addMatSelect = document.getElementById('add-material-select');
  addMatSelect.innerHTML = `<option value="" disabled selected>+ Add Custom Raw Material</option>`;
  const categories = {};
  state.materialsCatalog.forEach(m => {
    if (!categories[m.category]) categories[m.category] = [];
    categories[m.category].push(m);
  });
  for (const cat in categories) {
    const group = document.createElement('optgroup');
    group.label = cat;
    categories[cat].forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = `${m.name} (${formatCurrency(m.cost)}/${m.unit})`;
      group.appendChild(opt);
    });
    addMatSelect.appendChild(group);
  }

  const addLabSelect = document.getElementById('add-labor-select');
  if (addLabSelect) {
    addLabSelect.innerHTML = `<option value="" disabled selected>+ Add Custom Operation</option>`;
    state.operationsCatalog.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op.id;
      opt.innerText = `${op.name} (${formatCurrency(op.rate)}/hr)`;
      addLabSelect.appendChild(opt);
    });
  }
}

// --- Module Search & Filter Actions ---
function handleSearchFilter(e) {
  state.searchQuery = e.target.value.trim();
  refreshActiveTabContent();

  const resultsDiv = document.getElementById('global-search-results');
  if (!resultsDiv) return;

  const query = state.searchQuery.toLowerCase();
  if (!query) {
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
    return;
  }

  // Search blueprints
  const matchingParts = state.templatesCatalog.filter(tpl => 
    tpl.name.toLowerCase().includes(query) || 
    (tpl.description && tpl.description.toLowerCase().includes(query))
  );

  // Search materials
  const matchingMaterials = state.materialsCatalog.filter(mat => 
    mat.name.toLowerCase().includes(query) || 
    mat.category.toLowerCase().includes(query)
  );

  // Search saved quotes
  const matchingQuotes = state.savedEstimates.filter(est => 
    est.title.toLowerCase().includes(query) || 
    est.clientName.toLowerCase().includes(query)
  );

  const totalResults = matchingParts.length + matchingMaterials.length + matchingQuotes.length;

  if (totalResults === 0) {
    resultsDiv.innerHTML = `
      <div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center; font-style: italic;">
        No database records found
      </div>`;
    resultsDiv.style.display = 'block';
    return;
  }

  let html = '';

  // Render Parts
  matchingParts.forEach(tpl => {
    html += `
      <div class="search-result-item" data-type="part" data-id="${tpl.id}">
        <span>📦</span>
        <span style="font-weight: 500;">${tpl.name}</span>
        <span class="search-result-type part">Blueprint</span>
      </div>`;
  });

  // Render Materials
  matchingMaterials.forEach(mat => {
    html += `
      <div class="search-result-item" data-type="material" data-id="${mat.id}">
        <span>📚</span>
        <span style="font-weight: 500;">${mat.name}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">(${formatCurrency(mat.cost)})</span>
        <span class="search-result-type material">Material</span>
      </div>`;
  });

  // Render Quotes
  matchingQuotes.forEach(est => {
    html += `
      <div class="search-result-item" data-type="quote" data-id="${est.id}">
        <span>📄</span>
        <span style="font-weight: 500;">${est.title}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">(${est.clientName})</span>
        <span class="search-result-type quote">Quote</span>
      </div>`;
  });

  resultsDiv.innerHTML = html;
  resultsDiv.style.display = 'block';

  // Wire search item clicks
  resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-type');
      const id = item.getAttribute('data-id');

      // Clear search
      document.getElementById('module-search').value = '';
      state.searchQuery = '';
      resultsDiv.style.display = 'none';
      refreshActiveTabContent();

      if (type === 'part') {
        loadTemplateRecipe(id);
        switchTab('production');
      } else if (type === 'material') {
        switchTab('inventory');
        // Smooth scroll and highlight card
        setTimeout(() => {
          const card = document.getElementById(`mat-card-${id}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-glow');
            setTimeout(() => card.classList.remove('highlight-glow'), 2200);
          }
        }, 150);
      } else if (type === 'quote') {
        switchTab('reports');
        setTimeout(() => {
          openPrintPreview(id);
        }, 150);
      }
    });
  });
}

function refreshActiveTabContent() {
  switch (state.activeTab) {
    case 'dashboard':
      renderDashboardCharts();
      break;
    case 'parts':
      renderPartsTab();
      break;
    case 'inventory':
      renderCatalogMaterials();
      break;
    case 'dispatch':
      renderDispatchTab();
      break;
    case 'ledger':
      renderLedgerTab();
      break;
    case 'reports':
      renderHistoryTab();
      break;
  }
}

// --- Tab Controller ---
function switchTab(tabId) {
  state.activeTab = tabId;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    if (panel.id === `${tabId}-panel`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Trigger tab builders
  if (tabId === 'dashboard') {
    renderDashboardCharts();
  } else if (tabId === 'parts') {
    renderPartsTab();
  } else if (tabId === 'inventory') {
    renderCatalogMaterials();
  } else if (tabId === 'dispatch') {
    renderDispatchTab();
  } else if (tabId === 'ledger') {
    renderLedgerTab();
  } else if (tabId === 'reports') {
    renderHistoryTab();
  }
}

// --- Core Event Listeners & Bootstrapping ---
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromStorage();
  populateSelectors();
  updateGlobalAlerts();
  
  // Initial load
  renderDashboardCharts();

  // Tab switching
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'));
    });
  });

  // Search filter keyups
  document.getElementById('module-search').addEventListener('input', handleSearchFilter);

  // Estimator Workspace listeners
  document.getElementById('estimate-title-input').addEventListener('input', e => {
    state.activeEstimate.title = e.target.value;
  });
  document.getElementById('client-name-input').addEventListener('input', e => {
    state.activeEstimate.clientName = e.target.value;
  });
  document.getElementById('product-qty-input').addEventListener('input', e => {
    const newQty = Math.max(1, parseInt(e.target.value) || 1);
    state.activeEstimate.quantity = newQty;
    calculateActiveEstimate();
  });
  document.getElementById('template-select').addEventListener('change', e => {
    if (e.target.value) {
      loadTemplateRecipe(e.target.value);
      e.target.value = '';
    }
  });
  document.getElementById('markup-slider').addEventListener('input', e => {
    state.activeEstimate.markup = parseInt(e.target.value) || 0;
    calculateActiveEstimate();
  });
  document.getElementById('add-material-select').addEventListener('change', e => {
    addMaterialToActiveEstimate(e.target.value);
    e.target.value = '';
  });
  document.getElementById('material-allocation-filter').addEventListener('change', e => {
    state.activeMaterialFilter = e.target.value;
    renderMaterialRows();
  });
  const addLaborSelectEl = document.getElementById('add-labor-select');
  if (addLaborSelectEl) {
    addLaborSelectEl.addEventListener('change', e => {
      addLaborToActiveEstimate(e.target.value);
      e.target.value = '';
    });
  }

  // Estimator Actions
  document.getElementById('save-estimate-btn').addEventListener('click', saveActiveEstimate);
  document.getElementById('reset-estimate-btn').addEventListener('click', resetEstimator);
  document.getElementById('save-recipe-btn').addEventListener('click', saveActiveAsTemplate);
  document.getElementById('preview-pdf-btn').addEventListener('click', () => {
    openPrintPreview();
  });
  document.getElementById('book-order-btn').addEventListener('click', bookOrderAndDeductStock);

  // Notification Bell
  document.getElementById('notification-bell').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notification-dropdown').classList.toggle('active');
  });
  document.addEventListener('click', (e) => {
    const drop = document.getElementById('notification-dropdown');
    if (drop) drop.classList.remove('active');

    const searchContainer = document.querySelector('.sidebar-search-container');
    const resultsDiv = document.getElementById('global-search-results');
    if (resultsDiv && searchContainer && !searchContainer.contains(e.target)) {
      resultsDiv.style.display = 'none';
    }
  });
  const notifDropdown = document.getElementById('notification-dropdown');
  if (notifDropdown) {
    notifDropdown.addEventListener('click', e => e.stopPropagation());
  }

  // Modals hooks
  // Material creation
  document.getElementById('open-add-material-modal').addEventListener('click', openAddMaterialModal);
  document.getElementById('close-mat-modal').addEventListener('click', closeAddMaterialModal);
  document.getElementById('add-material-form').addEventListener('submit', handleAddMaterialSubmit);
  
  // Parts blueprint creation
  document.getElementById('open-add-part-modal').addEventListener('click', openAddPartModal);
  document.getElementById('close-part-modal').addEventListener('click', closeAddPartModal);
  document.getElementById('add-part-form').addEventListener('submit', handleAddPartSubmit);

  // Autocomplete autofill for blueprint creation materials
  const modalMatInput = document.getElementById('modal-add-material-input');
  if (modalMatInput) {
    modalMatInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const found = state.materialsCatalog.find(m => m.name.toLowerCase() === val.toLowerCase());
      if (found) {
        const costEl = document.getElementById('modal-add-material-cost');
        const unitEl = document.getElementById('modal-add-material-unit');
        if (costEl) costEl.value = found.cost;
        if (unitEl) unitEl.value = found.unit;
      }
    });
  }

  // Modal material sublist
  document.getElementById('modal-add-material-btn').addEventListener('click', () => {
    const inputEl = document.getElementById('modal-add-material-input');
    const name = inputEl.value.trim();
    if (!name) return;

    const costEl = document.getElementById('modal-add-material-cost');
    const unitEl = document.getElementById('modal-add-material-unit');
    const qtyInput = document.getElementById('modal-add-material-qty');
    const compWeightInput = document.getElementById('modal-add-material-component-weight');
    const runWeightInput = document.getElementById('modal-add-material-runner-weight');
    const weightUnitEl = document.getElementById('modal-add-material-weight-unit');

    const cost = parseFloat(costEl.value) || 0;
    const unit = unitEl.value.trim() || 'pcs';
    const qty = parseFloat(qtyInput.value) || 1;
    const compWeight = parseFloat(compWeightInput.value) || 0;
    const runWeight = parseFloat(runWeightInput.value) || 0;
    const weightUnit = weightUnitEl ? weightUnitEl.value : 'g';

    if (qty <= 0) {
      alert("Quantity must be greater than 0.");
      return;
    }

    // Check if matching material exists in catalog
    const catalogItem = state.materialsCatalog.find(m => m.name.toLowerCase() === name.toLowerCase());
    
    let materialId;
    if (catalogItem) {
      materialId = catalogItem.id;
    } else {
      // Check if this custom name is already added
      if (state.modalSelectedMaterials.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        alert("Material already added to blueprint.");
        return;
      }
      materialId = `cust-${generateId()}`;
    }

    // Check if ID is already added
    if (state.modalSelectedMaterials.some(m => m.id === materialId)) {
      alert("Material already added to blueprint.");
      return;
    }

    state.modalSelectedMaterials.push({
      id: materialId,
      name: catalogItem ? catalogItem.name : name,
      qtyPerUnit: qty,
      componentWeight: compWeight,
      runnerWeight: runWeight,
      weightUnit: weightUnit,
      unit: unit,
      cost: cost
    });
    renderModalSublists();
    
    // Reset inputs
    inputEl.value = '';
    costEl.value = '0';
    unitEl.value = 'pcs';
    qtyInput.value = '1';
    if (compWeightInput) compWeightInput.value = '0';
    if (runWeightInput) runWeightInput.value = '0';
    if (weightUnitEl) weightUnitEl.value = 'g';
  });



  // Print modal closures
  document.getElementById('close-print-modal').addEventListener('click', closePrintPreview);
  document.getElementById('execute-print-btn').addEventListener('click', () => {
    window.print();
  });

  // Print summary report
  const printSummaryBtn = document.getElementById('print-summary-report-btn');
  if (printSummaryBtn) {
    printSummaryBtn.addEventListener('click', () => {
      openSummaryPrintPreview();
    });
  }

  // Database Backup Actions
  const dbBackupBtn = document.getElementById('db-backup-btn');
  if (dbBackupBtn) {
    dbBackupBtn.addEventListener('click', exportDatabaseBackup);
  }

  const dbRestoreBtn = document.getElementById('db-restore-btn');
  const dbRestoreInput = document.getElementById('db-restore-input');
  if (dbRestoreBtn && dbRestoreInput) {
    dbRestoreBtn.addEventListener('click', () => {
      dbRestoreInput.click();
    });
    dbRestoreInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importDatabaseBackup(file);
      }
      dbRestoreInput.value = '';
    });
  }

  // Theme Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('ws_calc_theme', state.theme);
    
    const themeTextEl = document.getElementById('theme-toggle-text');
    if (state.theme === 'dark') {
      themeTextEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        Switch to Light
      `;
    } else {
      themeTextEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        Switch to Dark
      `;
    }

    calculateActiveEstimate();
    renderDashboardCharts(); // Redraw dashboard charts for the theme
  });

  // Purple Tool Button Quick Action (Quick shortcut to open Part modal)
  document.getElementById('purple-tool-btn').addEventListener('click', () => {
    switchTab('parts');
    openAddPartModal();
  });

  // Dispatch Modal Triggers
  const openDispatchBtn = document.getElementById('open-create-dispatch-btn');
  if (openDispatchBtn) {
    openDispatchBtn.addEventListener('click', openCreateDispatchModal);
  }

  const dispatchProdContainer = document.getElementById('dispatch-products-container');
  if (dispatchProdContainer) {
    dispatchProdContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('dispatch-prod-checkbox')) {
        const prodCheckbox = e.target;
        const blueprintId = prodCheckbox.value;
        const poContainer = document.getElementById(`prod-po-list-${blueprintId}`);
        
        if (prodCheckbox.checked) {
          if (poContainer) {
            poContainer.style.display = 'flex';
            renderProductPOList(blueprintId, poContainer);
          }
        } else {
          if (poContainer) {
            poContainer.style.display = 'none';
            poContainer.innerHTML = '';
          }
        }
        handleDispatchProductOrPOChange();
      } else if (e.target.classList.contains('dispatch-po-checkbox')) {
        handleDispatchProductOrPOChange();
      }
    });
  }

  const dispatchProductSearch = document.getElementById('dispatch-product-search');
  if (dispatchProductSearch) {
    dispatchProductSearch.addEventListener('input', handleDispatchProductSearch);
  }

  const createDispatchForm = document.getElementById('create-dispatch-form');
  if (createDispatchForm) {
    createDispatchForm.addEventListener('submit', handleCreateDispatchSubmit);
  }

  // Live box calculation updates
  const partsContainer = document.getElementById('dispatch-parts-list-container');
  if (partsContainer) {
    partsContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('dispatch-part-qty-input') || e.target.classList.contains('dispatch-part-pcs-per-box-input')) {
        const row = e.target.closest('.dispatch-part-row');
        if (row) {
          const qtyInput = row.querySelector('.dispatch-part-qty-input');
          const pcsInput = row.querySelector('.dispatch-part-pcs-per-box-input');
          const calcDiv = row.querySelector('.dispatch-part-calculated-boxes');
          
          const qty = parseFloat(qtyInput.value) || 0;
          const pcs = parseFloat(pcsInput.value) || 1;
          
          const boxes = Math.ceil(qty / pcs);
          calcDiv.innerText = `${boxes} Box${boxes !== 1 ? 'es' : ''}`;
        }
      }
    });

    // Checkbox change listener to enable/disable other inputs dynamically
    partsContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('dispatch-part-checkbox')) {
        const row = e.target.closest('.dispatch-part-row');
        if (row) {
          const checked = e.target.checked;
          const qtyInput = row.querySelector('.dispatch-part-qty-input');
          const pcsInput = row.querySelector('.dispatch-part-pcs-per-box-input');
          const dimsInput = row.querySelector('.dispatch-part-dims-input');
          const calcDiv = row.querySelector('.dispatch-part-calculated-boxes');
          
          if (checked) {
            qtyInput.removeAttribute('disabled');
            pcsInput.removeAttribute('disabled');
            dimsInput.removeAttribute('disabled');
            qtyInput.value = qtyInput.getAttribute('data-default-val') || qtyInput.max;
            qtyInput.style.opacity = '1';
            pcsInput.style.opacity = '1';
            dimsInput.style.opacity = '1';
          } else {
            qtyInput.setAttribute('disabled', 'true');
            pcsInput.setAttribute('disabled', 'true');
            dimsInput.setAttribute('disabled', 'true');
            qtyInput.setAttribute('data-default-val', qtyInput.value);
            qtyInput.value = 0;
            qtyInput.style.opacity = '0.5';
            pcsInput.style.opacity = '0.5';
            dimsInput.style.opacity = '0.5';
          }
          
          const qty = parseFloat(qtyInput.value) || 0;
          const pcs = parseFloat(pcsInput.value) || 1;
          const boxes = Math.ceil(qty / pcs);
          calcDiv.innerText = `${boxes} Box${boxes !== 1 ? 'es' : ''}`;
        }
      }
    });
  }

  // Blueprint Material Mixing Ratio controls
  const mixToggle = document.getElementById('blueprint-mix-toggle');
  if (mixToggle) {
    mixToggle.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const weightsDiv = document.getElementById('blueprint-mixing-weights');
      const sumDiv = document.getElementById('blueprint-mix-percentage-sum');
      
      if (checked) {
        if (weightsDiv) weightsDiv.style.display = 'grid';
        if (sumDiv) sumDiv.style.display = 'block';
        
        let totalComp = 0;
        let totalRun = 0;
        let unit = 'g';
        state.modalSelectedMaterials.forEach(m => {
          totalComp += m.componentWeight || 0;
          totalRun += m.runnerWeight || 0;
          if (m.weightUnit) unit = m.weightUnit;
        });
        
        document.getElementById('blueprint-mix-comp-weight').value = parseFloat(totalComp.toFixed(3));
        document.getElementById('blueprint-mix-run-weight').value = parseFloat(totalRun.toFixed(3));
        document.getElementById('blueprint-mix-weight-unit').value = unit;

        state.modalSelectedMaterials.forEach(m => {
          if (totalComp > 0) {
            m.percentage = parseFloat(((m.componentWeight || 0) / totalComp * 100).toFixed(1));
          } else {
            m.percentage = parseFloat((100 / state.modalSelectedMaterials.length).toFixed(1));
          }
        });
      } else {
        if (weightsDiv) weightsDiv.style.display = 'none';
        if (sumDiv) sumDiv.style.display = 'none';
        state.modalSelectedMaterials.forEach(m => {
          delete m.percentage;
        });
      }
      
      renderModalSublists();
      if (checked) {
        recalculateMixingWeights();
      }
    });
  }

  // Bind input listeners for total weights to trigger live calculations
  ['blueprint-mix-comp-weight', 'blueprint-mix-run-weight', 'blueprint-mix-weight-unit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalculateMixingWeights);
      el.addEventListener('change', recalculateMixingWeights);
    }
  });

  // Bulk dispatch print actions
  const selectAllCheckbox = document.getElementById('dispatch-select-all');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const container = document.getElementById('dispatch-list-container');
      if (container) {
        container.querySelectorAll('.dispatch-select-checkbox').forEach(cb => {
          cb.checked = checked;
        });
        const checkboxes = container.querySelectorAll('.dispatch-select-checkbox');
        const count = checked ? checkboxes.length : 0;
        const countSpan = document.getElementById('dispatch-selected-count');
        if (countSpan) countSpan.innerText = count;
        const printBtn = document.getElementById('print-selected-dispatches-btn');
        if (printBtn) printBtn.disabled = count === 0;
      }
    });
  }

  const bulkPrintBtn = document.getElementById('print-selected-dispatches-btn');
  if (bulkPrintBtn) {
    bulkPrintBtn.addEventListener('click', () => {
      const container = document.getElementById('dispatch-list-container');
      if (container) {
        const selected = Array.from(container.querySelectorAll('.dispatch-select-checkbox'))
          .filter(cb => cb.checked)
          .map(cb => cb.getAttribute('data-id'));
        if (selected.length > 0) {
          openPrintPreviewForMultipleDispatches(selected);
        }
      }
    });
  }

  // Cloud DB Settings Modal Event Listeners
  const dbModal = document.getElementById('db-settings-modal');
  const dbBtn = document.getElementById('db-settings-btn');
  const closeDbModalBtn = document.getElementById('close-db-settings-modal');
  const cancelDbBtn = document.getElementById('close-db-settings-btn');
  const saveDbBtn = document.getElementById('save-db-settings-btn');
  const dbUrlInput = document.getElementById('db-supabase-url');
  const dbKeyInput = document.getElementById('db-supabase-key');
  const dbStatusEl = document.getElementById('db-status-message');

  if (dbBtn && dbModal) {
    dbBtn.addEventListener('click', () => {
      if (dbUrlInput) dbUrlInput.value = localStorage.getItem('supabase_url') || '';
      if (dbKeyInput) dbKeyInput.value = localStorage.getItem('supabase_key') || '';
      if (dbStatusEl) dbStatusEl.style.display = 'none';
      dbModal.classList.add('active');
    });
  }

  const closeDbModal = () => {
    if (dbModal) dbModal.classList.remove('active');
  };

  if (closeDbModalBtn) closeDbModalBtn.addEventListener('click', closeDbModal);
  if (cancelDbBtn) cancelDbBtn.addEventListener('click', closeDbModal);

  if (saveDbBtn) {
    saveDbBtn.addEventListener('click', async () => {
      const url = dbUrlInput ? dbUrlInput.value.trim() : '';
      const key = dbKeyInput ? dbKeyInput.value.trim() : '';

      if (dbStatusEl) {
        dbStatusEl.style.display = 'block';
        dbStatusEl.style.background = 'rgba(255, 193, 7, 0.1)';
        dbStatusEl.style.color = '#ffc107';
        dbStatusEl.innerText = "Testing connection and syncing data...";
      }

      if (!url || !key) {
        // Clear Supabase settings (disconnect)
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_key');
        supabaseClient = null;
        if (dbStatusEl) {
          dbStatusEl.style.background = 'rgba(239, 68, 68, 0.1)';
          dbStatusEl.style.color = '#ef4444';
          dbStatusEl.innerText = "Disconnected from cloud. Switched to local mode.";
        }
        setTimeout(() => {
          closeDbModal();
          window.location.reload();
        }, 1500);
        return;
      }

      try {
        const client = window.supabase.createClient(url, key);
        // Test connection by querying raw_materials table
        const { error } = await client.from('raw_materials').select('id').limit(1);
        if (error) throw error;

        // Connection successful! Save credentials
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
        supabaseClient = client;

        if (dbStatusEl) {
          dbStatusEl.style.background = 'rgba(16, 185, 129, 0.1)';
          dbStatusEl.style.color = '#10b981';
          dbStatusEl.innerText = "Successfully connected! Syncing local data to cloud...";
        }

        // Upload local data to Supabase immediately on connect!
        await syncAllToCloud();

        if (dbStatusEl) {
          dbStatusEl.innerText = "Cloud database synced! Reloading...";
        }

        setTimeout(() => {
          closeDbModal();
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error("Supabase connection failed:", err);
        if (dbStatusEl) {
          dbStatusEl.style.background = 'rgba(239, 68, 68, 0.1)';
          dbStatusEl.style.color = '#ef4444';
          dbStatusEl.innerText = "Connection failed: " + err.message + "\n(Did you run the SQL script to create the tables?)";
        }
      }
    });
  }
});
