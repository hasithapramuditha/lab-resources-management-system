const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', [
  body('identifier').notEmpty().withMessage('Identifier is required'),
  body('password').notEmpty().withMessage('Password is required'),
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

    const { identifier, password, role } = req.body;

    // Build query based on role
    let query, params;
    if (role === 'Student') {
      query = 'SELECT * FROM users WHERE role = $1 AND student_id = $2';
      params = [role, identifier];
    } else {
      query = 'SELECT * FROM users WHERE role = $1 AND name = $2';
      params = [role, identifier];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Authentication failed', 
        message: 'Invalid credentials' 
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Authentication failed', 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Remove password from response
    delete user.password_hash;

    res.json({
      message: 'Login successful',
      token,
      user
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Login failed' 
    });
  }
});

// Register student (public endpoint)
router.post('/register/student', [
  body('name').notEmpty().withMessage('Name is required'),
  body('studentId').notEmpty().withMessage('Student ID is required'),
  body('course').notEmpty().withMessage('Course is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { name, studentId, course, password } = req.body;

    // Check if student ID already exists
    const existingStudent = await pool.query(
      'SELECT id FROM users WHERE student_id = $1',
      [studentId]
    );

    if (existingStudent.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Registration failed', 
        message: 'Student ID already exists' 
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new student
    const result = await pool.query(
      'INSERT INTO users (name, role, student_id, course, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, role, student_id, course',
      [name, 'Student', studentId, course, hashedPassword]
    );

    const newStudent = result.rows[0];

    res.status(201).json({
      message: 'Student registered successfully',
      user: newStudent
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Registration failed' 
    });
  }
});

// Add lecturer (admin only)
router.post('/register/lecturer', authenticateToken, requireAdmin, [
  body('name').notEmpty().withMessage('Name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { name, password } = req.body;

    // Check if lecturer already exists
    const existingLecturer = await pool.query(
      'SELECT id FROM users WHERE name = $1 AND role = $2',
      [name, 'Lecturer']
    );

    if (existingLecturer.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Registration failed', 
        message: 'Lecturer with this name already exists' 
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new lecturer
    const result = await pool.query(
      'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3) RETURNING id, name, role',
      [name, 'Lecturer', hashedPassword]
    );

    const newLecturer = result.rows[0];

    res.status(201).json({
      message: 'Lecturer added successfully',
      user: newLecturer
    });

  } catch (error) {
    console.error('Add lecturer error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to add lecturer' 
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, role, student_id, course FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    res.json({
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get profile' 
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
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

    const { currentPassword, newPassword } = req.body;

    // Get current user with password
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ 
        error: 'Invalid current password' 
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedNewPassword, req.user.id]
    );

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to change password' 
    });
  }
});

module.exports = router; 