const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function emitUsersUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('usersUpdated');
}

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, role, student_id, course, created_at FROM users ORDER BY created_at DESC'
    );

    // Map student_id to studentId for students
    const users = result.rows.map(u =>
      u.role === 'Student'
        ? { ...u, studentId: u.student_id, student_id: undefined }
        : u
    );

    res.json({
      users
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get users' 
    });
  }
});

// Get users by role (admin only)
router.get('/role/:role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.params;

    if (!['Student', 'Lecturer', 'Admin'].includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role' 
      });
    }

    const result = await pool.query(
      'SELECT id, name, role, student_id, course, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
      [role]
    );

    // Map student_id to studentId for students
    const users = result.rows.map(u =>
      u.role === 'Student'
        ? { ...u, studentId: u.student_id, student_id: undefined }
        : u
    );

    res.json({
      users
    });

  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get users' 
    });
  }
});

// Get lecturers (for lab reservations)
router.get('/lecturers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, role FROM users WHERE role = $1 ORDER BY name',
      ['Lecturer']
    );

    res.json({
      lecturers: result.rows
    });

  } catch (error) {
    console.error('Get lecturers error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get lecturers' 
    });
  }
});

// Public: Get lecturers for login dropdown
router.get('/public-lecturers', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM users WHERE role = $1 ORDER BY name',
      ['Lecturer']
    );
    res.json({ lecturers: result.rows });
  } catch (error) {
    console.error('Get public lecturers error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get lecturers' 
    });
  }
});

// Add user (admin only)
router.post('/', authenticateToken, requireAdmin, [
  body('name').notEmpty().withMessage('Name cannot be empty'),
  body('email').isEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['Student', 'Lecturer', 'Admin']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { name, email, password, role } = req.body;

    // Check if user with email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        error: 'User with this email already exists' 
      });
    }

    const bcrypt = require('bcryptjs');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, passwordHash, role]
    );

    emitUsersUpdate(req);

    res.status(201).json({
      message: 'User added successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to add user' 
    });
  }
});

// Remove user (admin only)
router.delete('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from removing themselves
    if (req.user.id === userId) {
      return res.status(400).json({ 
        error: 'Cannot remove yourself' 
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, name, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Check for active reservations/lending records
    const activeReservations = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM printer_reservations WHERE user_id = $1 AND status IN ('Pending', 'Approved')) as printer_reservations,
        (SELECT COUNT(*) FROM lab_reservations WHERE user_id = $1 AND status IN ('Pending', 'Approved')) as lab_reservations,
        (SELECT COUNT(*) FROM lending_records WHERE user_id = $1 AND status = 'Borrowed') as lending_records`,
      [userId]
    );

    const counts = activeReservations.rows[0];
    if (counts.printer_reservations > 0 || counts.lab_reservations > 0 || counts.lending_records > 0) {
      return res.status(400).json({ 
        error: 'Cannot remove user', 
        message: 'User has active reservations or borrowed items',
        details: {
          printerReservations: parseInt(counts.printer_reservations),
          labReservations: parseInt(counts.lab_reservations),
          lendingRecords: parseInt(counts.lending_records)
        }
      });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    emitUsersUpdate(req);

    res.json({
      message: 'User removed successfully',
      removedUser: userResult.rows[0]
    });

  } catch (error) {
    console.error('Remove user error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to remove user' 
    });
  }
});

// Update user (admin only)
router.put('/:userId', authenticateToken, requireAdmin, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('course').optional().notEmpty().withMessage('Course cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { userId } = req.params;
    const { name, course } = req.body;

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, name, role, student_id, course FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Build update query based on user role
    let updateQuery, updateParams;
    if (user.role === 'Student') {
      updateQuery = 'UPDATE users SET name = COALESCE($1, name), course = COALESCE($2, course) WHERE id = $3 RETURNING id, name, role, student_id, course';
      updateParams = [name, course, userId];
    } else {
      updateQuery = 'UPDATE users SET name = COALESCE($1, name) WHERE id = $2 RETURNING id, name, role, student_id, course';
      updateParams = [name, userId];
    }

    const result = await pool.query(updateQuery, updateParams);

    emitUsersUpdate(req);

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to update user' 
    });
  }
});

// Get user statistics (admin only)
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'Student' THEN 1 END) as students,
        COUNT(CASE WHEN role = 'Lecturer' THEN 1 END) as lecturers,
        COUNT(CASE WHEN role = 'Admin' THEN 1 END) as admins,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30_days
      FROM users
    `);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalUsers: parseInt(stats.total_users),
        students: parseInt(stats.students),
        lecturers: parseInt(stats.lecturers),
        admins: parseInt(stats.admins),
        newUsers30Days: parseInt(stats.new_users_30_days)
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get user statistics' 
    });
  }
});

// Admin: Change any user's password
router.put('/:userId/change-password', authenticateToken, requireAdmin, [
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }
    const { userId } = req.params;
    const { newPassword } = req.body;
    // Check if user exists
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Hash new password
    const bcrypt = require('bcryptjs');
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNewPassword, userId]);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Admin change user password error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to change password' });
  }
});

// Admin: Get notifications
router.get('/notifications', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to get notifications' });
  }
});

// User: Get their own notifications
router.get('/:userId/notifications', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    // Only allow the user themselves or admin to fetch
    if (req.user.id !== parseInt(userId) && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [userId]
    );
    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to get notifications' });
  }
});

module.exports = router; 