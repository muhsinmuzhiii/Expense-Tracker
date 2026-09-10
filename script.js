const STORAGE_KEY = 'ledger_expenses_v1';

// ---- State ----
let expenses = loadExpenses();

// ---- DOM refs ----
const form = document.getElementById('expense-form');
const titleInput = document.getElementById('title');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const dateInput = document.getElementById('date');
const errorMsg = document.getElementById('error-msg');

const searchBox = document.getElementById('search-box');
const categoryFilter = document.getElementById('category-filter');
const sortSelect = document.getElementById('sort-select');
const tbody = document.getElementById('expense-body');

const statTotal = document.getElementById('stat-total');
const statCount = document.getElementById('stat-count');
const statHighest = document.getElementById('stat-highest');
const statMonth = document.getElementById('stat-month');

const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const themeToggle = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-btn');

let editingId = null; // null = add mode, otherwise holds the id being edited

// ---- LocalStorage helpers (try...catch for storage/JSON errors) ----
function loadExpenses(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(err){
    console.error('Failed to load expenses from storage:', err);
    return [];
  }
}

function saveExpenses(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }catch(err){
    console.error('Failed to save expenses to storage:', err);
    showError('Could not save to local storage. Your changes may not persist.');
  }
}

function showError(message){
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 3500);
}

// ---- Format helpers ----
const currency = (n) => `₹${Number(n).toFixed(2)}`;
const formatDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};

// ---- Add Expense (form submit + validation) ----
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = titleInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const date = dateInput.value;

  if(!title){
    showError('Please enter a title.');
    return;
  }
  if(isNaN(amount) || amount <= 0){
    showError('Amount must be a number greater than 0.');
    return;
  }
  if(!category){
    showError('Please select a category.');
    return;
  }
  if(!date){
    showError('Please choose a date.');
    return;
  }

  if(editingId){
    // Update existing expense — spread to keep the id, replace the rest
    expenses = expenses.map(exp =>
      exp.id === editingId ? { ...exp, title, amount, category, date } : exp
    );
    cancelEdit(); // back to add mode, resets the form too
  }else{
    const newExpense = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      amount,
      category,
      date
    };
    // Spread operator to update array immutably
    expenses = [...expenses, newExpense];
    form.reset();
    dateInput.valueAsDate = new Date();
  }

  saveExpenses();
  searchBox.value = ''; // avoid hiding the entry behind a stale search
  render();
});

// ---- Edit Expense ----
function startEdit(id){
  const exp = expenses.find(e => e.id === id);
  if(!exp) return;

  editingId = id;
  titleInput.value = exp.title;
  amountInput.value = exp.amount;
  categoryInput.value = exp.category;
  dateInput.value = exp.date;

  submitBtn.textContent = 'Update Expense';
  cancelEditBtn.style.display = 'inline-block';
  titleInput.focus();
}

function cancelEdit(){
  editingId = null;
  form.reset();
  dateInput.valueAsDate = new Date();
  submitBtn.textContent = 'Add Expense';
  cancelEditBtn.style.display = 'none';
}

cancelEditBtn.addEventListener('click', cancelEdit);

// ---- Edit / Delete Expense (event delegation) ----
tbody.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.edit-btn');
  if(editBtn){
    startEdit(editBtn.dataset.id);
    return;
  }

  const delBtn = e.target.closest('.del-btn');
  if(delBtn){
    const { id } = delBtn.dataset;
    expenses = expenses.filter(exp => exp.id !== id);
    saveExpenses();
    if(editingId === id) cancelEdit(); // was editing the row we just deleted
    render();
  }
});

// ---- Search / Filter / Sort listeners ----
searchBox.addEventListener('input', render);
categoryFilter.addEventListener('change', render);
sortSelect.addEventListener('change', render);

// ---- Derive the visible list ----
function getVisibleExpenses(){
  const term = searchBox.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const sortBy = sortSelect.value;

  let list = expenses.filter(exp => {
    const matchesSearch = exp.title.toLowerCase().includes(term);
    const matchesCategory = category === 'All' || exp.category === category;
    return matchesSearch && matchesCategory;
  });

  list = [...list].sort((a, b) => {
    if(sortBy === 'newest') return new Date(b.date) - new Date(a.date);
    if(sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
    if(sortBy === 'highest') return b.amount - a.amount;
    if(sortBy === 'lowest') return a.amount - b.amount;
    return 0;
  });

  return list;
}

// ---- Render table ----
function renderTable(){
  const list = getVisibleExpenses();

  if(list.length === 0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No expenses match — try adjusting search or filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(({ id, title, amount, category, date }) => `
    <tr>
      <td>${escapeHtml(title)}</td>
      <td><span class="cat-tag">${category}</span></td>
      <td>${formatDate(date)}</td>
      <td class="amt">${currency(amount)}</td>
      <td>
        <button class="edit-btn" data-id="${id}">Edit</button>
        <button class="del-btn" data-id="${id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Render summary (reduce, filter, sort/spread) ----
function renderSummary(){
  const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const count = expenses.length;
  const highest = expenses.reduce((max, exp) => Math.max(max, exp.amount), 0);

  const now = new Date();
  const currentMonthTotal = expenses
    .filter(exp => {
      const d = new Date(exp.date + 'T00:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, exp) => sum + exp.amount, 0);

  statTotal.textContent = currency(total);
  statCount.textContent = count;
  statHighest.textContent = currency(highest);
  statMonth.textContent = currency(currentMonthTotal);
}

function render(){
  renderTable();
  renderSummary();
}

// ---- Theme toggle (Dark / Light) ----
const THEME_KEY = 'ledger_theme';

function applyTheme(theme){
  if(theme === 'light'){
    document.body.classList.add('light-theme');
    themeToggle.textContent = '☀️ Light';
  }else{
    document.body.classList.remove('light-theme');
    themeToggle.textContent = '🌙 Dark';
  }
}

themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.contains('light-theme');
  const nextTheme = isLight ? 'dark' : 'light';
  applyTheme(nextTheme);
  try{
    localStorage.setItem(THEME_KEY, nextTheme);
  }catch(err){
    console.error('Failed to save theme preference:', err);
  }
});

// ---- Export to CSV ----
function exportToCsv(){
  const list = getVisibleExpenses();

  if(list.length === 0){
    showError('No expenses to export.');
    return;
  }

  const header = ['Title', 'Category', 'Date', 'Amount'];
  const rows = list.map(({ title, category, date, amount }) => {
    // wrap title in quotes and escape any inner quotes, since titles can contain commas
    const safeTitle = `"${title.replace(/"/g, '""')}"`;
    return [safeTitle, category, date, amount.toFixed(2)].join(',');
  });
  const csvContent = [header.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

exportBtn.addEventListener('click', exportToCsv);

// ---- Advanced: Motivational Quote API ----
async function loadQuote(){
  const quoteStrip = document.getElementById('quote-strip');
  try{
    const res = await fetch('https://api.quotable.io/random?tags=motivational');
    if(!res.ok) throw new Error('Bad response');
    const data = await res.json();
    quoteStrip.textContent = `"${data.content}" — ${data.author}`;
  }catch(err){
    console.error('Quote fetch failed:', err);
    quoteStrip.textContent = 'Unable to load quote. Please try again.';
  }
}

// ---- Init ----
dateInput.valueAsDate = new Date();
try{
  const savedTheme = localStorage.getItem(THEME_KEY);
  if(savedTheme) applyTheme(savedTheme);
}catch(err){
  console.error('Failed to load theme preference:', err);
}
render();
loadQuote();