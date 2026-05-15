// ============================================
// APARTA — Dashboard
// ============================================

const API_URL = '';

// Navegación entre secciones
document.querySelectorAll('.header nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target.getAttribute('href').substring(1);

        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(target).classList.add('active');

        document.querySelectorAll('.header nav a').forEach(a => a.classList.remove('active'));
        e.target.classList.add('active');

        if (target === 'dashboard') loadDashboard();
        if (target === 'citas') loadAppointments();
        if (target === 'pacientes') loadPatients();
        if (target === 'pagos') loadPayments();
    });
});

// Cargar estadísticas
async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}/api/stats`);
        const stats = await res.json();

        document.getElementById('stat-today').textContent = stats.appointmentsToday;
        document.getElementById('stat-patients').textContent = stats.totalPatients;
        document.getElementById('stat-pending').textContent = stats.pendingAppointments;
        document.getElementById('stat-revenue').textContent = `$${stats.monthlyRevenue.toLocaleString()}`;

        const today = new Date().toISOString().split('T')[0];
        const apptRes = await fetch(`${API_URL}/api/appointments?date_from=${today}&status=pending,confirmed,paid`);
        const appointments = await apptRes.json();

        const tbody = document.querySelector('#upcoming-table tbody');
        tbody.innerHTML = appointments.slice(0, 10).map(a => `
            <tr>
                <td>${formatDate(a.appointment_date || a.date)}</td>
                <td>${(a.appointment_time || a.time)?.slice(0, 5)}</td>
                <td>${a.patient_name}</td>
                <td>${a.session_type_name || a.type}</td>
                <td><span class="status status-${a.status}">${a.status}</span></td>
                <td>$${(a.price_mxn || a.fee)?.toLocaleString()}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

// Cargar citas
async function loadAppointments() {
    try {
        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;
        const status = document.getElementById('filter-status').value;

        let url = `${API_URL}/api/appointments`;
        const params = [];
        if (dateFrom) params.push(`date_from=${dateFrom}`);
        if (dateTo) params.push(`date_to=${dateTo}`);
        if (status) params.push(`status=${status}`);
        if (params.length) url += '?' + params.join('&');

        const res = await fetch(url);
        const appointments = await res.json();

        const tbody = document.querySelector('#appointments-table tbody');
        tbody.innerHTML = appointments.map(a => `
            <tr>
                <td>#${a.id.toString().slice(0, 8)}</td>
                <td>${formatDate(a.appointment_date || a.date)}</td>
                <td>${(a.appointment_time || a.time)?.slice(0, 5)}</td>
                <td>${a.patient_name}</td>
                <td>${a.session_type_name || a.type}</td>
                <td><span class="status status-${a.status}">${a.status}</span></td>
                <td>$${(a.price_mxn || a.fee)?.toLocaleString()}</td>
                <td>
                    ${a.status !== 'cancelled' && a.status !== 'completed'
                        ? `<button onclick="cancelAppointment('${a.id}')">Cancelar</button>`
                        : '-'}
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Appointments error:', err);
    }
}

// Cancelar cita
async function cancelAppointment(id) {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
        await fetch(`${API_URL}/api/appointments/${id}`, { method: 'DELETE' });
        loadAppointments();
        loadDashboard();
    } catch (err) {
        alert('Error al cancelar');
    }
}

// Cargar pacientes
async function loadPatients() {
    try {
        const search = document.getElementById('patient-search').value;
        let url = `${API_URL}/api/patients`;
        if (search) url += `?search=${encodeURIComponent(search)}`;

        const res = await fetch(url);
        const patients = await res.json();

        const tbody = document.querySelector('#patients-table tbody');
        tbody.innerHTML = patients.map(p => `
            <tr>
                <td>${p.full_name || p.name}</td>
                <td>${p.email || '-'}</td>
                <td>${p.phone || '-'}</td>
                <td>${p.notes || '-'}</td>
                <td>${formatDate(p.created_at?.split('T')[0])}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Patients error:', err);
    }
}

// Cargar pagos
async function loadPayments() {
    try {
        const res = await fetch(`${API_URL}/api/payments`);
        const payments = await res.json();

        const tbody = document.querySelector('#payments-table tbody');
        tbody.innerHTML = payments.map(p => `
            <tr>
                <td>#${p.id.toString().slice(0, 8)}</td>
                <td>${p.patient_name || '-'}</td>
                <td>${p.appointment_date ? formatDate(p.appointment_date) : '-'}</td>
                <td>$${(p.amount_mxn || p.amount)?.toLocaleString()}</td>
                <td>${p.payment_type || p.method || '-'}</td>
                <td><span class="status status-${p.status}">${p.status}</span></td>
                <td>${formatDate(p.created_at?.split('T')[0])}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Payments error:', err);
    }
}

// Helpers
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Inicializar
loadDashboard();
