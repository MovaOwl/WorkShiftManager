// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ ==================== 
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
    startOfWeek: 1 // 1 = Понедельник 
}; 

const SHIFT_TYPES = { 
    DAY: { id: 'day', name: 'Дневная', hours: 12, color: 'var(--day-shift)', icon: 'fas fa-sun' }, 
    NIGHT: { id: 'night', name: 'Ночная', hours: 12, color: 'var(--night-shift)', icon: 'fas fa-moon' }, 
    CUSTOM: { id: 'custom', name: 'Индивидуальные', color: 'var(--custom-shift)', icon: 'fas fa-user-clock' } 
}; 

let employees = {};      // { "Иванов И.И.": { rate: 500, color: "#58a6ff", id: "uuid" } } 
let schedules = {};      // { "employeeId": { "2023-12-25": { hours: 12, type: "day", notes: "" } } } 
let tasks = {};          // { "employeeId:2023-12-25": [{ text: "Task", report: "", completed: false, createdAt: timestamp }] } 
let settings = { ...DEFAULT_SETTINGS }; 
let currentDate = new Date(); 
let currentEmployeeId = null; 
let employeeColors = [ 
    '#58a6ff', '#79c0ff', '#d2a8ff', '#ffa8f8',  
    '#f8c73c', '#ff7b72', '#a5ff7b', '#ff8cdc', 
    '#56d364', '#ffa657', '#6e7681', '#bc8cff' 
]; 

// ==================== УТИЛИТЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================== 
function showNotification(message, type = 'info', duration = 3000) { 
    const notification = document.getElementById('notification'); 
    const text = document.getElementById('notificationText'); 
     
    notification.className = `notification notification-${type}`; 
    text.textContent = message; 
    notification.classList.add('show'); 
     
    setTimeout(() => { 
        notification.classList.remove('show'); 
    }, duration); 
} 

function formatDate(date) { 
    return date.toISOString().split('T')[0]; 
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

function getEmployeeIdByName(name) { 
    const employee = Object.values(employees).find(emp => emp.name === name); 
    return employee ? employee.id : null; 
} 

function getEmployeeNameById(id) { 
    const employee = Object.values(employees).find(emp => emp.id === id); 
    return employee ? employee.name : 'Неизвестный сотрудник'; 
} 

function getEmployeeColor(id) { 
    const employee = Object.values(employees).find(emp => emp.id === id); 
    return employee ? employee.color : '#6e7681'; 
} 

function parseDateString(dateStr) { 
    const [year, month, day] = dateStr.split('-').map(Number); 
    return new Date(year, month - 1, day); 
} 

// =============== ЗАГРУЗКА ДАННЫХ ИЗ ОБЛАКА (Firestore) ===============
async function loadData() {
    if (!auth || !auth.currentUser) {
        showNotification('Не вошли в аккаунт', 'error');
        return;
    }

    const userId = auth.currentUser.uid; // уникальный ID пользователя

    try {
        const docRef = doc(db, 'users', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            employees = data.employees || {};
            schedules = data.schedules || {};
            tasks = data.tasks || {};
            settings = data.settings || { ...DEFAULT_SETTINGS };

            showNotification('Данные загружены из облака', 'success');
        } else {
            // Первый вход — создаём демо-данные
            createDemoData();
            await saveData(); // сразу сохраняем в облако
            showNotification('Создан новый аккаунт с демо-данными', 'success');
        }

        // Обновляем весь интерфейс (твои оригинальные функции)
        updateEmployeeUI();
        updateTaskSelect();
        renderPersonalCalendar();
        renderGeneralCalendar();
        renderEmployeeDashboard();
    } catch (error) {
        console.error('Ошибка загрузки из облака:', error);
        showNotification('Ошибка загрузки данных. Попробуйте позже.', 'error');
        
        // Фолбэк: если облако не работает — грузим из localStorage (резерв)
        // Раскомментируй если нужно:
        // const employeesData = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
        // if (employeesData) employees = JSON.parse(employeesData);
        // ... аналогично для других
    }
}

// =============== СОХРАНЕНИЕ В ОБЛАКО (Firestore) ===============
async function saveData() {
    if (!auth || !auth.currentUser) {
        showNotification('Не вошли в аккаунт — данные не сохранены', 'error');
        return;
    }

    const userId = auth.currentUser.uid;

    try {
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
            employees: employees,
            schedules: schedules,
            tasks: tasks,
            settings: settings,
            updatedAt: serverTimestamp()
        }, { merge: true }); // merge: true — обновляет только изменённое

        showNotification('Данные сохранены в облако', 'success');
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка сохранения в облако', 'error');
    }
}
// ==================== РАБОТА С СОТРУДНИКАМИ ==================== 
function addEmployee() { 
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
     
    saveData(); 
    updateEmployeeUI(); 
    updateTaskSelect(); 
     
    // Очистка полей ввода 
    nameInput.value = ''; 
    rateInput.value = settings.defaultHourlyRate; 
    nameInput.focus(); 
     
    showNotification(`Сотрудник "${name}" добавлен`, 'success'); 
} 

function updateEmployeeUI() { 
    const select = document.getElementById('employeeSelect'); 
    const list = document.getElementById('employeeList'); 
     
    // Обновление выпадающего списка 
    select.innerHTML = '<option value="">— Выберите сотрудника —</option>'; 
     
    Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => { 
        const option = document.createElement('option'); 
        option.value = employee.id; 
        option.textContent = `${employee.name} (${employee.rate} ₽/ч)`; 
        select.appendChild(option); 
    }); 
     
    // Установка текущего сотрудника, если не выбран 
    if (currentEmployeeId && employees[currentEmployeeId]) { 
        select.value = currentEmployeeId; 
    } else if (Object.keys(employees).length > 0) { 
        currentEmployeeId = Object.keys(employees)[0]; 
        select.value = currentEmployeeId; 
    } 
     
    // Обновление списка сотрудников 
    list.innerHTML = ''; 
     
    if (Object.keys(employees).length === 0) { 
        list.innerHTML = ` 
            <div class="text-center" style="padding: 40px; color: var(--text-muted); grid-column: 1/-1;"> 
                <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i> 
                <p>Список сотрудников пуст. Добавьте первого сотрудника.</p> 
            </div> 
        `; 
        return; 
    } 
     
    Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => { 
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

function editEmployee(employeeId) { 
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
     
    // Проверка на дубликат (кроме текущего сотрудника) 
    const isDuplicate = Object.values(employees).some(emp =>  
        emp.id !== employeeId && emp.name.toLowerCase() === newName.toLowerCase() 
    ); 
     
    if (isDuplicate) { 
        showNotification('Сотрудник с таким ФИО уже существует', 'error'); 
        return; 
    } 
     
    employee.name = newName.trim(); 
    employee.rate = rate; 
     
    saveData(); 
    updateEmployeeUI(); 
    updateTaskSelect(); 
    renderPersonalCalendar(); 
    renderGeneralCalendar(); 
    renderEmployeeDashboard(); 
     
    showNotification('Данные сотрудника обновлены', 'success'); 
} 

function deleteEmployee(employeeId) { 
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
     
    // Обновление текущего сотрудника, если он был удален 
    if (currentEmployeeId === employeeId) { 
        const remainingIds = Object.keys(employees); 
        currentEmployeeId = remainingIds.length > 0 ? remainingIds[0] : null; 
    } 
     
    saveData(); 
    updateEmployeeUI(); 
    updateTaskSelect(); 
    renderPersonalCalendar(); 
    renderGeneralCalendar(); 
    renderEmployeeDashboard(); 
     
    showNotification(`Сотрудник "${employee.name}" удален`, 'success'); 
} 

// ==================== КАЛЕНДАРИ И ГРАФИКИ ==================== 
function getMonthDays(year, month) { 
    const firstDay = new Date(year, month, 1); 
    const lastDay = new Date(year, month + 1, 0); 
     
    // Начало недели (понедельник) 
    const startDay = new Date(firstDay); 
    const dayOfWeek = startDay.getDay(); 
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Если воскресенье, то 6 дней назад 
    startDay.setDate(startDay.getDate() - diff); 
     
    return { firstDay, lastDay, startDay }; 
} 

function renderPersonalCalendar() { 
    if (!currentEmployeeId) { 
        document.getElementById('personalDays').innerHTML = ` 
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
    const { firstDay, lastDay, startDay } = getMonthDays(year, month); 
    const employee = employees[currentEmployeeId]; 
     
    // Обновление заголовка 
    const monthYear = currentDate.toLocaleString('ru-RU', {  
        month: 'long',  
        year: 'numeric'  
    }).replace(/^\w/, c => c.toUpperCase()); 
     
    document.getElementById('personalMonthYear').textContent = monthYear; 
     
    // Очистка контейнера 
    const container = document.getElementById('personalDays'); 
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
             
            const shiftType = SHIFT_TYPES[shiftEntry.type.toUpperCase()]; 
            const shiftDiv = document.createElement('div'); 
            shiftDiv.className = `shift-info shift-${shiftEntry.type}`; 
            shiftDiv.innerHTML = ` 
                ${shiftType.name}<br> 
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
        dayDiv.addEventListener('click', () => { 
            if (!isCurrentMonth) return; 
            openShiftEditor(dateStr, shiftEntry); 
        }); 
         
        container.appendChild(dayDiv); 
    } 
     
    // Обновление статистики 
    const totalSalary = Math.round(totalHours * employee.rate); 
    updatePersonalTotals(workedDays, totalHours, totalSalary); 
} 

function openShiftEditor(dateStr, existingEntry = null) { 
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
     
    const modalHtml = ` 
        <div class="modal" id="shiftEditorModal" style="display: flex;"> 
            <div class="modal-content"> 
                <div class="modal-header"> 
                    <h2 class="modal-title"> 
                        <i class="fas fa-user-clock"></i> 
                        Настройка смены на ${formattedDate} 
                    </h2> 
                    <button class="close-modal" onclick="document.getElementById('shiftEditorModal').remove()">×</button> 
                </div> 
                 
                <div class="modal-section"> 
                    <div class="form-group"> 
                        <label class="form-label">Тип смены</label> 
                        <div class="d-flex gap-10"> 
                            <button class="btn ${shiftType === 'day' ? 'btn-success' : 'btn-outline'}"  
                                    onclick="selectShiftType('day')" style="flex: 1;"> 
                                <i class="fas fa-sun"></i> Дневная (12 ч) 
                            </button> 
                            <button class="btn ${shiftType === 'night' ? 'btn-danger' : 'btn-outline'}"  
                                    onclick="selectShiftType('night')" style="flex: 1;"> 
                                <i class="fas fa-moon"></i> Ночная (12 ч) 
                            </button> 
                            <button class="btn ${shiftType === 'custom' ? 'btn-warning' : 'btn-outline'}"  
                                    onclick="selectShiftType('custom')" style="flex: 1;"> 
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
                    <button class="btn btn-danger" onclick="deleteShift('${dateStr}')"> 
                        <i class="fas fa-trash"></i> Удалить смену 
                    </button> 
                    <div class="d-flex gap-10"> 
                        <button class="btn btn-outline" onclick="document.getElementById('shiftEditorModal').remove()"> 
                            Отмена 
                        </button> 
                        <button class="btn btn-success" onclick="saveShift('${dateStr}')"> 
                            <i class="fas fa-save"></i> Сохранить 
                        </button> 
                    </div> 
                </div> 
            </div> 
        </div> 
    `; 
     
    document.body.insertAdjacentHTML('beforeend', modalHtml); 
     
    window.selectShiftType = function(type) { 
        shiftType = type; 
        document.querySelectorAll('#shiftEditorModal .btn').forEach(btn => { 
            btn.className = btn.className.replace('btn-success btn-danger btn-warning', 'btn-outline'); 
        }); 
         
        const buttons = document.querySelectorAll('#shiftEditorModal .btn'); 
        if (type === 'day') buttons[0].className = buttons[0].className.replace('btn-outline', 'btn-success'); 
        if (type === 'night') buttons[1].className = buttons[1].className.replace('btn-outline', 'btn-danger'); 
        if (type === 'custom') buttons[2].className = buttons[2].className.replace('btn-outline', 'btn-warning'); 
         
        const customHoursGroup = document.getElementById('customHoursGroup'); 
        customHoursGroup.style.display = type === 'custom' ? 'block' : 'none'; 
         
        if (type !== 'custom') { 
            shiftHours = SHIFT_TYPES[type.toUpperCase()].hours; 
            document.getElementById('shiftHours').value = shiftHours; 
        } 
    }; 
     
    window.saveShift = function(dateStr) { 
        const hoursInput = document.getElementById('shiftHours'); 
        const notesInput = document.getElementById('shiftNotes'); 
         
        shiftHours = parseFloat(hoursInput.value) || 12; 
        shiftNotes = notesInput.value.trim(); 
         
        if (shiftHours <= 0) { 
            // Если часы = 0, удаляем смену 
            delete schedules[currentEmployeeId][dateStr]; 
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
        } 
         
        saveData(); 
        renderPersonalCalendar(); 
        renderGeneralCalendar(); 
        renderEmployeeDashboard(); 
         
        document.getElementById('shiftEditorModal').remove(); 
        showNotification('Смена сохранена', 'success'); 
    }; 
     
    window.deleteShift = function(dateStr) { 
        if (confirm('Удалить смену?')) { 
            if (schedules[currentEmployeeId]) { 
                delete schedules[currentEmployeeId][dateStr]; 
            } 
             
            saveData(); 
            renderPersonalCalendar(); 
            renderGeneralCalendar(); 
            renderEmployeeDashboard(); 
             
            document.getElementById('shiftEditorModal').remove(); 
            showNotification('Смена удалена', 'success'); 
        } 
    }; 
} 

function updatePersonalTotals(days, hours, salary) { 
    document.getElementById('personalWorkedDays').textContent = days; 
    document.getElementById('personalTotalHours').textContent = hours.toFixed(1); 
    document.getElementById('personalTotalSalary').textContent = formatCurrency(salary); 
} 

function renderGeneralCalendar() { 
    const year = currentDate.getFullYear(); 
    const month = currentDate.getMonth(); 
    const { firstDay, lastDay, startDay } = getMonthDays(year, month); 
     
    // Обновление заголовка 
    const monthYear = currentDate.toLocaleString('ru-RU', {  
        month: 'long',  
        year: 'numeric'  
    }).replace(/^\w/, c => c.toUpperCase()); 
     
    document.getElementById('generalMonthYear').textContent = monthYear; 
     
    // Обновление цветов сотрудников 
    const colorsDiv = document.getElementById('employeeColors'); 
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
     
    // Очистка контейнера 
    const container = document.getElementById('generalDays'); 
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
         
        // Задачи всех сотрудников 
        Object.values(employees).forEach(employee => { 
            const taskKey = `${employee.id}:${dateStr}`; 
            const taskList = tasks[taskKey] || []; 
             
            taskList.forEach(task => { 
                if (task.completed || task.report) { 
                    const taskDiv = document.createElement('div'); 
                    taskDiv.className = 'task-in-day'; 
                    taskDiv.title = `${employee.name}: ${task.text}`; 
                    taskDiv.innerHTML = ` 
                        <strong>${employee.name.split(' ')[0]}:</strong>  
                        ${task.text.substring(0, 20)}${task.text.length > 20 ? '...' : ''} 
                        ${task.report ? '<div class="task-report">' + task.report.substring(0, 30) + '...</div>' : ''} 
                    `; 
                    dayDiv.appendChild(taskDiv); 
                } 
            }); 
        }); 
         
        // Обработчик клика для просмотра деталей 
        dayDiv.addEventListener('click', () => { 
            if (!isCurrentMonth) return; 
            showDayDetail(dateStr); 
        }); 
         
        container.appendChild(dayDiv); 
    } 
} 

function renderEmployeeDashboard() { 
    const dashboard = document.getElementById('employeeDashboard'); 
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

// ==================== МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ДНЯ ==================== 
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
                    <span class="badge badge-${shiftEntry.type}">${shiftEntry.hours} ч</span> 
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
                    <i class="fas fa-calendar"></i> ${new Date(task.createdAt).toLocaleDateString('ru-RU')} 
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

// ==================== УПРАВЛЕНИЕ ЗАДАЧАМИ ==================== 
function updateTaskSelect() { 
    const select = document.getElementById('taskEmployee'); 
    select.innerHTML = '<option value="">— Выберите сотрудника —</option>'; 
     
    Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => { 
        const option = document.createElement('option'); 
        option.value = employee.id; 
        option.textContent = employee.name; 
        select.appendChild(option); 
    }); 
} 

function addTask() { 
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
     
    saveData(); 
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

function updateTaskReport(employeeId, date, index, report) { 
    const taskKey = `${employeeId}:${date}`; 
    if (tasks[taskKey] && tasks[taskKey][index]) { 
        tasks[taskKey][index].report = report; 
        tasks[taskKey][index].updatedAt = Date.now(); 
        saveData(); 
        renderGeneralCalendar(); 
    } 
} 

function toggleTaskCompletion(employeeId, date, index) { 
    const taskKey = `${employeeId}:${date}`; 
    if (tasks[taskKey] && tasks[taskKey][index]) { 
        tasks[taskKey][index].completed = !tasks[taskKey][index].completed; 
        tasks[taskKey][index].updatedAt = Date.now(); 
        saveData(); 
        renderTasks(); 
        renderGeneralCalendar(); 
         
        const status = tasks[taskKey][index].completed ? 'выполнена' : 'возобновлена'; 
        showNotification(`Задача ${status}`, 'success'); 
    } 
} 

function deleteTask(employeeId, date, index) { 
    const taskKey = `${employeeId}:${date}`; 
    if (tasks[taskKey] && tasks[taskKey][index]) { 
        if (!confirm('Удалить задачу?')) return; 
         
        tasks[taskKey].splice(index, 1); 
        if (tasks[taskKey].length === 0) { 
            delete tasks[taskKey]; 
        } 
        saveData(); 
        renderTasks(); 
        renderGeneralCalendar(); 
        showNotification('Задача удалена', 'success'); 
    } 
} 

// ==================== НАВИГАЦИЯ И УПРАВЛЕНИЕ ==================== 
function prevMonth(general = false) { 
    currentDate.setMonth(currentDate.getMonth() - 1); 
    general ? renderGeneralCalendar() : renderPersonalCalendar(); 
    if (general) renderEmployeeDashboard(); 
} 

function nextMonth(general = false) { 
    currentDate.setMonth(currentDate.getMonth() + 1); 
    general ? renderGeneralCalendar() : renderPersonalCalendar(); 
    if (general) renderEmployeeDashboard(); 
} 

function goToToday(general = false) { 
    currentDate = new Date(); 
    general ? renderGeneralCalendar() : renderPersonalCalendar(); 
    if (general) renderEmployeeDashboard(); 
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
    } else if (tabId === 'settings') { 
        // Загрузка настроек 
    } 
} 

// ==================== ИМПОРТ/ЭКСПОРТ И НАСТРОЙКИ ==================== 
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

function importData() { 
    const fileInput = document.getElementById('importFile'); 
    const file = fileInput.files[0]; 
     
    if (!file) { 
        showNotification('Выберите файл для импорта', 'error'); 
        return; 
    } 
     
    const reader = new FileReader(); 
    reader.onload = function(e) { 
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
             
            saveData(); 
            loadData(); 
             
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

function restoreBackup() { 
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
         
        saveData(); 
        loadData(); 
         
        showNotification('Данные восстановлены из резервной копии', 'success'); 
    } catch (error) { 
        console.error('Ошибка восстановления:', error); 
        showNotification('Ошибка восстановления данных', 'error'); 
    } 
} 

function clearAllData() { 
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
     
    loadData(); 
    showNotification('Все данные удалены', 'success'); 
} 

// ==================== ИНИЦИАЛИЗАЦИЯ ==================== 
document.addEventListener('DOMContentLoaded', function() { 
    // Установка текущей даты в поле выбора даты 
    const today = new Date(); 
    document.getElementById('taskDate').value = formatDate(today); 
     
    // Обработчики событий 
    document.getElementById('employeeSelect').addEventListener('change', function(e) { 
        currentEmployeeId = e.target.value; 
        renderPersonalCalendar(); 
    }); 
     
    document.getElementById('taskEmployee').addEventListener('change', renderTasks); 
    document.getElementById('taskDate').addEventListener('change', renderTasks); 
     
    // Закрытие модального окна при клике вне его 
    window.addEventListener('click', function(event) { 
        const modal = document.getElementById('dayModal'); 
        if (event.target === modal) { 
            closeModal(); 
        } 
    }); 
     
    // Загрузка данных 
    loadData(); 
     
    // Показ приветственного сообщения 
    setTimeout(() => { 
        showNotification('WorkShift Manager загружен и готов к работе!', 'success', 4000); 
    }, 1000); 
 // =============== АУТЕНТИФИКАЦИЯ (модульный API 2026) ===============

let isRegisterMode = false;

// Переключение режимов (регистрация/вход)
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').textContent = isRegisterMode ? 'Регистрация' : 'Вход в аккаунт';
    document.getElementById('authSubmit').textContent = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
    document.getElementById('authError').classList.add('hidden');
}

// Обработка входа/регистрации
async function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';

    if (!email || !password) {
        errorDiv.textContent = 'Заполните все поля';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Проверка полного email
    if (!email.includes('@')) {
        errorDiv.textContent = 'Введите полный email (например, igor@mail.ru)';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        if (isRegisterMode) {
            await createUserWithEmailAndPassword(auth, email, password);
            showNotification('Аккаунт создан!', 'success');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showNotification('Добро пожаловать!', 'success');
        }
    } catch (error) {
        let message = 'Ошибка: ';
        switch (error.code) {
            case 'auth/email-already-in-use': message += 'Email уже используется'; break;
            case 'auth/invalid-email': message += 'Неверный email'; break;
            case 'auth/weak-password': message += 'Пароль слишком короткий (минимум 6 символов)'; break;
            case 'auth/user-not-found':
            case 'auth/wrong-password': message += 'Неверный email или пароль'; break;
            default: message += error.message;
        }
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

// Добавляем обработчики событий (после загрузки DOM)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authSubmit').addEventListener('click', handleAuth);
    document.getElementById('toggleAuthLink').addEventListener('click', toggleAuthMode);

    // Твои оригинальные обработчики (если есть)
    // ...
});

// Мониторинг статуса входа
onAuthStateChanged(auth, user => {
    if (user) {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        loadData(); // загружаем данные
        
        // Кнопка выхода
        if (!document.querySelector('#logoutBtn')) {
            const header = document.querySelector('.header');
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.className = 'btn btn-outline';
            logoutBtn.textContent = 'Выйти';
            logoutBtn.addEventListener('click', () => {
                signOutAuth(auth);
                showNotification('Вы вышли', 'info');
            });
            header.appendChild(logoutBtn);
        }
        
        setTimeout(() => showNotification('WorkShift Manager готов!', 'success', 4000), 1000);
    } else {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        
        const btn = document.querySelector('#logoutBtn');
        if (btn) btn.remove();
    }
});
     });