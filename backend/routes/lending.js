const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function emitLendingUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('lendingUpdated');
}

function emitInventoryUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('inventoryUpdated');
}

// Get all lending records
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, userId } = req.query;
    let query = `
      SELECT 
        lr.id,
        lr.user_id,
        lr.user_name,
        lr.item_id,
        lr.item_name,
        lr.quantity_borrowed,
        lr.borrow_date,
        lr.expected_return_date,
        lr.actual_return_date,
        lr.status,
        u.role as user_role
      FROM lending_records lr
      JOIN users u ON lr.user_id = u.id
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` WHERE lr.status = $${paramCount}`;
      params.push(status);
    }

    if (userId) {
      paramCount++;
      query += status ? ` AND lr.user_id = $${paramCount}` : ` WHERE lr.user_id = $${paramCount}`;
      params.push(userId);
    }

    query += ' ORDER BY lr.borrow_date DESC';

    const result = await pool.query(query, params);

    res.json({
      lendingRecords: result.rows
    });

  } catch (error) {
    console.error('Get lending records error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get lending records' 
    });
  }
});

// Get lending record by ID
router.get('/:recordId', authenticateToken, async (req, res) => {
  try {
    const { recordId } = req.params;

    const result = await pool.query(
      `SELECT 
        lr.id,
        lr.user_id,
        lr.user_name,
        lr.item_id,
        lr.item_name,
        lr.quantity_borrowed,
        lr.borrow_date,
        lr.expected_return_date,
        lr.actual_return_date,
        lr.status,
        u.role as user_role
       FROM lending_records lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = $1`,
      [recordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Lending record not found' 
      });
    }

    res.json({
      lendingRecord: result.rows[0]
    });

  } catch (error) {
    console.error('Get lending record error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get lending record' 
    });
  }
});

// Borrow item (request)
router.post('/borrow', authenticateToken, [
  body('itemId').notEmpty().withMessage('Item ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('expectedReturnDate').matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).withMessage('Expected return date must be in YYYY-MM-DD format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }
    const { itemId, quantity, expectedReturnDate } = req.body;
    // Check if item exists and has sufficient quantity (for pending, just check exists)
    const itemResult = await pool.query(
      'SELECT id, name, quantity, available FROM inventory WHERE id = $1',
      [itemId]
    );
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const item = itemResult.rows[0];
    // Validate return date (must be in the future)
    const expectedDate = new Date(expectedReturnDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expectedDate <= today) {
      return res.status(400).json({ error: 'Invalid return date', message: 'Expected return date must be in the future' });
    }
    // Get user name
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    // Create lending record (Pending)
    const now = Date.now();
    const lendingResult = await pool.query(
      `INSERT INTO lending_records 
       (user_id, user_name, item_id, item_name, quantity_borrowed, borrow_date, expected_return_date, status, request_timestamp)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, 'Pending', $7)
       RETURNING *`,
      [
        req.user.id,
        userResult.rows[0].name,
        itemId,
        item.name,
        quantity,
        expectedReturnDate,
        now
      ]
    );
    // Insert notification for admin
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message, item_id, item_name, expected_return_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'borrow_request',
        String(req.user.id),
        userResult.rows[0].name,
        `${userResult.rows[0].name} requested to borrow ${item.name} (Qty: ${quantity}) (Expected return: ${expectedReturnDate})`,
        String(itemId),
        item.name,
        expectedReturnDate
      ]
    );
    emitLendingUpdate(req);
    res.status(201).json({
      message: 'Borrow request submitted and pending admin approval',
      lendingRecord: lendingResult.rows[0]
    });
  } catch (error) {
    console.error('Borrow item error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to request borrow' });
  }
});

// Admin: Approve borrow request
router.put('/:recordId/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { recordId } = req.params;
    // Get lending record
    const recordResult = await pool.query('SELECT * FROM lending_records WHERE id = $1', [recordId]);
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lending record not found' });
    }
    const record = recordResult.rows[0];
    if (record.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }
    // Check inventory
    const itemResult = await pool.query('SELECT available FROM inventory WHERE id = $1', [record.item_id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    if (itemResult.rows[0].available < record.quantity_borrowed) {
      return res.status(400).json({ error: 'Insufficient quantity', message: `Only ${itemResult.rows[0].available} units available, but ${record.quantity_borrowed} requested` });
    }
    // Approve: set status to Borrowed, set borrow_date, update inventory
    await pool.query('UPDATE lending_records SET status = $1, borrow_date = $2 WHERE id = $3', ['Borrowed', new Date().toISOString(), recordId]);
    await pool.query('UPDATE inventory SET available = GREATEST(available - $1, 0) WHERE id = $2', [record.quantity_borrowed, record.item_id]);
    // Notification
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message, item_id, item_name, expected_return_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'borrow_approved',
        String(record.user_id),
        record.user_name,
        `Your request to borrow ${record.item_name} (Qty: ${record.quantity_borrowed}) has been approved.`,
        String(record.item_id),
        record.item_name,
        record.expected_return_date
      ]
    );
    emitLendingUpdate(req);
    emitInventoryUpdate(req);
    res.json({ message: 'Borrow request approved and item marked as borrowed.' });
  } catch (error) {
    console.error('Approve borrow error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to approve borrow request' });
  }
});

// Admin: Reject borrow request
router.put('/:recordId/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { recordId } = req.params;
    // Get lending record
    const recordResult = await pool.query('SELECT * FROM lending_records WHERE id = $1', [recordId]);
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lending record not found' });
    }
    const record = recordResult.rows[0];
    if (record.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be rejected' });
    }
    // Reject: set status to Rejected
    await pool.query('UPDATE lending_records SET status = $1 WHERE id = $2', ['Rejected', recordId]);
    // Notification
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message, item_id, item_name, expected_return_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'borrow_rejected',
        String(record.user_id),
        record.user_name,
        `Your request to borrow ${record.item_name} (Qty: ${record.quantity_borrowed}) was rejected by admin.`,
        String(record.item_id),
        record.item_name,
        record.expected_return_date
      ]
    );
    emitLendingUpdate(req);
    res.json({ message: 'Borrow request rejected.' });
  } catch (error) {
    console.error('Reject borrow error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to reject borrow request' });
  }
});

// Return item
router.put('/:recordId/return', authenticateToken, async (req, res) => {
  try {
    const { recordId } = req.params;

    // Get lending record
    const recordResult = await pool.query(
      'SELECT * FROM lending_records WHERE id = $1',
      [recordId]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Lending record not found' 
      });
    }

    const record = recordResult.rows[0];

    // Check if already returned
    if (record.status === 'Returned') {
      return res.status(400).json({ 
        error: 'Already returned', 
        message: 'This item has already been returned' 
      });
    }

    // Check permission: user can return their own, admin can return any
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ 
        error: 'Permission denied', 
        message: 'Only admins can mark items as returned.' 
      });
    }

    // Update lending record
    await pool.query(
      'UPDATE lending_records SET status = $1, actual_return_date = $2 WHERE id = $3',
      ['Returned', new Date().toISOString(), recordId]
    );

    // Update inventory available quantity
    await pool.query(
      'UPDATE inventory SET available = LEAST(available + $1, quantity) WHERE id = $2',
      [record.quantity_borrowed, record.item_id]
    );

    emitLendingUpdate(req);
    emitInventoryUpdate(req);

    res.json({
      message: 'Item returned successfully'
    });

  } catch (error) {
    console.error('Return item error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to return item' 
    });
  }
});

// Get overdue items
router.get('/overdue/items', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        lr.id,
        lr.user_id,
        lr.user_name,
        lr.item_id,
        lr.item_name,
        lr.quantity_borrowed,
        lr.borrow_date,
        lr.expected_return_date,
        lr.status,
        u.role as user_role,
        EXTRACT(DAY FROM NOW() - lr.expected_return_date::date) as days_overdue
       FROM lending_records lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.status = 'Borrowed' 
       AND lr.expected_return_date < NOW()
       ORDER BY lr.expected_return_date ASC`
    );

    res.json({
      overdueItems: result.rows
    });

  } catch (error) {
    console.error('Get overdue items error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get overdue items' 
    });
  }
});

// Get lending statistics (admin only)
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN status = 'Borrowed' THEN 1 END) as currently_borrowed,
        COUNT(CASE WHEN status = 'Returned' THEN 1 END) as returned,
        COUNT(CASE WHEN status = 'Borrowed' AND expected_return_date < NOW() THEN 1 END) as overdue,
        SUM(CASE WHEN status = 'Borrowed' THEN quantity_borrowed ELSE 0 END) as total_borrowed_quantity
      FROM lending_records
    `);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalRecords: parseInt(stats.total_records),
        currentlyBorrowed: parseInt(stats.currently_borrowed),
        returned: parseInt(stats.returned),
        overdue: parseInt(stats.overdue),
        totalBorrowedQuantity: parseInt(stats.total_borrowed_quantity)
      }
    });

  } catch (error) {
    console.error('Get lending stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get lending statistics' 
    });
  }
});

// Get user's borrowing history
router.get('/user/:userId/history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure both IDs are integers for comparison
    if (parseInt(req.user.id) !== parseInt(userId) && req.user.role !== 'Admin') {
      return res.status(403).json({ 
        error: 'Permission denied', 
        message: 'You can only view your own borrowing history' 
      });
    }

    const result = await pool.query(
      `SELECT 
        lr.id,
        lr.user_id,
        lr.user_name,
        lr.item_id,
        lr.item_name,
        lr.quantity_borrowed,
        lr.borrow_date,
        lr.expected_return_date,
        lr.actual_return_date,
        lr.status,
        u.role as user_role
       FROM lending_records lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.user_id = $1
       ORDER BY lr.borrow_date DESC`,
      [userId]
    );

    res.json({
      borrowingHistory: result.rows
    });

  } catch (error) {
    console.error('Get user borrowing history error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get borrowing history' 
    });
  }
});

module.exports = router; 