# EEC Lab Resources Management System

A full-stack application for managing EEC Lab resources, including inventory, 3D printers, lab reservations, and lending systems.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Folder Structure](#folder-structure)
5. [Backend](#backend)
    - [Setup & Installation](#backend-setup--installation)
    - [API Endpoints](#api-endpoints)
    - [Database Schema](#database-schema)
    - [Authentication](#authentication)
    - [Testing](#testing)
    - [Scripts](#scripts)
6. [Frontend](#frontend)
    - [Setup & Installation](#frontend-setup--installation)
7. [Contribution Guidelines](#contribution-guidelines)
8. [License](#license)
9. [Support](#support)

---

## Project Overview

This system streamlines the management of lab resources for students, lecturers, and administrators. It provides role-based access, inventory and printer management, lab and printer reservations, and a lending system, all secured with JWT authentication.

---

## Features

- **User Management**: Role-based access for Students, Lecturers, and Admins.
- **Inventory Management**: Track items, quantities, and borrowing/returning.
- **3D Printer Management**: Reserve printers, track filament usage.
- **Lab Reservations**: Book lab spaces (lecturers only).
- **Lending System**: Borrow and return items with full tracking.
- **JWT Authentication**: Secure, token-based access.
- **PostgreSQL Database**: Robust, relational data storage.
- **Input Validation & Error Handling**: Comprehensive request validation and error responses.

---

## Tech Stack

- **Backend**: Node.js, Express.js, PostgreSQL, bcryptjs, jsonwebtoken, express-validator, helmet, cors, morgan
- **Frontend**: React (Vite), TypeScript

---

## Folder Structure

```
eec-lab-resources-management-system/
  backend/         # Express.js API, database, and scripts
    config/        # Database configuration
    middleware/    # Auth and other middleware
    routes/        # API route handlers
    scripts/       # DB migration and seeding
    tests/         # Backend tests
    server.js      # Main server entry point
    API_DOCUMENTATION.md # Full API reference
    README.md      # Backend documentation
  frontend/        # React app
    components/    # React components
    api.ts         # API client
    types.ts       # TypeScript types
    App.tsx        # Main app
    README.md      # Frontend documentation
```

---

## Backend

### Backend Setup & Installation

**Prerequisites:**  
- Node.js (v14+)
- PostgreSQL (v12+)
- npm or yarn

**Steps:**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp env.example .env
   # Edit .env with your DB and JWT settings
   ```

3. **Create the database:**
   ```sql
   CREATE DATABASE eec_lab_db;
   ```

4. **Run migrations and seed data:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start the server:**
   ```bash
   npm run dev   # Development (nodemon)
   npm start     # Production
   ```

**Default login credentials after seeding:**
- Admin: `Admin User` / `admin123`
- Lecturer: `Dr. John Smith` / `lecturer123`
- Student: `Alice Johnson` (STU001) / `student123`

---

### API Endpoints

See `backend/API_DOCUMENTATION.md` for full details.  
**Base URL:** `http://localhost:5000/api`

#### Main Endpoint Categories

- **Authentication:** `/auth/login`, `/auth/register/student`, `/auth/register/lecturer`, `/auth/profile`, `/auth/change-password`
- **Users (Admin):** `/users`, `/users/role/:role`, `/users/lecturers`, `/users/:userId`, `/users/stats/overview`
- **Inventory:** `/inventory`, `/inventory/:itemId`, `/inventory/search/:query`, `/inventory/stats/overview`
- **Printers:** `/printers`, `/printers/:printerId`, `/printers/:printerId/status`, `/printers/:printerId/filament`, `/printers/stats/overview`, `/printers/:printerId/available-slots/:date`, `/printers/:printerId/usage-history`
- **Reservations:** `/reservations/printers`, `/reservations/labs`, `/reservations/labs/available-slots/:date`
- **Lending:** `/lending`, `/lending/borrow`, `/lending/:recordId/return`, `/lending/overdue/items`, `/lending/stats/overview`, `/lending/user/:userId/history`

**All protected endpoints require a JWT token:**
```
Authorization: Bearer <your_jwt_token>
```

**See `backend/API_DOCUMENTATION.md` for:**
- Request/response examples
- Error responses
- Status codes
- Rate limiting (100 requests/15min/IP)
- CORS configuration

---

### Database Schema

**Main tables:**
- Users
- Inventory
- Printers
- Printer Reservations
- Lab Reservations
- Lending Records

See `backend/README.md` for full schema details.

---

### Authentication

- JWT-based, with role-based access control.
- Passwords are hashed with bcryptjs.

---

### Testing

```bash
npm test
```

---

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start dev server (nodemon)
- `npm test` - Run backend tests
- `npm run db:migrate` - Run DB migrations
- `npm run db:seed` - Seed DB with sample data

---

## Frontend

### Frontend Setup & Installation

**Prerequisites:** Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the app:**
   ```bash
   npm run dev
   ```

The frontend is a React app (Vite + TypeScript) that interacts with the backend API.

---

## Contribution Guidelines

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## License

MIT License

---

## Support

For support, contact the development team or create an issue in the repository.

---

**For more details, see the backend and frontend README files and the full API documentation in `backend/API_DOCUMENTATION.md`.** 