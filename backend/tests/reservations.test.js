const request = require('supertest');
const app = require('../server');

describe('Reservations API', () => {
  let adminToken, lecturerToken, createdPrinterReservationId, createdLabReservationId;

  beforeAll(async () => {
    // Login as admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'Admin User', password: 'admin123', role: 'Admin' });
    adminToken = adminRes.body.token;

    // Login as lecturer
    const lecturerRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'Dr. John Smith', password: 'lecturer123', role: 'Lecturer' });
    lecturerToken = lecturerRes.body.token;
  });

  // ----------- Printer Reservations -----------
  it('should list printer reservations (admin)', async () => {
    const res = await request(app)
      .get('/api/reservations/printers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.reservations)).toBe(true);
  });

  it('should create a printer reservation (lecturer)', async () => {
    // Get a printer id
    const printersRes = await request(app)
      .get('/api/printers')
      .set('Authorization', `Bearer ${lecturerToken}`);
    const printer = printersRes.body.printers[0];
    expect(printer).toBeDefined();
    const res = await request(app)
      .post('/api/reservations/printers')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        printerId: printer.id,
        date: '2024-07-01',
        timeSlotId: '08:00-08:30',
        requestedTimeSlots: 1,
        filamentNeededGrams: 10,
        usesOwnFilament: false
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.reservation).toBeDefined();
    createdPrinterReservationId = res.body.reservation.id;
  });

  it('should update printer reservation status (admin)', async () => {
    const res = await request(app)
      .put(`/api/reservations/printers/${createdPrinterReservationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/updated/);
  });

  it('should cancel printer reservation (lecturer)', async () => {
    const res = await request(app)
      .put(`/api/reservations/printers/${createdPrinterReservationId}/cancel`)
      .set('Authorization', `Bearer ${lecturerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/cancelled/);
  });

  // ----------- Lab Reservations -----------
  it('should list lab reservations (admin)', async () => {
    const res = await request(app)
      .get('/api/reservations/labs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.reservations)).toBe(true);
  });

  it('should create a lab reservation (lecturer)', async () => {
    const res = await request(app)
      .post('/api/reservations/labs')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        date: '2024-07-01',
        timeSlotId: '08:00-09:00',
        purpose: 'Lab Session'
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.reservation).toBeDefined();
    createdLabReservationId = res.body.reservation.id;
  });

  it('should update lab reservation status (admin)', async () => {
    const res = await request(app)
      .put(`/api/reservations/labs/${createdLabReservationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved', adminNotes: 'Approved for lab session' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/updated/);
  });

  it('should cancel lab reservation (lecturer)', async () => {
    const res = await request(app)
      .put(`/api/reservations/labs/${createdLabReservationId}/cancel`)
      .set('Authorization', `Bearer ${lecturerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/cancelled/);
  });
}); 