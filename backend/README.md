# EEC Lab Resources Management System - Backend

A comprehensive backend API for managing EEC Lab resources including inventory, 3D printers, lab reservations, and lending systems.

## 🚀 Features

- **User Management**: Students, Lecturers, and Admins with role-based access control
- **Inventory Management**: Track items, quantities, and borrowing/returning
- **3D Printer Management**: Printer reservations with filament tracking
- **Lab Reservations**: Lab space booking for lecturers
- **Lending System**: Complete borrowing and return tracking
- **JWT Authentication**: Secure token-based authentication
- **PostgreSQL Database**: Robust relational database with proper constraints
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Proper error responses and logging

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **express-validator** - Input validation
- **helmet** - Security middleware
- **cors** - Cross-origin resource sharing
- **morgan** - HTTP request logging

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment template and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=eec_lab_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=5000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### 3. Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE eec_lab_db;
```

### 4. Run Migrations and Seed Data

```bash
# Create database tables
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 5. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## 📊 Default Login Credentials

After seeding, you can use these default accounts:

- **Admin**: `Admin User` / `admin123`
- **Lecturer**: `Dr. John Smith` / `lecturer123`
- **Student**: `Alice Johnson` (STU001) / `student123`

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register/student` - Student registration
- `POST /api/auth/register/lecturer` - Add lecturer (Admin only)
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/change-password` - Change password

### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/role/:role` - Get users by role
- `GET /api/users/lecturers` - Get all lecturers
- `DELETE /api/users/:userId` - Remove user
- `PUT /api/users/:userId` - Update user
- `GET /api/users/stats/overview` - User statistics

### Inventory
- `GET /api/inventory` - Get all inventory items
- `GET /api/inventory/:itemId` - Get specific item
- `POST /api/inventory` - Add item (Admin only)
- `PUT /api/inventory/:itemId` - Update item (Admin only)
- `DELETE /api/inventory/:itemId` - Remove item (Admin only)
- `GET /api/inventory/stats/overview` - Inventory statistics (Admin only)
- `GET /api/inventory/search/:query` - Search items

### Printers
- `GET /api/printers` - Get all printers
- `GET /api/printers/:printerId` - Get specific printer
- `PUT /api/printers/:printerId/status` - Update printer status (Admin only)
- `PUT /api/printers/:printerId/filament` - Update filament (Admin only)
- `GET /api/printers/stats/overview` - Printer statistics (Admin only)
- `GET /api/printers/:printerId/available-slots/:date` - Get available time slots
- `GET /api/printers/:printerId/usage-history` - Usage history (Admin only)

### Reservations
- `GET /api/reservations/printers` - Get printer reservations
- `POST /api/reservations/printers` - Create printer reservation
- `PUT /api/reservations/printers/:reservationId/status` - Update status (Admin only)
- `PUT /api/reservations/printers/:reservationId/cancel` - Cancel reservation
- `GET /api/reservations/labs` - Get lab reservations
- `POST /api/reservations/labs` - Create lab reservation (Lecturers only)
- `PUT /api/reservations/labs/:reservationId/status` - Update status (Admin only)
- `PUT /api/reservations/labs/:reservationId/cancel` - Cancel reservation
- `GET /api/reservations/labs/available-slots/:date` - Get available lab slots

### Lending
- `GET /api/lending` - Get lending records
- `GET /api/lending/:recordId` - Get specific record
- `POST /api/lending/borrow` - Borrow item
- `PUT /api/lending/:recordId/return` - Return item
- `GET /api/lending/overdue/items` - Get overdue items
- `GET /api/lending/stats/overview` - Lending statistics (Admin only)
- `GET /api/lending/user/:userId/history` - User borrowing history

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## 📝 Request/Response Examples

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "Admin User",
  "password": "admin123",
  "role": "Admin"
}
```

Response:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Admin User",
    "role": "Admin"
  }
}
```

### Create Printer Reservation
```bash
POST /api/reservations/printers
Authorization: Bearer <token>
Content-Type: application/json

{
  "printerId": 1,
  "date": "2024-01-15",
  "timeSlotId": "08:00-08:30",
  "requestedTimeSlots": 2,
  "filamentNeededGrams": 50,
  "usesOwnFilament": false
}
```

### Borrow Item
```bash
POST /api/lending/borrow
Authorization: Bearer <token>
Content-Type: application/json

{
  "itemId": 1,
  "quantity": 2,
  "expectedReturnDate": "2024-01-20"
}
```

## 🗄️ Database Schema

### Users Table
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `role` (ENUM: Student, Lecturer, Admin)
- `student_id` (VARCHAR, UNIQUE)
- `course` (VARCHAR)
- `password_hash` (VARCHAR)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Inventory Table
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR, UNIQUE)
- `quantity` (INTEGER)
- `available` (INTEGER)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Printers Table
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR, UNIQUE)
- `status` (ENUM: Available, In Use, Maintenance)
- `filament_available_grams` (INTEGER)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Printer Reservations Table
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FOREIGN KEY)
- `user_name` (VARCHAR)
- `printer_id` (INTEGER, FOREIGN KEY)
- `printer_name` (VARCHAR)
- `date` (DATE)
- `time_slot_id` (VARCHAR)
- `requested_time_slots` (INTEGER)
- `filament_needed_grams` (INTEGER)
- `uses_own_filament` (BOOLEAN)
- `status` (ENUM: Pending, Approved, Rejected, Completed, Cancelled)
- `request_timestamp` (BIGINT)

### Lab Reservations Table
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FOREIGN KEY)
- `user_name` (VARCHAR)
- `date` (DATE)
- `time_slot_id` (VARCHAR)
- `purpose` (VARCHAR)
- `status` (ENUM: Pending, Approved, Rejected, Completed, Cancelled)
- `request_timestamp` (BIGINT)
- `admin_notes` (TEXT)

### Lending Records Table
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FOREIGN KEY)
- `user_name` (VARCHAR)
- `item_id` (INTEGER, FOREIGN KEY)
- `item_name` (VARCHAR)
- `quantity_borrowed` (INTEGER)
- `borrow_date` (TIMESTAMP)
- `expected_return_date` (DATE)
- `actual_return_date` (TIMESTAMP)
- `status` (ENUM: Borrowed, Returned)

## 🧪 Testing

```bash
npm test
```

## 📦 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data

## 🔧 Configuration

The application uses environment variables for configuration. See `env.example` for all available options.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please contact the development team or create an issue in the repository. 