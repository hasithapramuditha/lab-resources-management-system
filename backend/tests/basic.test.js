const request = require('supertest');
const app = require('../server');

describe('EEC Lab Backend API', () => {
  let adminToken;

  it('should return health check status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('should login as admin and return a JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'Admin User',
        password: 'admin123',
        role: 'Admin'
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    adminToken = res.body.token;
  });

  it('should get current admin profile', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('Admin');
  });

  it('should get all users (admin only)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('should get all inventory items', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.inventory)).toBe(true);
  });

  it('should get all printers', async () => {
    const res = await request(app)
      .get('/api/printers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.printers)).toBe(true);
  });
}); 