const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const seedData = async () => {
  try {
    // 🌱 Starting database seeding...
    const saltRounds = 10;

    // Check if admin user already exists
    const adminExists = await pool.query('SELECT id FROM users WHERE role = $1', ['Admin']);
    
    if (adminExists.rows.length === 0) {
      // Create admin user
      const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
      
      await pool.query(
        'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3)',
        ['Admin User', 'Admin', adminPasswordHash]
      );
      // ✅ Admin user created (username: Admin User, password: admin123)
    } else {
      // ℹ️  Admin user already exists
    }

    // Check if sample lecturers exist
    const lecturersExist = await pool.query('SELECT id FROM users WHERE role = $1', ['Lecturer']);
    
    if (lecturersExist.rows.length === 0) {
      // Create sample lecturers
      const lecturerPasswordHash = await bcrypt.hash('lecturer123', saltRounds);
      
      const lecturers = [
        { name: 'Dr. John Smith', password: lecturerPasswordHash },
        { name: 'Prof. Sarah Johnson', password: lecturerPasswordHash },
        { name: 'Dr. Michael Brown', password: lecturerPasswordHash }
      ];

      for (const lecturer of lecturers) {
        await pool.query(
          'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3)',
          [lecturer.name, 'Lecturer', lecturer.password]
        );
      }
      // ✅ Sample lecturers created (password: lecturer123)
    } else {
      // ℹ️  Lecturers already exist
    }

    // Check if sample students exist
    const studentsExist = await pool.query('SELECT id FROM users WHERE role = $1', ['Student']);
    
    if (studentsExist.rows.length === 0) {
      // Create sample students
      const studentPasswordHash = await bcrypt.hash('student123', saltRounds);
      
      const students = [
        { name: 'Alice Johnson', studentId: 'STU001', course: 'Computer Science' },
        { name: 'Bob Wilson', studentId: 'STU002', course: 'Electrical Engineering' },
        { name: 'Carol Davis', studentId: 'STU003', course: 'Mechanical Engineering' },
        { name: 'David Miller', studentId: 'STU004', course: 'Computer Science' },
        { name: 'Eva Garcia', studentId: 'STU005', course: 'Electrical Engineering' }
      ];

      for (const student of students) {
        await pool.query(
          'INSERT INTO users (name, role, student_id, course, password_hash) VALUES ($1, $2, $3, $4, $5)',
          [student.name, 'Student', student.studentId, student.course, studentPasswordHash]
        );
      }
      // ✅ Sample students created (password: student123)
    } else {
      // ℹ️  Students already exist
    }

    // Check if inventory items exist
    const inventoryExists = await pool.query('SELECT id FROM inventory LIMIT 1');
    
    if (inventoryExists.rows.length === 0) {
      // Create sample inventory items
      const inventoryItems = [
        { name: 'Resistor Kit (1000 pcs)', quantity: 10, available: 10 },
        { name: 'Arduino Uno R3', quantity: 5, available: 5 },
        { name: 'Breadboard Pack', quantity: 20, available: 20 },
        { name: 'LED Set (100 pcs)', quantity: 15, available: 15 },
        { name: 'Capacitor Kit (500 pcs)', quantity: 8, available: 8 },
        { name: 'Multimeter', quantity: 3, available: 3 },
        { name: 'Oscilloscope Probe Set', quantity: 2, available: 2 },
        { name: 'Soldering Iron', quantity: 4, available: 4 },
        { name: 'Jumper Wires (100 pcs)', quantity: 12, available: 12 },
        { name: 'Power Supply Unit', quantity: 2, available: 2 }
      ];

      for (const item of inventoryItems) {
        await pool.query(
          'INSERT INTO inventory (name, quantity, available) VALUES ($1, $2, $3)',
          [item.name, item.quantity, item.available]
        );
      }
      // ✅ Sample inventory items created
    } else {
      // ℹ️  Inventory items already exist
    }

    // Check if printers exist
    const printersExist = await pool.query('SELECT id FROM printers LIMIT 1');
    
    if (printersExist.rows.length === 0) {
      // Create sample printers
      const printers = [
        { name: 'Alpha Mark I', status: 'Available', filamentGrams: 1000 },
        { name: 'Beta Mark II', status: 'Available', filamentGrams: 1000 },
        { name: 'Gamma Mark III', status: 'Available', filamentGrams: 1000 }
      ];

      for (const printer of printers) {
        await pool.query(
          'INSERT INTO printers (name, status, filament_available_grams) VALUES ($1, $2, $3)',
          [printer.name, printer.status, printer.filamentGrams]
        );
      }
      // ✅ Sample printers created
    } else {
      // ℹ️  Printers already exist
    }

    // 🎉 Database seeding completed successfully!
    // 📋 Default Login Credentials:
    // 👨‍💼 Admin: Admin User / admin123
    // 👨‍🏫 Lecturer: Dr. John Smith / lecturer123
    // 👨‍🎓 Student: Alice Johnson (STU001) / student123
    
  } catch (error) {
    // ❌ Seeding failed:
    throw error;
  }
};

const runSeeding = async () => {
  try {
    await seedData();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

runSeeding(); 