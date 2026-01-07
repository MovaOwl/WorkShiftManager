// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
const STORAGE_KEYS = {
    EMPLOYEES: 'shiftEmployees_v2',
    SCHEDULES: 'shiftSchedules_v2',
    TASKS: 'shiftTasks_v2',
    BACKUP: 'shiftBackup_v2',
    SETTINGS: 'shiftSettings_v2'
};

const DEFAULT_SETTINGS = {
    dayShiftHours: 12,
    nightShiftHours: 12,
    defaultHourlyRate: 500,
    startOfWeek: 1
};

const SHIFT_TYPES = {
    DAY: { id: 'day', name: 'Дневная', hours: 12, color: '#238636', icon: 'fas fa-sun' },
    NIGHT: { id: 'night', name: 'Ночная', hours: 12, color: '#f85149', icon: 'fas fa-moon' },
    CUSTOM: { id: 'custom', name: 'Индивидуальные', color: '#8957e5', icon: 'fas fa-user-clock' }
};

let employees = {};
let schedules = {};
let tasks = {};
let settings = { ...DEFAULT_SETTINGS };
let currentDate = new Date();
let currentEmployeeId = null;
let employeeColors = [
    '#58a6ff', '#79c0ff', '#d2a8ff', '#ffa8f8',
    '#f8c73c', '#ff7b72', '#a5ff7b', '#ff8cdc',
    '#56d364', '#ffa657', '#6e7681', '#bc8cff'
];

// ==================== УТИЛИТЫ ====================
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    const text = document.getElementById('notificationText');
    
    if (!notification || !text) return;
    
    notification.className = `notification notification-${type}`;
    text.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(amount);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function parseDateString(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function getMonthDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDay = new Date(firstDay);
    const dayOfWeek = startDay.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDay.setDate(startDay.getDate() - diff);
    
    return { firstDay, lastDay, startDay };
}

// ==================== DEMO DATA ====================
function createDemoData() {
    const demoEmployees = [
        { name: 'Иванов Иван Иванович', rate: 500 },
        { name: 'Петрова Анна Сергеевна', rate: 550 },
        { name: 'Сидоров Алексей Викторович', rate: 600 }
    ];
    
    employees = {};
    schedules = {};
    tasks = {};
    
    demoEmployees.forEach((emp, index) => {
        const employeeId = generateId();
        employees[employeeId] = {
            id: employeeId,
            name: emp.name,
            rate: emp.rate,
            color: employeeColors[index % employeeColors.length],
            createdAt: Date.now()
        };
        
        schedules[employeeId] = {};
        
        // Добавляем несколько демо-смен
        const today = new Date();
        for (let i = 0; i < 5; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = formatDate(date);
            
            const shiftType = i % 3 === 0 ? 'day' : (i % 3 === 1 ? 'night' : 'custom');
            schedules[employeeId][dateStr] = {
                hours: shiftType === 'custom' ? 8 : 12,
                type: shiftType,
                notes: `Демо-смена ${i + 1}`,
                updatedAt: Date.now()
            };
        }
    });
    
    // Добавляем демо-задачи
    const employeeIds = Object.keys(employees);
    if (employeeIds.length > 0) {
        const todayStr = formatDate(new Date());
        tasks[`${employeeIds[0]}:${todayStr}`] = [{
            text: 'Подготовить отчет за неделю',
            report: 'Отчет готов и отправлен',
            completed: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }];
    }
    
    showNotification('Демо-данные загружены', 'success');
}

// ==================== FIREBASE FUNCTIONS ====================
async function loadData() {
    try {
        // Проверяем, есть ли Firebase и авторизован ли пользователь
        if (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) {
            const userId = window.firebase.auth.currentUser.uid;
            console.log('Загрузка данных из Firebase для пользователя:', userId);
            
            try {
                const docRef = window.firebase.firestore.doc(window.firebase.db, 'users', userId);
                const docSnap = await window.firebase.firestore.getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    employees = data.employees || {};
                    schedules = data.schedules || {};
                    tasks = data.tasks || {};
                    settings = data.settings || { ...DEFAULT_SETTINGS };
                    
                    // Также сохраняем локально для офлайн-работы
                    saveLocalData();
                    
                    showNotification('Данные загружены из облака', 'success');
                    if (window.updateSyncStatus) {
                        window.updateSyncStatus('Данные синхронизированы с облаком');
                    }
                    console.log('Данные загружены из Firebase');
                } else {
                    // Первый вход - создаём демо-данные
                    createDemoData();
                    await saveData();
                    showNotification('Создан новый аккаунт с демо-данными', 'success');
                }
            } catch (firebaseError) {
                console.warn('Ошибка Firebase, используем локальные данные:', firebaseError);
                loadLocalData();
                showNotification('Используются локальные данные (ошибка облака)', 'warning');
                if (window.updateSyncStatus) {
                    window.updateSyncStatus('Режим офлайн (используются локальные данные)');
                }
            }
        } else {
            // Без аутентификации используем локальные данные
            console.log('Пользователь не аутентифицирован, используем локальные данные');
            loadLocalData();
            if (window.updateSyncStatus) {
                window.updateSyncStatus('Локальный режим (без синхронизации)');
            }
        }
        
        updateUI();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        loadLocalData();
        showNotification('Используются локальные данные', 'warning');
    }
}

async function saveData() {
    try {
        // Проверяем, есть ли Firebase и авторизован ли пользователь
        if (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) {
            const userId = window.firebase.auth.currentUser.uid;
            
            try {
                const docRef = window.firebase.firestore.doc(window.firebase.db, 'users', userId);
                await window.firebase.firestore.setDoc(docRef, {
                    employees: employees,
                    schedules: schedules,
                    tasks: tasks,
                    settings: settings,
                    updatedAt: window.firebase.firestore.serverTimestamp()
                }, { merge: true });
                
                console.log('Данные сохранены в Firebase');
                if (window.updateSyncStatus) {
                    window.updateSyncStatus('Данные сохранены в облако');
                }
            } catch (firebaseError) {
                console.warn('Ошибка сохранения в Firebase:', firebaseError);
                showNotification('Ошибка сохранения в облако. Данные сохранены локально.', 'warning');
                if (window.updateSyncStatus) {
                    window.updateSyncStatus('Ошибка синхронизации (данные сохранены локально)');
                }
            }
        } else {
            console.log('Пользователь не авторизован, сохраняем только локально');
            if (window.updateSyncStatus) {
                window.updateSyncStatus('Данные сохранены локально (без синхронизации)');
            }
        }
        
        // Всегда сохраняем локально для офлайн-работы
        saveLocalData();
        
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
        saveLocalData();
        showNotification('Ошибка сохранения', 'error');
    }
}
async function deleteShiftFromFirebase(employeeId, date) {
    if (!window.firebase || !window.firebase.auth?.currentUser) {
        showNotification('Ошибка аутентификации', 'error');
        return;
    }
    
    const userId = window.firebase.auth.currentUser.uid;
    const docRef = window.firebase.firestore.doc(window.firebase.db, 'users', userId);
    
    try {
        await window.firebase.firestore.updateDoc(docRef, {
            [`schedules.${employeeId}.${date}`]: window.firebase.firestore.deleteField()
        });
        showNotification('Смена удалена в облаке', 'success');
        console.log(`Удалено: schedules.${employeeId}.${date}`);
    } catch (error) {
        console.error('Ошибка удаления в Firebase:', error);
        showNotification('Ошибка удаления смены в облаке', 'error');
    }
}
// ==================== LOCAL STORAGE FUNCTIONS ====================
function loadLocalData() {
    try {
        const employeesData = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
        const schedulesData = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
        const tasksData = localStorage.getItem(STORAGE_KEYS.TASKS);
        const settingsData = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        
        if (employeesData) employees = JSON.parse(employeesData);
        if (schedulesData) schedules = JSON.parse(schedulesData);
        if (tasksData) tasks = JSON.parse(tasksData);
        if (settingsData) settings = JSON.parse(settingsData);
        
        if (Object.keys(employees).length === 0) {
            createDemoData();
            saveLocalData();
        }
        
        console.log('Данные загружены локально');
    } catch (error) {
        console.error('Ошибка загрузки локальных данных:', error);
        createDemoData();
    }
}

function saveLocalData() {
    try {
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        console.log('Данные сохранены локально');
    } catch (error) {
        console.error('Ошибка сохранения локальных данных:', error);
    }
}

// ==================== СОТРУДНИКИ ====================
async function addEmployee() {
    const nameInput = document.getElementById('newName');
    const rateInput = document.getElementById('newRate');
    
    const name = nameInput.value.trim();
    const rate = parseInt(rateInput.value) || settings.defaultHourlyRate;
    
    if (!name) {
        showNotification('Введите ФИО сотрудника', 'error');
        nameInput.focus();
        return;
    }
    
    if (name.length < 3) {
        showNotification('ФИО должно содержать не менее 3 символов', 'error');
        return;
    }
    
    // Проверка на дубликат
    const isDuplicate = Object.values(employees).some(emp => 
        emp.name.toLowerCase() === name.toLowerCase()
    );
    
    if (isDuplicate) {
        showNotification('Сотрудник с таким ФИО уже существует', 'error');
        return;
    }
    
    const employeeId = generateId();
    employees[employeeId] = {
        id: employeeId,
        name: name,
        rate: rate,
        color: employeeColors[Object.keys(employees).length % employeeColors.length],
        createdAt: Date.now()
    };
    
    schedules[employeeId] = {};
    
    await saveData();
    updateEmployeeUI();
    updateTaskSelect();
    
    nameInput.value = '';
    rateInput.value = settings.defaultHourlyRate;
    nameInput.focus();
    
    showNotification(`Сотрудник "${name}" добавлен`, 'success');
}

function updateEmployeeUI() {
    const select = document.getElementById('employeeSelect');
    const list = document.getElementById('employeeList');
    
    if (!select || !list) return;
    
    // Обновление выпадающего списка
    select.innerHTML = '<option value="">— Выберите сотрудника —</option>';
    
    const sortedEmployees = Object.values(employees).sort((a, b) => a.name.localeCompare(b.name));
    sortedEmployees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = `${employee.name} (${employee.rate} ₽/ч)`;
        if (employee.id === currentEmployeeId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Установка текущего сотрудника
    if (!currentEmployeeId && sortedEmployees.length > 0) {
        currentEmployeeId = sortedEmployees[0].id;
        select.value = currentEmployeeId;
    }
    
    // Обновление списка сотрудников
    list.innerHTML = '';
    
    if (sortedEmployees.length === 0) {
        list.innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--text-muted);">
                <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>Список сотрудников пуст. Добавьте первого сотрудника.</p>
            </div>
        `;
        return;
    }
    
    sortedEmployees.forEach(employee => {
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.innerHTML = `
            <div class="employee-name">${employee.name}</div>
            <div class="employee-rate">${employee.rate} ₽/ч</div>
            <div class="d-flex align-center gap-10 mb-20">
                <div class="color-box" style="background:${employee.color};"></div>
                <span style="font-size: 0.9rem; color: var(--text-muted);">Цвет в графике</span>
            </div>
            <div class="employee-actions">
                <button class="btn btn-outline btn-sm" onclick="editEmployee('${employee.id}')">
                    <i class="fas fa-edit"></i> Изменить
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${employee.id}')">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

async function editEmployee(employeeId) {
    const employee = employees[employeeId];
    if (!employee) return;
    
    const newName = prompt('Введите новое ФИО сотрудника:', employee.name);
    if (!newName || newName.trim() === '') return;
    
    const newRate = prompt('Введите новую ставку (₽/ч):', employee.rate);
    if (!newRate) return;
    
    const rate = parseInt(newRate);
    if (isNaN(rate) || rate < 0) {
        showNotification('Некорректная ставка', 'error');
        return;
    }
    
    // Проверка на дубликат
    const isDuplicate = Object.values(employees).some(emp => 
        emp.id !== employeeId && emp.name.toLowerCase() === newName.toLowerCase()
    );
    
    if (isDuplicate) {
        showNotification('Сотрудник с таким ФИО уже существует', 'error');
        return;
    }
    
    employee.name = newName.trim();
    employee.rate = rate;
    
    await saveData();
    updateEmployeeUI();
    updateTaskSelect();
    renderPersonalCalendar();
    renderGeneralCalendar();
    renderEmployeeDashboard();
    
    showNotification('Данные сотрудника обновлены', 'success');
}

async function deleteEmployee(employeeId) {
    const employee = employees[employeeId];
    if (!employee) return;
    
    if (!confirm(`Вы уверены, что хотите удалить сотрудника "${employee.name}"? Все связанные данные будут удалены.`)) {
        return;
    }
    
    // Удаление сотрудника
    delete employees[employeeId];
    delete schedules[employeeId];
    
    // Удаление задач сотрудника
    Object.keys(tasks).forEach(key => {
        if (key.startsWith(employeeId + ':')) {
            delete tasks[key];
        }
    });
    
    // Обновление текущего сотрудника
    if (currentEmployeeId === employeeId) {
        const remainingIds = Object.keys(employees);
        currentEmployeeId = remainingIds.length > 0 ? remainingIds[0] : null;
    }
    
    await saveData();
    updateEmployeeUI();
    updateTaskSelect();
    renderPersonalCalendar();
    renderGeneralCalendar();
    renderEmployeeDashboard();
    
    showNotification(`Сотрудник "${employee.name}" удален`, 'success');
}

// ==================== КАЛЕНДАРЬ ====================
function renderPersonalCalendar() {
    const container = document.getElementById('personalDays');
    if (!container) return;
    
    if (!currentEmployeeId) {
        container.innerHTML = `
            <div class="text-center" style="grid-column: 1/-1; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-user-slash" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>Выберите сотрудника для просмотра графика</p>
            </div>
        `;
        updatePersonalTotals(0, 0, 0);
        return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const { startDay } = getMonthDays(year, month);
    const employee = employees[currentEmployeeId];
    
    // Обновление заголовка
    const monthYear = currentDate.toLocaleString('ru-RU', { 
        month: 'long', 
        year: 'numeric' 
    }).replace(/^\w/, c => c.toUpperCase());
    
    document.getElementById('personalMonthYear').textContent = monthYear;
    
    // Очистка контейнера
    container.innerHTML = '';
    
    // Получение расписания сотрудника
    const employeeSchedule = schedules[currentEmployeeId] || {};
    
    // Статистика
    let workedDays = 0;
    let totalHours = 0;
    
    // Генерация дней календаря
    const today = new Date();
    const todayStr = formatDate(today);
    
    for (let i = 0; i < 42; i++) {
        const currentDay = new Date(startDay);
        currentDay.setDate(startDay.getDate() + i);
        const dateStr = formatDate(currentDay);
        const isToday = dateStr === todayStr;
        const isCurrentMonth = currentDay.getMonth() === month;
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        dayDiv.dataset.date = dateStr;
        
        if (!isCurrentMonth) {
            dayDiv.classList.add('other-month');
        }
        
        if (isToday) {
            dayDiv.classList.add('today');
        }
        
        // Номер дня
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = currentDay.getDate();
        dayDiv.appendChild(dayNumber);
        
        // Информация о смене
        const shiftEntry = employeeSchedule[dateStr];
        if (shiftEntry && isCurrentMonth) {
            workedDays++;
            totalHours += shiftEntry.hours;
            
            const shiftDiv = document.createElement('div');
            shiftDiv.className = `shift-info shift-${shiftEntry.type}`;
            shiftDiv.innerHTML = `
                ${SHIFT_TYPES[shiftEntry.type.toUpperCase()].name}<br>
                <strong>${shiftEntry.hours} ч</strong>
            `;
            dayDiv.appendChild(shiftDiv);
            
            if (shiftEntry.notes) {
                const notesDiv = document.createElement('div');
                notesDiv.className = 'task-report';
                notesDiv.textContent = shiftEntry.notes;
                dayDiv.appendChild(notesDiv);
            }
        }
        
        // Обработчик клика
        if (isCurrentMonth) {
            dayDiv.addEventListener('click', () => {
                openShiftEditor(dateStr, shiftEntry);
            });
        }
        
        container.appendChild(dayDiv);
    }
    
    // Обновление статистики
    const totalSalary = Math.round(totalHours * employee.rate);
    updatePersonalTotals(workedDays, totalHours, totalSalary);
}

function openShiftEditor(dateStr, existingEntry = null) {
    if (!currentEmployeeId) {
        showNotification('Выберите сотрудника', 'error');
        return;
    }
    
    const date = parseDateString(dateStr);
    const formattedDate = date.toLocaleDateString('ru-RU', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    let shiftType = existingEntry ? existingEntry.type : 'day';
    let shiftHours = existingEntry ? existingEntry.hours : 12;
    let shiftNotes = existingEntry ? existingEntry.notes : '';
    
    // Удаляем старый модальный если есть
    const oldModal = document.getElementById('shiftEditorModal');
    if (oldModal) oldModal.remove();
    
    const modalHtml = `
        <div class="modal" id="shiftEditorModal" style="display: flex;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-user-clock"></i>
                        Настройка смены на ${formattedDate}
                    </h2>
                    <button class="close-modal" onclick="closeShiftEditor()">×</button>
                </div>
                
                <div class="modal-section">
                    <div class="form-group">
                        <label class="form-label">Тип смены</label>
                        <div class="d-flex gap-10">
                            <button id="shiftTypeDay" class="btn ${shiftType === 'day' ? 'btn-success' : 'btn-outline'}" 
                                    style="flex: 1;">
                                <i class="fas fa-sun"></i> Дневная (12 ч)
                            </button>
                            <button id="shiftTypeNight" class="btn ${shiftType === 'night' ? 'btn-danger' : 'btn-outline'}" 
                                    style="flex: 1;">
                                <i class="fas fa-moon"></i> Ночная (12 ч)
                            </button>
                            <button id="shiftTypeCustom" class="btn ${shiftType === 'custom' ? 'btn-warning' : 'btn-outline'}" 
                                    style="flex: 1;">
                                <i class="fas fa-user-clock"></i> Индивидуальные
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group" id="customHoursGroup" ${shiftType !== 'custom' ? 'style="display:none;"' : ''}>
                        <label class="form-label">Количество часов</label>
                        <input type="number" id="shiftHours" class="form-control" 
                               value="${shiftHours}" min="0.5" max="24" step="0.5">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Примечания (необязательно)</label>
                        <textarea id="shiftNotes" class="form-control" rows="3" 
                                  placeholder="Дополнительная информация о смене...">${shiftNotes}</textarea>
                    </div>
                </div>
                
                <div class="d-flex gap-10 justify-between">
                    <button class="btn btn-danger" id="deleteShiftBtn">
                        <i class="fas fa-trash"></i> Удалить смену
                    </button>
                    <div class="d-flex gap-10">
                        <button class="btn btn-outline" onclick="closeShiftEditor()">
                            Отмена
                        </button>
                        <button class="btn btn-success" id="saveShiftBtn">
                            <i class="fas fa-save"></i> Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Назначаем обработчики событий
    document.getElementById('shiftTypeDay').addEventListener('click', () => selectShiftType('day'));
    document.getElementById('shiftTypeNight').addEventListener('click', () => selectShiftType('night'));
    document.getElementById('shiftTypeCustom').addEventListener('click', () => selectShiftType('custom'));
    document.getElementById('deleteShiftBtn').addEventListener('click', () => deleteShift(dateStr));
    document.getElementById('saveShiftBtn').addEventListener('click', () => saveShift(dateStr));
    
    // Функция выбора типа смены
    function selectShiftType(type) {
        shiftType = type;
        
        // Обновляем кнопки
        const dayBtn = document.getElementById('shiftTypeDay');
        const nightBtn = document.getElementById('shiftTypeNight');
        const customBtn = document.getElementById('shiftTypeCustom');
        
        dayBtn.className = type === 'day' ? 'btn btn-success' : 'btn btn-outline';
        nightBtn.className = type === 'night' ? 'btn btn-danger' : 'btn btn-outline';
        customBtn.className = type === 'custom' ? 'btn btn-warning' : 'btn btn-outline';
        
        // Показываем/скрываем поле для часов
        const customHoursGroup = document.getElementById('customHoursGroup');
        customHoursGroup.style.display = type === 'custom' ? 'block' : 'none';
        
        // Устанавливаем часы по умолчанию
        if (type !== 'custom') {
            shiftHours = SHIFT_TYPES[type.toUpperCase()].hours;
            document.getElementById('shiftHours').value = shiftHours;
        }
    }
    
    // Функция сохранения смены
    async function saveShift(dateStr) {
        const hoursInput = document.getElementById('shiftHours');
        const notesInput = document.getElementById('shiftNotes');
        
        shiftHours = parseFloat(hoursInput.value) || 12;
        shiftNotes = notesInput.value.trim();
        
        if (shiftHours <= 0 || !shiftHours || isNaN(shiftHours)) {
            // Если часы = 0 или невалидные, удаляем смену
            if (schedules[currentEmployeeId] && schedules[currentEmployeeId][dateStr]) {
                delete schedules[currentEmployeeId][dateStr];
                await deleteShiftFromFirebase(currentEmployeeId, dateStr);// Удаляем смену из Firebase
                showNotification('Смена удалена', 'success');
            }
        } else {
            // Сохраняем смену
            if (!schedules[currentEmployeeId]) {
                schedules[currentEmployeeId] = {};
            }
            
            schedules[currentEmployeeId][dateStr] = {
                hours: shiftHours,
                type: shiftType,
                notes: shiftNotes,
                updatedAt: Date.now()
            };
            showNotification('Смена сохранена', 'success');
        }
        
        await saveData();
        
        // Обновляем все календари
        renderPersonalCalendar();
        renderGeneralCalendar();
        renderEmployeeDashboard();
        
        closeShiftEditor();
    }
    
    // Функция удаления смены
    async function deleteShift(dateStr) {
        if (!confirm('Удалить смену?')) return;
        
        if (schedules[currentEmployeeId] && schedules[currentEmployeeId][dateStr]) {
            delete schedules[currentEmployeeId][dateStr];
            await deleteShiftFromFirebase(currentEmployeeId, dateStr); // Удаляем смену из Firebase
            await saveData();
            
            // Обновляем все календари
            renderPersonalCalendar();
            renderGeneralCalendar();
            renderEmployeeDashboard();
            
            closeShiftEditor();
            showNotification('Смена удалена', 'success');
        } else {
            showNotification('Смена не найдена', 'error');
        }
    }
    
    // Функция закрытия редактора
    function closeShiftEditor() {
        const modal = document.getElementById('shiftEditorModal');
        if (modal) modal.remove();
    }
    
    // Экспортируем функции для глобального доступа
    window.selectShiftType = selectShiftType;
    window.saveShift = saveShift;
    window.deleteShift = deleteShift;
    window.closeShiftEditor = closeShiftEditor;
}

function updatePersonalTotals(days, hours, salary) {
    const workedDaysEl = document.getElementById('personalWorkedDays');
    const totalHoursEl = document.getElementById('personalTotalHours');
    const totalSalaryEl = document.getElementById('personalTotalSalary');
    
    if (workedDaysEl) workedDaysEl.textContent = days;
    if (totalHoursEl) totalHoursEl.textContent = hours.toFixed(1);
    if (totalSalaryEl) totalSalaryEl.textContent = formatCurrency(salary);
}

function renderGeneralCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const { startDay } = getMonthDays(year, month);
    
    // Обновление заголовка
    const monthYear = currentDate.toLocaleString('ru-RU', { 
        month: 'long', 
        year: 'numeric' 
    }).replace(/^\w/, c => c.toUpperCase());
    
    const monthYearEl = document.getElementById('generalMonthYear');
    if (monthYearEl) monthYearEl.textContent = monthYear;
    
    // Обновление цветов сотрудников
    const colorsDiv = document.getElementById('employeeColors');
    if (colorsDiv) {
        colorsDiv.innerHTML = '';
        
        Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => {
            const colorItem = document.createElement('div');
            colorItem.className = 'color-item';
            colorItem.innerHTML = `
                <div class="color-box" style="background:${employee.color}"></div>
                <span>${employee.name}</span>
            `;
            colorsDiv.appendChild(colorItem);
        });
    }
    
    // Очистка контейнера
    const container = document.getElementById('generalDays');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Генерация дней календаря
    const today = new Date();
    const todayStr = formatDate(today);
    
    for (let i = 0; i < 42; i++) {
        const currentDay = new Date(startDay);
        currentDay.setDate(startDay.getDate() + i);
        const dateStr = formatDate(currentDay);
        const isCurrentMonth = currentDay.getMonth() === month;
        const isToday = dateStr === todayStr;
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        dayDiv.dataset.date = dateStr;
        
        if (!isCurrentMonth) {
            dayDiv.classList.add('other-month');
        }
        
        if (isToday) {
            dayDiv.classList.add('today');
        }
        
        // Номер дня
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = currentDay.getDate();
        dayDiv.appendChild(dayNumber);
        
        // Смены всех сотрудников
        Object.values(employees).forEach(employee => {
            const employeeSchedule = schedules[employee.id] || {};
            const shiftEntry = employeeSchedule[dateStr];
            
            if (shiftEntry && isCurrentMonth) {
                const shiftType = SHIFT_TYPES[shiftEntry.type.toUpperCase()];
                const shiftDiv = document.createElement('div');
                shiftDiv.className = 'shift-employee';
                shiftDiv.style.backgroundColor = shiftType.color;
                shiftDiv.title = `${employee.name}: ${shiftType.name}, ${shiftEntry.hours} ч`;
                shiftDiv.innerHTML = `
                    <i class="${shiftType.icon}" style="font-size: 0.6rem; margin-right: 3px;"></i>
                    ${employee.name.split(' ')[0]}: ${shiftEntry.hours}ч
                `;
                dayDiv.appendChild(shiftDiv);
            }
        });
        
        // Обработчик клика для просмотра деталей
        if (isCurrentMonth) {
            dayDiv.addEventListener('click', () => {
                showDayDetail(dateStr);
            });
        }
        
        container.appendChild(dayDiv);
    }
}

function renderEmployeeDashboard() {
    const dashboard = document.getElementById('employeeDashboard');
    if (!dashboard) return;
    
    dashboard.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => {
        const employeeSchedule = schedules[employee.id] || {};
        
        let workedDays = 0;
        let totalHours = 0;
        let dayHours = 0;
        let nightHours = 0;
        let customHours = 0;
        
        // Расчет статистики за месяц
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const shiftEntry = employeeSchedule[dateStr];
            
            if (shiftEntry) {
                workedDays++;
                totalHours += shiftEntry.hours;
                
                if (shiftEntry.type === 'day') dayHours += shiftEntry.hours;
                else if (shiftEntry.type === 'night') nightHours += shiftEntry.hours;
                else if (shiftEntry.type === 'custom') customHours += shiftEntry.hours;
            }
        }
        
        const totalSalary = Math.round(totalHours * employee.rate);
        
        const card = document.createElement('div');
        card.className = 'employee-dash-card';
        card.innerHTML = `
            <div class="employee-dash-name">${employee.name}</div>
            <div class="employee-dash-stat">
                <span>Отработано дней:</span>
                <span>${workedDays}</span>
            </div>
            <div class="employee-dash-stat">
                <span>Всего часов:</span>
                <span>${totalHours.toFixed(1)}</span>
            </div>
            <div class="employee-dash-stat">
                <span>Дневные:</span>
                <span>${dayHours.toFixed(1)} ч</span>
            </div>
            <div class="employee-dash-stat">
                <span>Ночные:</span>
                <span>${nightHours.toFixed(1)} ч</span>
            </div>
            ${customHours > 0 ? `
            <div class="employee-dash-stat">
                <span>Индивидуальные:</span>
                <span>${customHours.toFixed(1)} ч</span>
            </div>
            ` : ''}
            <div class="employee-dash-salary">${formatCurrency(totalSalary)}</div>
        `;
        
        dashboard.appendChild(card);
    });
}

// ==================== ДЕТАЛЬНЫЙ ПРОСМОТР ДНЯ ====================
function showDayDetail(dateStr) {
    const date = parseDateString(dateStr);
    const formattedDate = date.toLocaleDateString('ru-RU', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    document.getElementById('modalDateTitle').textContent = formattedDate;
    
    // Очистка содержимого
    document.getElementById('modalShifts').innerHTML = '';
    document.getElementById('modalTasks').innerHTML = '';
    document.getElementById('modalStats').innerHTML = '';
    
    // Сбор статистики
    let totalEmployees = 0;
    let totalHours = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    
    // Отображение смен
    Object.values(employees).forEach(employee => {
        const employeeSchedule = schedules[employee.id] || {};
        const shiftEntry = employeeSchedule[dateStr];
        
        if (shiftEntry) {
            totalEmployees++;
            totalHours += shiftEntry.hours;
            
            const shiftItem = document.createElement('div');
            shiftItem.className = 'shift-item';
            
            const shiftType = SHIFT_TYPES[shiftEntry.type.toUpperCase()];
            shiftItem.innerHTML = `
                <div class="d-flex justify-between align-center">
                    <div>
                        <strong style="color:${employee.color}">${employee.name}</strong>
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 4px;">
                            <i class="${shiftType.icon}"></i> ${shiftType.name} • ${shiftEntry.hours} часов
                        </div>
                        ${shiftEntry.notes ? `
                        <div style="font-size: 0.85rem; margin-top: 6px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 6px;">
                            ${shiftEntry.notes}
                        </div>
                        ` : ''}
                    </div>
                    <span>${shiftEntry.hours} ч</span>
                </div>
            `;
            
            document.getElementById('modalShifts').appendChild(shiftItem);
        }
    });
    
    // Отображение задач
    Object.values(employees).forEach(employee => {
        const taskKey = `${employee.id}:${dateStr}`;
        const taskList = tasks[taskKey] || [];
        
        taskList.forEach(task => {
            totalTasks++;
            if (task.completed || task.report) completedTasks++;
            
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item-modal';
            taskItem.innerHTML = `
                <div class="d-flex justify-between align-center">
                    <div style="color:${employee.color}; font-weight: 600;">
                        ${employee.name}
                    </div>
                    ${task.completed ? 
                        '<span class="badge badge-success"><i class="fas fa-check"></i> Выполнено</span>' : 
                        '<span class="badge badge-secondary"><i class="fas fa-clock"></i> В работе</span>'
                    }
                </div>
                <div style="margin-top: 8px; font-weight: 500;">${task.text}</div>
                ${task.report ? `
                <div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 6px; font-size: 0.9rem;">
                    <strong>Отчёт:</strong> ${task.report}
                </div>
                ` : ''}
                <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">
                    <i class="fas fa-calendar"></i> Создано: ${new Date(task.createdAt).toLocaleDateString('ru-RU')}
                </div>
            `;
            
            document.getElementById('modalTasks').appendChild(taskItem);
        });
    });
    
    // Если нет смен
    if (document.getElementById('modalShifts').children.length === 0) {
        document.getElementById('modalShifts').innerHTML = `
            <div class="no-data">
                <i class="fas fa-user-clock" style="font-size: 2rem; margin-bottom: 12px;"></i>
                <p>Нет смен в этот день</p>
            </div>
        `;
    }
    
    // Если нет задач
    if (document.getElementById('modalTasks').children.length === 0) {
        document.getElementById('modalTasks').innerHTML = `
            <div class="no-data">
                <i class="fas fa-tasks" style="font-size: 2rem; margin-bottom: 12px;"></i>
                <p>Нет задач на этот день</p>
            </div>
        `;
    }
    
    // Отображение статистики
    const statsDiv = document.getElementById('modalStats');
    statsDiv.innerHTML = `
        <div class="d-flex gap-20 justify-center" style="flex-wrap: wrap;">
            <div class="total-card" style="min-width: 150px;">
                <div class="total-label">Сотрудников на смене</div>
                <div class="big-number">${totalEmployees}</div>
            </div>
            <div class="total-card" style="min-width: 150px;">
                <div class="total-label">Всего часов</div>
                <div class="big-number">${totalHours.toFixed(1)}</div>
            </div>
            <div class="total-card" style="min-width: 150px;">
                <div class="total-label">Задач</div>
                <div class="big-number">${totalTasks}</div>
                <div class="total-label-small">${completedTasks} выполнено</div>
            </div>
        </div>
    `;
    
    // Показ модального окна
    document.getElementById('dayModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('dayModal').style.display = 'none';
}

// ==================== ЗАДАЧИ ====================
function updateTaskSelect() {
    const select = document.getElementById('taskEmployee');
    if (!select) return;
    
    select.innerHTML = '<option value="">— Выберите сотрудника —</option>';
    
    Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = employee.name;
        select.appendChild(option);
    });
}

async function addTask() {
    const employeeId = document.getElementById('taskEmployee').value;
    const date = document.getElementById('taskDate').value;
    const text = document.getElementById('newTaskText').value.trim();
    
    if (!employeeId || !date || !text) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (text.length < 3) {
        showNotification('Текст задачи должен содержать не менее 3 символов', 'error');
        return;
    }
    
    const taskKey = `${employeeId}:${date}`;
    if (!tasks[taskKey]) {
        tasks[taskKey] = [];
    }
    
    tasks[taskKey].push({
        text: text,
        report: '',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    
    await saveData();
    renderTasks();
    renderGeneralCalendar();
    
    // Очистка поля ввода
    document.getElementById('newTaskText').value = '';
    document.getElementById('newTaskText').focus();
    
    showNotification('Задача добавлена', 'success');
}

function renderTasks() {
    const employeeId = document.getElementById('taskEmployee').value;
    const date = document.getElementById('taskDate').value;
    const list = document.getElementById('taskList');
    
    if (!list) return;
    
    if (!employeeId || !date) {
        list.innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--text-muted);">
                <i class="fas fa-clipboard-list" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>Выберите сотрудника и дату для просмотра задач</p>
            </div>
        `;
        return;
    }
    
    const taskKey = `${employeeId}:${date}`;
    const taskList = tasks[taskKey] || [];
    
    if (taskList.length === 0) {
        list.innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--text-muted);">
                <i class="fas fa-clipboard-list" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>Нет задач на выбранную дату</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = '';
    
    taskList.forEach((task, index) => {
        const item = document.createElement('div');
        item.className = 'task-item';
        item.innerHTML = `
            <div class="d-flex justify-between align-center">
                <div class="task-text">${task.text}</div>
                <div>
                    ${task.completed ? 
                        '<span class="badge badge-success"><i class="fas fa-check"></i> Выполнено</span>' : 
                        '<span class="badge badge-secondary"><i class="fas fa-clock"></i> В работе</span>'
                    }
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Отчёт о выполнении</label>
                <textarea class="task-report-input" 
                          placeholder="Опишите выполнение задачи..." 
                          oninput="updateTaskReport('${employeeId}', '${date}', ${index}, this.value)">${task.report}</textarea>
            </div>
            
            <div class="d-flex justify-between align-center">
                <div>
                    <button class="btn btn-sm ${task.completed ? 'btn-outline' : 'btn-success'}" 
                            onclick="toggleTaskCompletion('${employeeId}', '${date}', ${index})">
                        <i class="fas ${task.completed ? 'fa-undo' : 'fa-check'}"></i>
                        ${task.completed ? 'Возобновить' : 'Завершить'}
                    </button>
                </div>
                <div class="task-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteTask('${employeeId}', '${date}', ${index})">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
            
            <div style="font-size: 0.8rem; color: var(--text-muted);">
                <i class="fas fa-calendar"></i> Создано: ${new Date(task.createdAt).toLocaleString('ru-RU')}
                ${task.updatedAt !== task.createdAt ? 
                    `<br><i class="fas fa-edit"></i> Обновлено: ${new Date(task.updatedAt).toLocaleString('ru-RU')}` : 
                    ''
                }
            </div>
        `;
        list.appendChild(item);
    });
}

async function updateTaskReport(employeeId, date, index, report) {
    const taskKey = `${employeeId}:${date}`;
    if (tasks[taskKey] && tasks[taskKey][index]) {
        tasks[taskKey][index].report = report;
        tasks[taskKey][index].updatedAt = Date.now();
        await saveData();
        renderGeneralCalendar();
    }
}

async function toggleTaskCompletion(employeeId, date, index) {
    const taskKey = `${employeeId}:${date}`;
    if (tasks[taskKey] && tasks[taskKey][index]) {
        tasks[taskKey][index].completed = !tasks[taskKey][index].completed;
        tasks[taskKey][index].updatedAt = Date.now();
        await saveData();
        renderTasks();
        renderGeneralCalendar();
        
        const status = tasks[taskKey][index].completed ? 'выполнена' : 'возобновлена';
        showNotification(`Задача ${status}`, 'success');
    }
}

async function deleteTask(employeeId, date, index) {
    const taskKey = `${employeeId}:${date}`;
    if (tasks[taskKey] && tasks[taskKey][index]) {
        if (!confirm('Удалить задачу?')) return;
        
        tasks[taskKey].splice(index, 1);
        if (tasks[taskKey].length === 0) {
            delete tasks[taskKey];
        }
        await saveData();
        renderTasks();
        renderGeneralCalendar();
        showNotification('Задача удалена', 'success');
    }
}

// ==================== НАВИГАЦИЯ ====================
function prevMonth(general = false) {
    currentDate.setMonth(currentDate.getMonth() - 1);
    if (general) {
        renderGeneralCalendar();
        renderEmployeeDashboard();
    } else {
        renderPersonalCalendar();
    }
}

function nextMonth(general = false) {
    currentDate.setMonth(currentDate.getMonth() + 1);
    if (general) {
        renderGeneralCalendar();
        renderEmployeeDashboard();
    } else {
        renderPersonalCalendar();
    }
}

function goToToday(general = false) {
    currentDate = new Date();
    if (general) {
        renderGeneralCalendar();
        renderEmployeeDashboard();
    } else {
        renderPersonalCalendar();
    }
    showNotification('Переход к текущему месяцу', 'info');
}

function openTab(tabId) {
    // Скрыть все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Убрать активный класс у всех кнопок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    document.getElementById(tabId).classList.add('active');
    
    // Активировать кнопку выбранной вкладки
    document.querySelector(`.tab-btn[onclick="openTab('${tabId}')"]`).classList.add('active');
    
    // Обновление данных на вкладках
    if (tabId === 'general') {
        renderGeneralCalendar();
        renderEmployeeDashboard();
    } else if (tabId === 'tasks') {
        renderTasks();
    }
}

// ==================== ИМПОРТ/ЭКСПОРТ ====================
function exportData() {
    const data = {
        employees: employees,
        schedules: schedules,
        tasks: tasks,
        settings: settings,
        exportDate: new Date().toISOString(),
        version: '2.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `workshift-manager-backup-${formatDate(new Date())}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('Данные экспортированы в JSON', 'success');
}

function exportToCSV() {
    // Экспорт сотрудников
    let csv = 'Сотрудники\n';
    csv += 'ID,ФИО,Ставка (₽/ч),Цвет\n';
    
    Object.values(employees).forEach(emp => {
        csv += `${emp.id},"${emp.name}",${emp.rate},"${emp.color}"\n`;
    });
    
    csv += '\n\nСмены\n';
    csv += 'ID сотрудника,Дата,Часы,Тип,Примечания\n';
    
    Object.keys(schedules).forEach(empId => {
        Object.keys(schedules[empId]).forEach(date => {
            const shift = schedules[empId][date];
            csv += `${empId},${date},${shift.hours},${shift.type},"${shift.notes || ''}"\n`;
        });
    });
    
    csv += '\n\nЗадачи\n';
    csv += 'Ключ,Текст задачи,Отчёт,Выполнено,Создано\n';
    
    Object.keys(tasks).forEach(key => {
        tasks[key].forEach(task => {
            csv += `${key},"${task.text}","${task.report}",${task.completed},${new Date(task.createdAt).toISOString()}\n`;
        });
    });
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workshift-data-${formatDate(new Date())}.csv`;
    link.click();
    
    showNotification('Данные экспортированы в CSV', 'success');
}

async function importData() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('Выберите файл для импорта', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Проверка версии и структуры данных
            if (!data.employees || !data.schedules || !data.tasks) {
                throw new Error('Некорректный формат файла');
            }
            
            // Подтверждение импорта
            if (!confirm(`Импортировать данные? Это перезапишет текущие данные.`)) {
                return;
            }
            
            // Импорт данных
            employees = data.employees;
            schedules = data.schedules;
            tasks = data.tasks;
            if (data.settings) settings = data.settings;
            
            await saveData();
            updateUI();
            
            showNotification('Данные успешно импортированы', 'success');
            fileInput.value = '';
        } catch (error) {
            console.error('Ошибка импорта:', error);
            showNotification('Ошибка импорта данных. Проверьте формат файла.', 'error');
        }
    };
    
    reader.readAsText(file);
}

function createBackup() {
    const backup = {
        employees: employees,
        schedules: schedules,
        tasks: tasks,
        settings: settings,
        backupDate: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEYS.BACKUP, JSON.stringify(backup));
    showNotification('Резервная копия создана', 'success');
}

async function restoreBackup() {
    const backupData = localStorage.getItem(STORAGE_KEYS.BACKUP);
    
    if (!backupData) {
        showNotification('Резервная копия не найдена', 'error');
        return;
    }
    
    if (!confirm('Восстановить данные из резервной копии? Текущие данные будут потеряны.')) {
        return;
    }
    
    try {
        const backup = JSON.parse(backupData);
        employees = backup.employees;
        schedules = backup.schedules;
        tasks = backup.tasks;
        settings = backup.settings;
        
        await saveData();
        updateUI();
        
        showNotification('Данные восстановлены из резервной копии', 'success');
    } catch (error) {
        console.error('Ошибка восстановления:', error);
        showNotification('Ошибка восстановления данных', 'error');
    }
}

async function clearAllData() {
    if (!confirm('ВНИМАНИЕ: Это действие удалит ВСЕ данные без возможности восстановления. Продолжить?')) {
        return;
    }
    
    if (!confirm('Вы уверены? Это действие невозможно отменить.')) {
        return;
    }
    
    employees = {};
    schedules = {};
    tasks = {};
    settings = { ...DEFAULT_SETTINGS };
    currentEmployeeId = null;
    
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    
    createDemoData();
    await saveData();
    updateUI();
    showNotification('Все данные удалены', 'success');
}

// ==================== UI FUNCTIONS ====================
function updateUI() {
    updateEmployeeUI();
    updateTaskSelect();
    renderPersonalCalendar();
    renderGeneralCalendar();
    renderEmployeeDashboard();
    renderTasks();
}
// ==================== ТЕМА ====================

// Загружаем сохранённую тему при старте
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('themeIcon').classList.replace('fa-sun', 'fa-moon');
    } else {
        document.body.classList.remove('light-theme');
        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');
    }
}

// Переключение темы
function toggleTheme() {
    if (document.body.classList.contains('light-theme')) {
        // Переходим в тёмную
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');
        showNotification('Тёмная тема включена', 'info');
    } else {
        // Переходим в светлую
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        document.getElementById('themeIcon').classList.replace('fa-sun', 'fa-moon');
        showNotification('Светлая тема включена', 'info');
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initApp() {
    // Установка текущей даты в поле выбора даты
    const today = new Date();
    const taskDateInput = document.getElementById('taskDate');
    if (taskDateInput) {
        taskDateInput.value = formatDate(today);
        taskDateInput.min = '2000-01-01';
        taskDateInput.max = '2100-12-31';
    }
    
    // Обработчики событий
    const employeeSelect = document.getElementById('employeeSelect');
    if (employeeSelect) {
        employeeSelect.addEventListener('change', function(e) {
            currentEmployeeId = e.target.value;
            renderPersonalCalendar();
        });
    }
    
    const taskEmployeeSelect = document.getElementById('taskEmployee');
    if (taskEmployeeSelect) {
        taskEmployeeSelect.addEventListener('change', renderTasks);
    }
    
    const taskDateSelect = document.getElementById('taskDate');
    if (taskDateSelect) {
        taskDateSelect.addEventListener('change', renderTasks);
    }
    
    // Enter для добавления задачи
    const newTaskText = document.getElementById('newTaskText');
    if (newTaskText) {
        newTaskText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTask();
            }
        });
    }
    
    // Enter для добавления сотрудника
    const newNameInput = document.getElementById('newName');
    if (newNameInput) {
        newNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addEmployee();
            }
        });
    }
    
    // Закрытие модального окна при клике вне его
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('dayModal');
        if (event.target === modal) {
            closeModal();
        }
        
        const shiftModal = document.getElementById('shiftEditorModal');
        if (event.target === shiftModal && shiftModal) {
            shiftModal.remove();
        }
    });
}

// Экспорт функций в глобальную область видимости
window.initApp = initApp;
window.loadData = loadData;
window.saveData = saveData;
window.addEmployee = addEmployee;
window.editEmployee = editEmployee;
window.deleteEmployee = deleteEmployee;
window.openTab = openTab;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToToday = goToToday;
window.addTask = addTask;
window.updateTaskReport = updateTaskReport;
window.toggleTaskCompletion = toggleTaskCompletion;
window.deleteTask = deleteTask;
window.showDayDetail = showDayDetail;
window.closeModal = closeModal;
window.exportData = exportData;
window.exportToCSV = exportToCSV;
window.importData = importData;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.clearAllData = clearAllData;