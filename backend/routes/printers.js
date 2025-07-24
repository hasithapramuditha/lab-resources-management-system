const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function emitPrintersUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('printersUpdated');
}

// Get all printers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, status, filament_available_grams, filament_type, created_at FROM printers ORDER BY name'
    );

    res.json({
      printers: result.rows
    });

  } catch (error) {
    console.error('Get printers error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get printers' 
    });
  }
});

// Get printer by ID
router.get('/:printerId', authenticateToken, async (req, res) => {
  try {
    const { printerId } = req.params;

    const result = await pool.query(
      'SELECT id, name, status, filament_available_grams, filament_type, created_at FROM printers WHERE id = $1',
      [printerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Printer not found' 
      });
    }

    res.json({
      printer: result.rows[0]
    });

  } catch (error) {
    console.error('Get printer error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get printer' 
    });
  }
});

// Update printer status (admin only)
router.put('/:printerId/status', authenticateToken, requireAdmin, [
  body('status').isIn(['Available', 'In Use', 'Maintenance']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { printerId } = req.params;
    const { status } = req.body;

    // Check if printer exists
    const printerResult = await pool.query(
      'SELECT id, name, status FROM printers WHERE id = $1',
      [printerId]
    );

    if (printerResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Printer not found' 
      });
    }

    // Update status
    const result = await pool.query(
      'UPDATE printers SET status = $1 WHERE id = $2 RETURNING id, name, status, filament_available_grams',
      [status, printerId]
    );

    emitPrintersUpdate(req);

    res.json({
      message: 'Printer status updated successfully',
      printer: result.rows[0]
    });

  } catch (error) {
    console.error('Update printer status error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to update printer status' 
    });
  }
});

// Update printer filament (admin only)
router.put('/:printerId/filament', authenticateToken, requireAdmin, [
  body('filamentGrams').isInt({ min: 0 }).withMessage('Filament grams must be a non-negative integer'),
  body('filamentType').isString().notEmpty().withMessage('Filament type is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        details: errors.array() 
      });
    }

    const { printerId } = req.params;
    const { filamentGrams, filamentType } = req.body;

    // Check if printer exists
    const printerResult = await pool.query(
      'SELECT id, name, filament_available_grams FROM printers WHERE id = $1',
      [printerId]
    );

    if (printerResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Printer not found' 
      });
    }

    // Update filament and filament type
    const result = await pool.query(
      'UPDATE printers SET filament_available_grams = $1, filament_type = $2 WHERE id = $3 RETURNING id, name, status, filament_available_grams, filament_type',
      [filamentGrams, filamentType, printerId]
    );

    emitPrintersUpdate(req);

    res.json({
      message: 'Printer filament updated successfully',
      printer: result.rows[0]
    });

  } catch (error) {
    console.error('Update printer filament error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to update printer filament' 
    });
  }
});

// Get printer statistics (admin only)
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_printers,
        COUNT(CASE WHEN status = 'Available' THEN 1 END) as available_printers,
        COUNT(CASE WHEN status = 'In Use' THEN 1 END) as in_use_printers,
        COUNT(CASE WHEN status = 'Maintenance' THEN 1 END) as maintenance_printers,
        SUM(filament_available_grams) as total_filament_grams
      FROM printers
    `);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalPrinters: parseInt(stats.total_printers),
        availablePrinters: parseInt(stats.available_printers),
        inUsePrinters: parseInt(stats.in_use_printers),
        maintenancePrinters: parseInt(stats.maintenance_printers),
        totalFilamentGrams: parseInt(stats.total_filament_grams)
      }
    });

  } catch (error) {
    console.error('Get printer stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get printer statistics' 
    });
  }
});

// Get available time slots for a printer on a specific date
router.get('/:printerId/available-slots/:date', authenticateToken, async (req, res) => {
  try {
    const { printerId, date } = req.params;

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format', 
        message: 'Date must be in YYYY-MM-DD format' 
      });
    }

    // Check if printer exists
    const printerResult = await pool.query(
      'SELECT id, name, status FROM printers WHERE id = $1',
      [printerId]
    );

    if (printerResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Printer not found' 
      });
    }

    const printer = printerResult.rows[0];

    // If printer is in maintenance, no slots are available
    if (printer.status === 'Maintenance') {
      return res.json({
        printer,
        availableSlots: []
      });
    }

    // Get all time slots (8:00 AM to 4:30 PM, 30-minute intervals)
    const timeSlots = [];
    const startHour = 8;
    const endHour = 16;
    const endMinute = 30;

    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === endHour && minute > endMinute) break;
        
        const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const nextMinute = minute + 30;
        const nextHour = nextMinute >= 60 ? hour + 1 : hour;
        const adjustedMinute = nextMinute >= 60 ? nextMinute - 60 : nextMinute;
        const endTime = `${nextHour.toString().padStart(2, '0')}:${adjustedMinute.toString().padStart(2, '0')}`;
        
        timeSlots.push({
          id: `${startTime}-${endTime}`,
          startTime,
          endTime
        });
      }
    }

    // Get existing reservations for this printer and date
    const reservationsResult = await pool.query(
      `SELECT time_slot_id, requested_time_slots 
       FROM printer_reservations 
       WHERE printer_id = $1 AND date = $2 AND status IN ('Pending', 'Approved')`,
      [printerId, date]
    );

    // Mark occupied slots
    const occupiedSlotIds = new Set();
    reservationsResult.rows.forEach(reservation => {
      const startIndex = timeSlots.findIndex(slot => slot.id === reservation.time_slot_id);
      if (startIndex !== -1) {
        for (let i = 0; i < reservation.requested_time_slots; i++) {
          if (startIndex + i < timeSlots.length) {
            occupiedSlotIds.add(timeSlots[startIndex + i].id);
          }
        }
      }
    });

    // Filter available slots
    const availableSlots = timeSlots.filter(slot => !occupiedSlotIds.has(slot.id));

    res.json({
      printer,
      availableSlots
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get available time slots' 
    });
  }
});

// Get printer usage history (admin only)
router.get('/:printerId/usage-history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { printerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check if printer exists
    const printerResult = await pool.query(
      'SELECT id, name FROM printers WHERE id = $1',
      [printerId]
    );

    if (printerResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Printer not found' 
      });
    }

    // Get usage history
    const historyResult = await pool.query(
      `SELECT 
        pr.id,
        pr.date,
        pr.time_slot_id,
        pr.requested_time_slots,
        pr.filament_needed_grams,
        pr.uses_own_filament,
        pr.status,
        pr.request_timestamp,
        u.name as user_name,
        u.role as user_role
       FROM printer_reservations pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.printer_id = $1
       ORDER BY pr.request_timestamp DESC
       LIMIT $2 OFFSET $3`,
      [printerId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      printer: printerResult.rows[0],
      history: historyResult.rows
    });

  } catch (error) {
    console.error('Get printer usage history error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get printer usage history' 
    });
  }
});

module.exports = router; 