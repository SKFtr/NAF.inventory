import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { firebaseConfig } from './firebase-config.js';
import { productionEmails, sellerEmails, visitorEmails } from './roles.js';
import { productCategories, unitOptions } from './products.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let localInventoryCache = {}; 

function formatToDDMMYYYY(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day}-${month}-${year} ${time}`;
}

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginScreen = document.getElementById('login-screen'); 
const mainApp = document.getElementById('main-app');         
const appContent = document.getElementById('app-content'); 

const userInfo = document.getElementById('user-info');
const userEmailSpan = document.getElementById('user-email');
const userRoleBadge = document.getElementById('user-role-badge');
const addForm = document.getElementById('add-form');
const inventoryContainer = document.getElementById('inventory-container');

const nameFilter = document.getElementById('name-filter');
const typeFilter = document.getElementById('type-filter'); 

const addProductCard = document.getElementById('add-product-card');
const formHeading = document.getElementById('form-heading'); 
const addSubmitBtn = document.getElementById('add-submit-btn'); 
const reportSection = document.getElementById('report-section');

const prodNameSelect = document.getElementById('prod-name');
const prodTypeSelect = document.getElementById('prod-type');
const prodBatchInput = document.getElementById('prod-batch'); 
const prodUnitSelect = document.getElementById('prod-unit');
const prodHideCheckbox = document.getElementById('prod-hide');

const reportStartInput = document.getElementById('report-start');
const reportEndInput = document.getElementById('report-end');

function updateDateAppearance(input) {
  if (input.value) {
    const [year, month, day] = input.value.split('-');
    input.setAttribute('data-date', `${day}-${month}-${year}`);
  } else {
    input.setAttribute('data-date', '-');
  }
}

updateDateAppearance(reportStartInput);
updateDateAppearance(reportEndInput);

reportStartInput.addEventListener('change', (e) => updateDateAppearance(e.target));
reportEndInput.addEventListener('change', (e) => updateDateAppearance(e.target));

const qtyModal = document.getElementById('qty-modal');
const qtyModalTitle = document.getElementById('qty-modal-title');
const qtyModalText = document.getElementById('qty-modal-text');
const qtyModalInput = document.getElementById('qty-modal-input');
const qtyModalUnit = document.getElementById('qty-modal-unit');

// NEW: Seller Extra Fields
const sellerExtraFields = document.getElementById('seller-extra-fields');
const qtyModalPrice = document.getElementById('qty-modal-price');
const qtyModalCustomer = document.getElementById('qty-modal-customer');
const qtyModalPhone = document.getElementById('qty-modal-phone');

const confirmQtyBtn = document.getElementById('confirm-qty-btn');
const cancelQtyBtn = document.getElementById('cancel-qty-btn');

let activeAction = null; 

Object.keys(productCategories).forEach(product => {
  const option = document.createElement('option');
  option.value = product; option.textContent = product;
  prodNameSelect.appendChild(option);
});

prodNameSelect.addEventListener('change', (e) => {
  const selectedProduct = e.target.value;
  prodTypeSelect.innerHTML = '<option value="">Select Type</option>';
  if (selectedProduct && productCategories[selectedProduct]) {
    productCategories[selectedProduct].forEach(type => {
      const option = document.createElement('option');
      option.value = type; option.textContent = type;
      prodTypeSelect.appendChild(option);
    });
  }
});

unitOptions.forEach(unit => {
  const option1 = document.createElement('option');
  option1.value = unit; option1.textContent = unit;
  prodUnitSelect.appendChild(option1);

  const option2 = document.createElement('option');
  option2.value = unit; option2.textContent = unit;
  qtyModalUnit.appendChild(option2);
});

function populateTypeFilter(selectedProduct) {
  typeFilter.innerHTML = '<option value="All">All Types</option>';
  if (selectedProduct === 'All') {
    const allTypes = new Set();
    Object.values(productCategories).forEach(types => types.forEach(t => allTypes.add(t)));
    allTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      typeFilter.appendChild(opt);
    });
  } else if (productCategories[selectedProduct]) {
    productCategories[selectedProduct].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      typeFilter.appendChild(opt);
    });
  }
}

function setupFilterOptions() {
  nameFilter.innerHTML = '<option value="All">All Products</option>';
  Object.keys(productCategories).forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod; opt.textContent = prod;
    nameFilter.appendChild(opt);
  });
  populateTypeFilter('All');
}
setupFilterOptions();

nameFilter.addEventListener('change', () => {
  populateTypeFilter(nameFilter.value);
  window.filterInventory();
});

const savedNameFilter = localStorage.getItem('savedNameFilter');
if (savedNameFilter) {
  nameFilter.value = savedNameFilter;
  populateTypeFilter(savedNameFilter);
}
const savedTypeFilter = localStorage.getItem('savedTypeFilter');
if (savedTypeFilter) {
  typeFilter.value = savedTypeFilter;
}

const deleteModal = document.getElementById('delete-modal');
const deleteModalText = document.getElementById('delete-modal-text');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let itemToDeleteId = null; 

const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', () => signInWithPopup(auth, provider));
logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isProduction = productionEmails.includes(user.email);
    const isSeller = sellerEmails.includes(user.email);
    const isVisitor = visitorEmails.includes(user.email);

    if (!isProduction && !isSeller && !isVisitor) {
      try {
        await addDoc(collection(db, "security_logs"), {
          email: user.email,
          name: user.displayName || "Unknown Identity",
          timestamp: new Date().toISOString(),
          status: "Blocked - Unauthorized Access Attempt"
        });
      } catch (error) {
        console.error("Honeypot logging failed.");
      }

      alert("Access Denied: Your email is not authorized to access the inventory system.");
      try {
        await deleteUser(user);
      } catch (error) {
        await signOut(auth);
      }
      return; 
    }

    currentUser = user;
    
    loginScreen.style.display = 'none'; 
    mainApp.style.display = 'block';
    appContent.style.display = 'block'; 
    
    userEmailSpan.textContent = user.email; 
    
    if (isProduction) {
      userRoleBadge.textContent = "Production";
      userRoleBadge.style.backgroundColor = "#4F46E5"; 
      addProductCard.style.display = 'block';
      reportSection.style.display = 'flex';
    } else if (isSeller) {
      userRoleBadge.textContent = "Seller";
      userRoleBadge.style.backgroundColor = "#10B981"; 
      addProductCard.style.display = 'none';
      reportSection.style.display = 'flex';
    } else if (isVisitor) {
      userRoleBadge.textContent = "Visitor";
      userRoleBadge.style.backgroundColor = "#6B7280"; 
      addProductCard.style.display = 'none';
      reportSection.style.display = 'none'; 
    }
    
    loadInventory();
  } else {
    currentUser = null;
    loginScreen.style.display = 'flex'; 
    mainApp.style.display = 'none';
    appContent.style.display = 'none';
  }
});

// UPDATED: logTransaction now accepts optional extraData object
async function logTransaction(productName, actionType, quantityChanged, unit, extraData = {}) {
  const userName = currentUser.displayName || currentUser.email;
  await addDoc(collection(db, "transactions"), {
    productName: productName, 
    action: actionType, 
    quantity: quantityChanged, 
    unit: unit, 
    user: userName, 
    timestamp: new Date().toISOString(),
    ...extraData // Merges price, customerName, and phone into the database if they exist
  });
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = prodNameSelect.value;
  const type = prodTypeSelect.value;
  const batch = prodBatchInput.value; 
  const unit = prodUnitSelect.value; 
  const qty = parseFloat(document.getElementById('prod-qty').value);
  const hideFromSellers = prodHideCheckbox ? prodHideCheckbox.checked : false; 
  const now = new Date().toISOString();

  await addDoc(collection(db, "inventory"), {
    name, type, batch, 
    quantity: parseFloat(qty.toFixed(3)), 
    unit: unit, 
    hideFromSellers: hideFromSellers, 
    lastEdit: { action: "Added new product", user: currentUser.displayName || currentUser.email, time: now }
  });
  
  await logTransaction(`${name} (${type}) - Batch: ${batch}`, "Added", qty, unit);
  addForm.reset();
  prodTypeSelect.innerHTML = '<option value="">Select Type</option>'; 
});

window.openQtyModal = (id, actionType) => {
  const item = localInventoryCache[id];
  if (!item) return;

  activeAction = { id, actionType, item };
  
  qtyModalTitle.textContent = `${actionType} Product`;
  qtyModalText.innerHTML = `Specify how much <strong>"${item.name}"</strong> you want to ${actionType.toLowerCase()}:`;
  qtyModalInput.value = '';
  qtyModalUnit.value = item.unit || 'KG'; 
  
  // CLEAR AND SHOW/HIDE SELLER FIELDS
  qtyModalPrice.value = '';
  qtyModalCustomer.value = '';
  qtyModalPhone.value = '';
  
  if (actionType === 'Sell') {
    sellerExtraFields.style.display = 'flex';
  } else {
    sellerExtraFields.style.display = 'none';
  }
  
  confirmQtyBtn.style.backgroundColor = (actionType === 'Sell' || actionType === 'Deduct') ? '#EF4444' : '#10B981';
  qtyModal.style.display = 'flex';
};

cancelQtyBtn.addEventListener('click', () => {
  qtyModal.style.display = 'none';
  activeAction = null;
});

confirmQtyBtn.addEventListener('click', async () => {
  if (!activeAction) return;

  const inputAmount = parseFloat(qtyModalInput.value);
  const chosenUnit = qtyModalUnit.value;
  const { id, actionType, item } = activeAction;

  if (isNaN(inputAmount) || inputAmount <= 0) return;

  let convertedAmount = inputAmount;
  const dbUnit = item.unit || 'KG';

  if (chosenUnit === 'MT' && dbUnit === 'KG') {
    convertedAmount = inputAmount * 1000; 
  } else if (chosenUnit === 'KG' && dbUnit === 'MT') {
    convertedAmount = inputAmount / 1000; 
  }

  const change = (actionType === 'Sell' || actionType === 'Deduct') ? -convertedAmount : convertedAmount;
  
  let newQty = item.quantity + change;
  newQty = parseFloat(newQty.toFixed(3)); 

  if (newQty < 0) {
    alert("Not enough stock available for this transaction!");
    return;
  }

  // GRAB OPTIONAL SELLER DATA
  const extraData = {};
  if (actionType === 'Sell') {
    if (qtyModalPrice.value) extraData.price = parseFloat(qtyModalPrice.value);
    if (qtyModalCustomer.value) extraData.customerName = qtyModalCustomer.value.trim();
    if (qtyModalPhone.value) extraData.customerPhone = qtyModalPhone.value.trim();
  }

  const userName = currentUser.displayName || currentUser.email;
  const now = new Date();
  const actionString = `${actionType} ${inputAmount} ${chosenUnit}`;

  await updateDoc(doc(db, "inventory", id), {
    quantity: newQty,
    lastEdit: { action: actionString, user: userName, time: now.toISOString() }
  });

  const batchText = item.batch ? ` - Batch: ${item.batch}` : '';
  
  // PASS EXTRA DATA TO LOG
  await logTransaction(`${item.name} (${item.type})${batchText}`, actionType, inputAmount, chosenUnit, extraData);

  qtyModal.style.display = 'none';
  activeAction = null;
});

window.generateReport = async () => {
  const startDateInput = document.getElementById('report-start').value;
  const endDateInput = document.getElementById('report-end').value;

  if (!startDateInput || !endDateInput) {
    alert("Please select both 'From' and 'To' dates.");
    return;
  }

  const startDate = new Date(startDateInput);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(endDateInput);
  endDate.setHours(23, 59, 59, 999);

  const displayStartDate = startDateInput.split('-').reverse().join('-');
  const displayEndDate = endDateInput.split('-').reverse().join('-');

  const isProduction = productionEmails.includes(currentUser.email);
  
  const reportTitle = isProduction ? "Production & Restock Statement" : "Sales Statement";
  const tableTitle = isProduction ? "Restock History" : "Sales History";
  const headerColor = isProduction ? "#10B981" : "#EF4444"; 
  const summaryLabel = isProduction ? "Total Restocked/Produced" : "Total Sold";

  const querySnapshot = await getDocs(collection(db, "transactions"));
  
  let totals = {};
  let rows = '';
  
  let validTransactions = [];

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const txDate = new Date(data.timestamp);
    if (txDate >= startDate && txDate <= endDate) {
      validTransactions.push(data);
    }
  });

  validTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // UPDATED: Adjust table headers based on role
  let tableHeadersHtml = '';
  if (!isProduction) {
    tableHeadersHtml = `<tr><th>Date & Time</th><th>Product & Batch</th><th>Qty</th><th>Customer Info & Price</th><th>Seller</th></tr>`;
  } else {
    tableHeadersHtml = `<tr><th>Date & Time</th><th>Product & Batch</th><th>Qty</th><th>User</th></tr>`;
  }

  validTransactions.forEach((data) => {
    const txDate = new Date(data.timestamp);
    const timeStr = formatToDDMMYYYY(txDate);
    
    const unit = data.unit && data.unit !== 'Units' ? data.unit : 'KG';
    
    if (!isProduction && (data.action === "Sold" || data.action === "Sell")) {
      totals[unit] = (totals[unit] || 0) + data.quantity;
      
      // COMPILE OPTIONAL SELLER INFO
      let extraInfoArray = [];
      if (data.price) extraInfoArray.push(`<strong>Price:</strong> ৳${data.price}`);
      if (data.customerName) extraInfoArray.push(`<strong>Name:</strong> ${data.customerName}`);
      if (data.customerPhone) extraInfoArray.push(`<strong>Phone:</strong> ${data.customerPhone}`);
      
      const extraInfoStr = extraInfoArray.length > 0 ? extraInfoArray.join('<br>') : '<span style="color:#9CA3AF;">-</span>';

      rows += `<tr>
        <td>${timeStr}</td>
        <td><strong>${data.productName}</strong></td>
        <td>${data.quantity} ${unit}</td>
        <td style="font-size: 0.85rem; line-height: 1.4;">${extraInfoStr}</td>
        <td>${data.user}</td>
      </tr>`;
    } 
    else if (isProduction && (data.action === "Restocked" || data.action === "Restock" || data.action === "Added" || data.action === "Deducted" || data.action === "Deduct")) {
      
      const isDeduct = (data.action === "Deducted" || data.action === "Deduct");
      const qtyChange = isDeduct ? -data.quantity : data.quantity;
      
      totals[unit] = (totals[unit] || 0) + qtyChange;
      
      const displayQty = isDeduct ? `<span style="color: #EF4444;">-${data.quantity} ${unit}</span>` : `<span style="color: #10B981;">+${data.quantity} ${unit}</span>`;
      
      rows += `<tr><td>${timeStr}</td><td><strong>${data.productName}</strong></td><td>${displayQty}</td><td>${data.user}</td></tr>`;
    }
  });

  const summaryText = Object.entries(totals).map(([u, q]) => `${parseFloat(q.toFixed(3))} ${u}`).join(' &bull; ') || '0';

  const reportHtml = `
    <html>
    <head>
      <title>${reportTitle}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #1F2937; }
        h1 { text-align: center; border-bottom: 2px solid #E5E7EB; padding-bottom: 5px; margin-bottom: 5px;}
        .date-range { text-align: center; color: #6B7280; font-size: 0.9rem; margin-bottom: 20px; }
        .summary { text-align: center; font-size: 1.2rem; font-weight: bold; margin: 20px 0; background: #F3F4F6; padding: 15px; border-radius: 8px; }
        .summary span { color: ${headerColor}; margin-left: 10px; }
        .container { margin-top: 20px; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
        h2 { margin: 0; padding: 15px; color: white; background-color: ${headerColor}; text-align: center; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #E5E7EB; font-size: 0.9rem; vertical-align: top; }
        th { background-color: #F9FAFB; }
      </style>
    </head>
    <body>
      <h1>${reportTitle}</h1>
      <div class="date-range">From: <strong>${displayStartDate}</strong> &nbsp;|&nbsp; To: <strong>${displayEndDate}</strong></div>
      
      <div class="summary">
        ${summaryLabel}: <span>${summaryText}</span>
      </div>
      
      <div class="container">
        <h2>${tableTitle}</h2>
        <table>
          ${tableHeadersHtml}
          ${rows || `<tr><td colspan="5" style="text-align:center; padding: 20px;">No records found in this date range.</td></tr>`}
        </table>
      </div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body>
    </html>
  `;
  const reportWindow = window.open('', '_blank');
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
};

window.deleteItem = (id, productName) => {
  itemToDeleteId = id; 
  deleteModalText.innerHTML = `Are you sure you want to permanently delete <strong>"${productName}"</strong>?`;
  deleteModal.style.display = 'flex'; 
};

cancelDeleteBtn.addEventListener('click', () => { deleteModal.style.display = 'none'; itemToDeleteId = null; });
confirmDeleteBtn.addEventListener('click', async () => {
  if (itemToDeleteId) { await deleteDoc(doc(db, "inventory", itemToDeleteId)); deleteModal.style.display = 'none'; itemToDeleteId = null; }
});

window.filterInventory = () => {
  const selectedName = nameFilter.value;
  const selectedType = typeFilter.value;
  
  localStorage.setItem('savedNameFilter', selectedName);
  localStorage.setItem('savedTypeFilter', selectedType); 
  
  const hiddenHeader = document.getElementById('hidden-items-header');
  if (hiddenHeader) {
     hiddenHeader.style.display = (selectedName === 'All' && selectedType === 'All') ? 'block' : 'none';
  }
  
  document.querySelectorAll('.inventory-item').forEach(item => {
    const matchName = (selectedName === 'All' || selectedName === item.getAttribute('data-name'));
    const matchType = (selectedType === 'All' || selectedType === item.getAttribute('data-type'));
    
    item.style.display = (matchName && matchType) ? 'flex' : 'none'; 
  });
};

function loadInventory() {
  onSnapshot(collection(db, "inventory"), (snapshot) => {
    inventoryContainer.innerHTML = ''; 
    localInventoryCache = {}; 
    const isProduction = productionEmails.includes(currentUser.email);
    const isSeller = sellerEmails.includes(currentUser.email);
    const isVisitor = visitorEmails.includes(currentUser.email);

    let itemsArray = [];
    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      item.id = docSnap.id;
      itemsArray.push(item);
    });

    itemsArray.sort((a, b) => {
      const aHidden = a.hideFromSellers ? 1 : 0;
      const bHidden = b.hideFromSellers ? 1 : 0;
      
      if (aHidden !== bHidden) return aHidden - bHidden;
      
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      
      const timeA = new Date(a.lastEdit.time).getTime();
      const timeB = new Date(b.lastEdit.time).getTime();
      return timeB - timeA; 
    });

    let hasShownHiddenHeader = false;

    itemsArray.forEach((item) => {
      if ((isSeller || isVisitor) && item.hideFromSellers) {
        return; 
      }

      if (isProduction && item.hideFromSellers && !hasShownHiddenHeader) {
        const divider = document.createElement('div');
        divider.id = 'hidden-items-header';
        divider.innerHTML = `<h4 style="margin: 2rem 0 1rem 0; color: #EF4444; border-bottom: 2px solid #FECACA; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">🔒 Hidden Items <span style="font-size: 0.8rem; color: #6B7280; font-weight: normal;">(Only visible to Production)</span></h4>`;
        inventoryContainer.appendChild(divider);
        hasShownHiddenHeader = true;
      }

      const id = item.id;
      localInventoryCache[id] = item;
      
      const timeString = formatToDDMMYYYY(new Date(item.lastEdit.time));
      
      const itemUnit = item.unit || 'KG';
      const batchDisplay = item.batch ? ` | Batch: ${item.batch}` : '';
      const displayQty = parseFloat(item.quantity.toFixed(3));
      
      const hiddenBadge = item.hideFromSellers ? `<span style="background: #EF4444; color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; margin-left: 5px;">Hidden from Sellers</span>` : '';

      const deleteBtnHtml = isProduction ? `<button class="delete-btn" onclick="deleteItem('${id}', '${item.name}')" title="Delete Product">🗑️</button>` : ``;
      
      let controlsHtml = '';
      if (isProduction) {
        controlsHtml = `
          <div style="display: flex; align-items: center; margin-right: 1rem;">
            <button class="minus-btn" onclick="openQtyModal('${id}', 'Deduct')" title="Deduct Quantity">-</button>
            <span style="font-weight: bold;">Qty: ${displayQty} <span style="font-size: 0.85em; color: #4B5563;">${itemUnit}</span></span>
          </div>
          <button onclick="openQtyModal('${id}', 'Restock')" style="background-color: #10B981;">Restock</button>
        `;
      } else if (isSeller) {
        controlsHtml = `
          <div style="display: flex; align-items: center; margin-right: 1rem;">
            <span style="font-weight: bold; font-size: 1.1rem;">Qty: ${displayQty} <span style="font-size: 0.85em; color: #4B5563;">${itemUnit}</span></span>
          </div>
          <button onclick="openQtyModal('${id}', 'Sell')" style="background-color: #EF4444; padding: 0.5rem 2rem; font-size: 1.1rem;">🛒 Sell</button>
        `;
      } else if (isVisitor) {
        controlsHtml = `
          <div style="display: flex; align-items: center; margin-right: 1rem;">
            <span style="font-weight: bold; font-size: 1.1rem;">Qty: ${displayQty} <span style="font-size: 0.85em; color: #4B5563;">${itemUnit}</span></span>
          </div>
        `;
      }

      const div = document.createElement('div');
      div.className = 'inventory-item';
      div.setAttribute('data-type', item.type); 
      div.setAttribute('data-name', item.name);
      
      if (item.hideFromSellers && isProduction) {
        div.style.backgroundColor = '#FEF2F2';
        div.style.borderLeft = '4px solid #EF4444';
      }

      div.innerHTML = `
        <div class="item-header">
          <div class="item-name-group">
            ${deleteBtnHtml}
            <div>
              <strong style="font-size: 1.1rem;">${item.name}</strong> ${hiddenBadge}
              <span style="color: #6B7280; font-size: 0.9rem;">(${item.type}${batchDisplay})</span>
            </div>
          </div>
          <div class="item-controls">
            ${controlsHtml}
          </div>
        </div>
        <div class="audit-trail">🕒 <strong>Last activity:</strong> ${item.lastEdit.action} by <em>${item.lastEdit.user}</em> on ${timeString}</div>
      `;
      inventoryContainer.appendChild(div);
    });
    
    window.filterInventory();
  });
}