# EEC Lab Resources Management System – Frontend

This is the frontend for the EEC Lab Resources Management System. It is a modern React application (built with Vite and TypeScript) that provides a user interface for managing lab resources, inventory, 3D printers, reservations, and lending.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Setup & Installation](#setup--installation)
4. [Available Scripts](#available-scripts)
5. [Project Structure](#project-structure)
6. [API Integration](#api-integration)
7. [Contribution](#contribution)
8. [License](#license)

---

## Overview

The frontend provides role-based access for students, lecturers, and admins to:
- View and manage inventory
- Reserve and monitor 3D printers
- Book lab spaces (lecturers)
- Borrow and return items
- Authenticate securely with JWT

---

## Tech Stack

- **Framework:** React (Vite)
- **Language:** TypeScript
- **Styling:** CSS/React (custom, or add your own framework)
- **API:** Connects to backend Express.js API

---

## Setup & Installation

**Prerequisites:** Node.js (v14+ recommended)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173` by default.

3. **Build for production:**
   ```bash
   npm run build
   ```

4. **Preview production build:**
   ```bash
   npm run preview
   ```

---

## Available Scripts

- `npm run dev` – Start development server
- `npm run build` – Build for production
- `npm run preview` – Preview production build

---

## Project Structure

```
frontend/
  components/    # React components (UI, dashboard, modals, etc.)
  api.ts         # API client for backend communication
  types.ts       # TypeScript type definitions
  App.tsx        # Main app entry point
  constants.ts   # App-wide constants
  index.tsx      # React root
  vite.config.ts # Vite configuration
  ...
```

---

## API Integration

- The frontend communicates with the backend API (see backend documentation for endpoints).
- Update the API base URL in `api.ts` if your backend runs on a different host/port.
- All protected endpoints require a JWT token (handled in the frontend after login).

---

## Contribution

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License 