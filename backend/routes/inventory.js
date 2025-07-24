const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Add this helper to get io instance
function emitInventoryUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('inventoryUpdated');
}

// Get all inventory items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, quantity, available, created_at FROM inventory ORDER BY name'
    );

    res.json({
      inventory: result.rows
    });

  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get inventory' 
    });
  }
});

// Get inventory item by ID
router.get('/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const result = await pool.query(
      'SELECT id, name, quantity, available, created_at FROM inventory WHERE id = $1',
      [itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Item not found' 
      });
    }

    res.json({
      item: result.rows[0]
    });

  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get inventory item' 
    });
  }
});

// Add inventory item (admin only)
router.post('/', authenticateToken, requireAdmin, [
  body('name').notEmpty().withMessage('Item name is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { name, quantity } = req.body;

    // Check if item already exists
    const existingItem = await pool.query(
      'SELECT id FROM inventory WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Item already exists', 
        message: 'An item with this name already exists' 
      });
    }

    // Insert new item
    const result = await pool.query(
      'INSERT INTO inventory (name, quantity, available) VALUES ($1, $2, $3) RETURNING id, name, quantity, available',
      [name, quantity, quantity]
    );

    const newItem = result.rows[0];

    emitInventoryUpdate(req);

    res.status(201).json({
      message: 'Inventory item added successfully',
      item: newItem
    });

  } catch (error) {
    console.error('Add inventory item error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to add inventory item' 
    });
  }
});

// Update inventory item (admin only)
router.put('/:itemId', authenticateToken, requireAdmin, [
  body('name').optional().notEmpty().withMessage('Item name cannot be empty'),
  body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { itemId } = req.params;
    const { name, quantity } = req.body;

    // Check if item exists
    const itemResult = await pool.query(
      'SELECT id, name, quantity, available FROM inventory WHERE id = $1',
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Item not found' 
      });
    }

    const currentItem = itemResult.rows[0];

    // If updating quantity, ensure it's not less than borrowed items
    if (quantity !== undefined) {
      const borrowedCount = currentItem.quantity - currentItem.available;
      if (quantity < borrowedCount) {
        return res.status(400).json({ 
          error: 'Invalid quantity', 
          message: `Cannot set quantity to ${quantity}. There are ${borrowedCount} items currently borrowed.` 
        });
      }
    }

    // Check for name conflict if updating name
    if (name && name !== currentItem.name) {
      const nameConflict = await pool.query(
        'SELECT id FROM inventory WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, itemId]
      );

      if (nameConflict.rows.length > 0) {
        return res.status(400).json({ 
          error: 'Name conflict', 
          message: 'An item with this name already exists' 
        });
      }
    }

    // Update item
    const updateQuery = `
      UPDATE inventory 
      SET name = COALESCE($1, name), 
          quantity = COALESCE($2, quantity),
          available = CASE 
            WHEN $2 IS NOT NULL THEN $2 - (quantity - available)
            ELSE available 
          END
      WHERE id = $3 
      RETURNING id, name, quantity, available
    `;

    const result = await pool.query(updateQuery, [name, quantity, itemId]);

    emitInventoryUpdate(req);

    res.json({
      message: 'Inventory item updated successfully',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to update inventory item' 
    });
  }
});

// Remove inventory item (admin only)
router.delete('/:itemId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;

    // Check if item exists and has no borrowed items
    const itemResult = await pool.query(
      'SELECT id, name, quantity, available FROM inventory WHERE id = $1',
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Item not found' 
      });
    }

    const item = itemResult.rows[0];

    // Check if all items are available
    if (item.quantity !== item.available) {
      const borrowedCount = item.quantity - item.available;
      return res.status(400).json({ 
        error: 'Cannot remove item', 
        message: `Cannot remove item. ${borrowedCount} units are currently borrowed.` 
      });
    }

    // Delete item
    await pool.query('DELETE FROM inventory WHERE id = $1', [itemId]);

    emitInventoryUpdate(req);

    res.json({
      message: 'Inventory item removed successfully',
      removedItem: item
    });

  } catch (error) {
    console.error('Remove inventory item error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to remove inventory item' 
    });
  }
});

// Get inventory statistics (admin only)
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(available) as total_available,
        SUM(quantity - available) as total_borrowed,
        COUNT(CASE WHEN available = 0 THEN 1 END) as out_of_stock_items
      FROM inventory
    `);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalItems: parseInt(stats.total_items),
        totalQuantity: parseInt(stats.total_quantity),
        totalAvailable: parseInt(stats.total_available),
        totalBorrowed: parseInt(stats.total_borrowed),
        outOfStockItems: parseInt(stats.out_of_stock_items)
      }
    });

  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get inventory statistics' 
    });
  }
});

// Search inventory items
router.get('/search/:query', authenticateToken, async (req, res) => {
  try {
    const { query } = req.params;
    const searchTerm = `%${query}%`;

    const result = await pool.query(
      'SELECT id, name, quantity, available FROM inventory WHERE LOWER(name) LIKE LOWER($1) ORDER BY name',
      [searchTerm]
    );

    res.json({
      items: result.rows
    });

  } catch (error) {
    console.error('Search inventory error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to search inventory' 
    });
  }
});

module.exports = router; 