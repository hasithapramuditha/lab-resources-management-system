const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, requireAdmin, requireLecturer } = require('../middleware/auth');

function emitReservationUpdate(req) {
  const io = req.app.get('io');
  if (io) io.emit('reservationUpdated');
}

// ===================== PRINTER RESERVATIONS =====================

// Get printer reservations
router.get('/printers', authenticateToken, async (req, res) => {
  try {
    const { status, userId } = req.query;
    let query = `
      SELECT pr.*, u.name AS "userName", p.name AS "printerName" 
      FROM printer_reservations pr
      JOIN users u ON pr.user_id = u.id
      JOIN printers p ON pr.printer_id = p.id
      WHERE 1=1`;
    const params = [];
    if (status) {
      params.push(status);
      query += ` AND pr.status = $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      query += ` AND pr.user_id = $${params.length}`;
    }
    query += ' ORDER BY pr.request_timestamp DESC';
    const result = await pool.query(query, params);
    // Map fields to camelCase for frontend compatibility
    const reservations = result.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.userName,
      printerId: r.printer_id,
      printerName: r.printerName,
      date: r.date,
      timeSlotId: r.time_slot_id,
      requestedTimeSlots: r.requested_time_slots,
      filamentNeededGrams: r.filament_needed_grams,
      usesOwnFilament: r.uses_own_filament,
      status: r.status,
      requestTimestamp: r.request_timestamp
    }));
    res.json({ reservations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch printer reservations' });
  }
});

// Create printer reservation
router.post('/printers', authenticateToken, async (req, res) => {
  try {
    const { printerId, date, timeSlotId, requestedTimeSlots, filamentNeededGrams, usesOwnFilament } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;
    // Get printer name
    const printerRes = await pool.query('SELECT name FROM printers WHERE id = $1', [printerId]);
    if (printerRes.rows.length === 0) return res.status(404).json({ error: 'Printer not found' });
    const printerName = printerRes.rows[0].name;
    const now = Date.now();
    const result = await pool.query(
      `INSERT INTO printer_reservations 
        (user_id, user_name, printer_id, printer_name, date, time_slot_id, requested_time_slots, filament_needed_grams, uses_own_filament, status, request_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10) RETURNING *`,
      [userId, userName, printerId, printerName, date, timeSlotId, requestedTimeSlots, filamentNeededGrams, usesOwnFilament, now]
    );
    // Insert notification for admin
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message, item_id, item_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'printer_booking',
        userId,
        userName,
        `${userName} requested printer booking for ${printerName} on ${date} (Slot: ${timeSlotId})`,
        printerId,
        printerName
      ]
    );
    emitReservationUpdate(req);
    res.status(201).json({ reservation: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create printer reservation' });
  }
});

// Update printer reservation status (admin only)
router.put('/printers/:reservationId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { status } = req.body;

    // Fetch the reservation
    const reservationRes = await pool.query('SELECT * FROM printer_reservations WHERE id = $1', [reservationId]);
    if (reservationRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const reservation = reservationRes.rows[0];

    // Only allow valid transitions
    const validTransitions = {
      'Approved': ['Started', 'Cancelled'],
      'Started': ['Stopped', 'Completed', 'Cancelled'],
      'Stopped': ['Started', 'Completed', 'Cancelled'],
      'Pending': ['Approved', 'Rejected', 'Cancelled'],
      'Rejected': [],
      'Completed': [],
      'Cancelled': []
    };
    if (!validTransitions[reservation.status] || !validTransitions[reservation.status].includes(status)) {
      console.error(`Invalid transition from ${reservation.status} to ${status}`);
      return res.status(400).json({ error: `Cannot change status from ${reservation.status} to ${status}` });
    }

    // Only deduct filament if starting, not already started, and not using own filament
    if (status === 'Started' && reservation.status === 'Approved' && !reservation.uses_own_filament) {
      const filamentToDeduct = parseInt(reservation.filament_needed_grams, 10);
      const printerId = parseInt(reservation.printer_id, 10);
      if (!isNaN(filamentToDeduct) && !isNaN(printerId)) {
        await pool.query(
          'UPDATE printers SET filament_available_grams = filament_available_grams - $1 WHERE id = $2',
          [filamentToDeduct, printerId]
        );
      }
    }
    // If cancelling an approved or started reservation, restore filament
    if (status === 'Cancelled' && (reservation.status === 'Approved' || reservation.status === 'Started') && !reservation.uses_own_filament) {
      const filamentToRestore = parseInt(reservation.filament_needed_grams, 10);
      const printerId = parseInt(reservation.printer_id, 10);
      if (!isNaN(filamentToRestore) && !isNaN(printerId)) {
        await pool.query(
          'UPDATE printers SET filament_available_grams = filament_available_grams + $1 WHERE id = $2',
          [filamentToRestore, printerId]
        );
      }
    }
    await pool.query('UPDATE printer_reservations SET status = $1 WHERE id = $2', [status, reservationId]);

    // Insert notification for the user
    let notifMsg = '';
    switch (status) {
      case 'Started': notifMsg = `Your print job for ${reservation.printer_name} has started.`; break;
      case 'Stopped': notifMsg = `Your print job for ${reservation.printer_name} has been stopped by admin.`; break;
      case 'Completed': notifMsg = `Your print job for ${reservation.printer_name} is completed.`; break;
      case 'Cancelled': notifMsg = `Your print job for ${reservation.printer_name} was cancelled.`; break;
      case 'Approved': notifMsg = `Your print job for ${reservation.printer_name} was approved.`; break;
      case 'Rejected': notifMsg = `Your print job for ${reservation.printer_name} was rejected.`; break;
      default: notifMsg = `Status of your print job for ${reservation.printer_name} changed to ${status}.`;
    }
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message, item_id, item_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'printer_status',
        reservation.user_id,
        reservation.user_name,
        notifMsg,
        reservation.printer_id,
        reservation.printer_name
      ]
    );
    emitReservationUpdate(req);
    res.json({ message: 'Printer reservation status updated' });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update printer reservation status', details: err.message });
  }
});

// Cancel printer reservation
router.put('/printers/:reservationId/cancel', authenticateToken, async (req, res) => {
  try {
    const { reservationId } = req.params;
    // Only allow user or admin to cancel
    const reservationRes = await pool.query('SELECT * FROM printer_reservations WHERE id = $1', [reservationId]);
    if (reservationRes.rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
    const reservation = reservationRes.rows[0];
    if (req.user.id !== reservation.user_id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    // If previously approved and not using own filament, restore filament
    if (reservation.status === 'Approved' && !reservation.uses_own_filament) {
      const filamentToRestore = parseInt(reservation.filament_needed_grams, 10);
      const printerId = parseInt(reservation.printer_id, 10);
      if (!isNaN(filamentToRestore) && !isNaN(printerId)) {
        await pool.query(
          'UPDATE printers SET filament_available_grams = filament_available_grams + $1 WHERE id = $2',
          [filamentToRestore, printerId]
        );
      }
    }
    await pool.query('UPDATE printer_reservations SET status = $1 WHERE id = $2', ['Cancelled', reservationId]);
    emitReservationUpdate(req);
    res.json({ message: 'Printer reservation cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel printer reservation' });
  }
});

// ===================== LAB RESERVATIONS =====================

// Get lab reservations
router.get('/labs', authenticateToken, async (req, res) => {
  try {
    const { status, userId } = req.query;
    let query = 'SELECT * FROM lab_reservations WHERE 1=1';
    const params = [];
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }
    query += ' ORDER BY request_timestamp DESC';
    const result = await pool.query(query, params);
    res.json({ reservations: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lab reservations' });
  }
});

// Create lab reservation (lecturers only)
router.post('/labs', authenticateToken, requireLecturer, async (req, res) => {
  try {
    const { date, timeSlotId, purpose } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;
    const now = Date.now();
    const result = await pool.query(
      `INSERT INTO lab_reservations 
        (user_id, user_name, date, time_slot_id, purpose, status, request_timestamp)
       VALUES ($1,$2,$3,$4,$5,'Pending',$6) RETURNING *`,
      [userId, userName, date, timeSlotId, purpose, now]
    );
    // Insert notification for admin
    await pool.query(
      `INSERT INTO notifications (type, user_id, user_name, message)
       VALUES ($1, $2, $3, $4)`,
      [
        'lab_booking',
        userId,
        userName,
        `${userName} requested lab booking on ${date} (Slot: ${timeSlotId}, Purpose: ${purpose})`
      ]
    );
    emitReservationUpdate(req);
    res.status(201).json({ reservation: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create lab reservation' });
  }
});

// Update lab reservation status (admin only)
router.put('/labs/:reservationId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { status, adminNotes } = req.body;
    await pool.query('UPDATE lab_reservations SET status = $1, admin_notes = $2 WHERE id = $3', [status, adminNotes, reservationId]);
    // Fetch reservation details for notification
    const reservationRes = await pool.query('SELECT * FROM lab_reservations WHERE id = $1', [reservationId]);
    if (reservationRes.rows.length > 0 && (status === 'Approved' || status === 'Rejected')) {
      const r = reservationRes.rows[0];
      // Format date as YYYY-MM-DD
      const formattedDate = new Date(r.date).toISOString().slice(0, 10);
      const message = `Your lab booking on ${formattedDate} (Slot: ${r.time_slot_id}, Purpose: ${r.purpose}) was ${status.toLowerCase()}.`;
      await pool.query(
        `INSERT INTO notifications (type, user_id, user_name, message)
         VALUES ($1, $2, $3, $4)`,
        [
          'lab_status',
          r.user_id,
          r.user_name,
          message
        ]
      );
    }
    emitReservationUpdate(req);
    res.json({ message: 'Lab reservation status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lab reservation status' });
  }
});

// Cancel lab reservation
router.put('/labs/:reservationId/cancel', authenticateToken, async (req, res) => {
  try {
    const { reservationId } = req.params;
    // Only allow user or admin to cancel
    const reservationRes = await pool.query('SELECT user_id FROM lab_reservations WHERE id = $1', [reservationId]);
    if (reservationRes.rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
    const reservation = reservationRes.rows[0];
    if (req.user.id !== reservation.user_id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    await pool.query('UPDATE lab_reservations SET status = $1 WHERE id = $2', ['Cancelled', reservationId]);
    emitReservationUpdate(req);
    res.json({ message: 'Lab reservation cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel lab reservation' });
  }
});

module.exports = router;
