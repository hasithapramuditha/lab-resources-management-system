const pool = require('../config/database');

const createTables = async () => {
  try {
    // 🔄 Starting database migration...

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('Student', 'Lecturer', 'Admin')),
        student_id VARCHAR(50) UNIQUE,
        course VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Users table created

    // Create inventory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        available INTEGER NOT NULL CHECK (available >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Inventory table created

    // Create printers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS printers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance')),
        filament_available_grams INTEGER NOT NULL DEFAULT 0 CHECK (filament_available_grams >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Printers table created

    // Add filament_type column if not exists
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='printers' AND column_name='filament_type') THEN
          ALTER TABLE printers ADD COLUMN filament_type VARCHAR(50);
        END IF;
      END$$;
    `);

    // Create printer_reservations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS printer_reservations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(255) NOT NULL,
        printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
        printer_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        time_slot_id VARCHAR(50) NOT NULL,
        requested_time_slots INTEGER NOT NULL CHECK (requested_time_slots > 0),
        filament_needed_grams INTEGER NOT NULL DEFAULT 0 CHECK (filament_needed_grams >= 0),
        uses_own_filament BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Started', 'Stopped', 'Rejected', 'Completed', 'Cancelled')),
        request_timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Printer reservations table created

    // Create lab_reservations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lab_reservations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        time_slot_id VARCHAR(50) NOT NULL,
        purpose VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled')),
        request_timestamp BIGINT NOT NULL,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Lab reservations table created

    // Create lending_records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lending_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(255) NOT NULL,
        item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        item_name VARCHAR(255) NOT NULL,
        quantity_borrowed INTEGER NOT NULL CHECK (quantity_borrowed > 0),
        borrow_date TIMESTAMP, -- allow NULL for pending requests
        expected_return_date DATE NOT NULL,
        actual_return_date TIMESTAMP,
        status VARCHAR(50) NOT NULL DEFAULT 'Borrowed' CHECK (status IN ('Borrowed', 'Returned', 'Pending', 'Rejected')),
        request_timestamp BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Lending records table created

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        item_id VARCHAR(255),
        item_name VARCHAR(255),
        expected_return_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // ✅ Notifications table created

    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_printers_status ON printers(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_printer_reservations_date ON printer_reservations(date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_printer_reservations_user ON printer_reservations(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_printer_reservations_status ON printer_reservations(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lab_reservations_date ON lab_reservations(date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lab_reservations_user ON lab_reservations(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lab_reservations_status ON lab_reservations(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lending_records_user ON lending_records(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lending_records_status ON lending_records(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_lending_records_expected_return ON lending_records(expected_return_date)');
    // ✅ Database indexes created

    // 🎉 Database migration completed successfully!
    
  } catch (error) {
    // Migration failed:
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

const runMigration = async () => {
  try {
    await createTables();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration(); 