import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole, AnyUser, Student, Lecturer, Admin, InventoryItem, Printer, PrinterReservation, LendingRecord, AppContextType, TimeSlot, PrinterName, ReservationStatus, LendingStatus, LabReservation, ReservationPurpose } from './types';
import { APP_TITLE, PRINTER_NAMES_ARRAY, TIME_SLOTS_8_TO_4_30_MIN, INITIAL_FILAMENT_PER_PRINTER, LAB_TIME_SLOTS_1_HOUR } from './constants';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import api, { setAuthToken, socket } from './api';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

// Helper to map lending record fields from backend to frontend
function mapLendingRecordFromBackend(record: any) {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    userName: record.user_name,
    itemId: String(record.item_id),
    itemName: record.item_name,
    quantityBorrowed: record.quantity_borrowed,
    borrowDate: record.borrow_date,
    expectedReturnDate: record.expected_return_date,
    actualReturnDate: record.actual_return_date,
    status: record.status,
    requestTimestamp: record.request_timestamp,
  };
}

// Helper to map lab reservation fields from backend to frontend
function mapLabReservationFromBackend(record: any) {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    userName: record.user_name,
    date: record.date,
    timeSlotId: record.time_slot_id,
    purpose: record.purpose,
    status: record.status,
    requestTimestamp: record.request_timestamp,
    adminNotes: record.admin_notes,
  };
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AnyUser | null>(null);
  const [users, setUsers] = useState<AnyUser[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [printers, setPrintersState] = useState<Printer[]>([]);
  const [printerReservations, setPrinterReservations] = useState<PrinterReservation[]>([]);
  const [lendingRecords, setLendingRecords] = useState<LendingRecord[]>([]);
  const [labReservations, setLabReservations] = useState<LabReservation[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch functions for real-time updates
  const fetchInventory = useCallback(async () => {
    const inventoryRes = await api.get('/inventory');
    setInventory(inventoryRes.data.inventory || []);
  }, []);

  const fetchLendingRecords = useCallback(async () => {
    if (!currentUser) return;
    let mappedLendingRecords = [];
    if (currentUser.role === 'Admin') {
      const lendingRes = await api.get('/lending');
      mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
    } else {
      const lendingRes = await api.get(`/lending/user/${currentUser.id}/history`);
      mappedLendingRecords = (lendingRes.data.borrowingHistory || []).map(mapLendingRecordFromBackend);
    }
    setLendingRecords(mappedLendingRecords);
  }, [currentUser]);

  const fetchReservations = useCallback(async () => {
    const printerReservationsRes = await api.get('/reservations/printers');
    setPrinterReservations(printerReservationsRes.data.reservations || []);
    const labReservationsRes = await api.get('/reservations/labs');
    setLabReservations((labReservationsRes.data.reservations || []).map(mapLabReservationFromBackend));
  }, []);

  const fetchPrinters = useCallback(async () => {
    const printersRes = await api.get('/printers');
    setPrintersState((printersRes.data.printers || []).map((p: any) => ({
      ...p,
      filamentAvailableGrams: p.filament_available_grams,
    })));
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'Admin') return;
    const usersRes = await api.get('/users');
    setUsers(usersRes.data.users || []);
    const notificationsRes = await api.get('/users/notifications');
    setNotifications(notificationsRes.data.notifications || []);
  }, [currentUser]);

  // Ensure token is set in Axios before any API requests
  const token = sessionStorage.getItem('jwtToken');
  if (token) {
    setAuthToken(token);
    console.log('JWT token set:', token);
  } else {
    console.warn('No JWT token found in sessionStorage');
  }

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch current user profile
        const profileRes = await api.get('/auth/profile');
        setCurrentUser(profileRes.data.user);
        // Fetch users (admin only)
        let usersRes = { data: { users: [] } };
        if (profileRes.data.user.role === 'Admin') {
          usersRes = await api.get('/users');
          // Fetch notifications for admin
          const notificationsRes = await api.get('/users/notifications');
          console.log('Admin notifications API response:', notificationsRes.data);
          if (notificationsRes.data.error) {
            alert('Failed to fetch notifications: ' + notificationsRes.data.message);
            setNotifications([]);
            logout();
            window.location.reload();
            return;
          } else {
            setNotifications(notificationsRes.data.notifications || []);
          }
        }
        setUsers(usersRes.data.users || []);
        // Fetch inventory
        const inventoryRes = await api.get('/inventory');
        setInventory(inventoryRes.data.inventory || []);
        // Fetch printers
        const printersRes = await api.get('/printers');
        setPrintersState(
          (printersRes.data.printers || []).map((p: any) => ({
            ...p,
            filamentAvailableGrams: p.filament_available_grams,
          }))
        );
        // Fetch printer reservations
        const printerReservationsRes = await api.get('/reservations/printers');
        setPrinterReservations(printerReservationsRes.data.reservations || []);
        // Fetch lending records
        let mappedLendingRecords = [];
        if (profileRes.data.user.role === 'Admin') {
          const lendingRes = await api.get('/lending');
          mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
        } else {
          const lendingRes = await api.get(`/lending/user/${profileRes.data.user.id}/history`);
          mappedLendingRecords = (lendingRes.data.borrowingHistory || []).map(mapLendingRecordFromBackend);
        }
        setLendingRecords(mappedLendingRecords);
        // Fetch lab reservations
        const labReservationsRes = await api.get('/reservations/labs');
        setLabReservations((labReservationsRes.data.reservations || []).map(mapLabReservationFromBackend));
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    // Listen for real-time updates
    function handleInventoryUpdate() { fetchInventory(); }
    function handleLendingUpdate() { fetchLendingRecords(); }
    function handleReservationUpdate() { fetchReservations(); }
    function handlePrintersUpdate() { fetchPrinters(); }
    function handleUsersUpdate() { fetchUsers(); }

    socket.on('inventoryUpdated', handleInventoryUpdate);
    socket.on('lendingUpdated', handleLendingUpdate);
    socket.on('reservationUpdated', handleReservationUpdate);
    socket.on('printersUpdated', handlePrintersUpdate);
    socket.on('usersUpdated', handleUsersUpdate);

    return () => {
      socket.off('inventoryUpdated', handleInventoryUpdate);
      socket.off('lendingUpdated', handleLendingUpdate);
      socket.off('reservationUpdated', handleReservationUpdate);
      socket.off('printersUpdated', handlePrintersUpdate);
      socket.off('usersUpdated', handleUsersUpdate);
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string, role: UserRole): Promise<boolean> => {
    try {
      const res = await api.post('/auth/login', { identifier, password, role });
      const { token, user } = res.data;
      sessionStorage.setItem('jwtToken', token);
      setAuthToken(token);
      setCurrentUser(user);
      return true;
    } catch (err) {
      alert('Login failed. Please check your credentials.');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem('jwtToken');
    setAuthToken(null);
  }, []);

  const registerStudent = useCallback(async (studentData: Omit<Student, 'id' | 'role' | 'passwordHash'> & {password: string}): Promise<Student | null> => {
    try {
      const res = await api.post('/auth/register/student', studentData);
      return res.data.user;
    } catch (err) {
      alert('Student registration failed.');
      return null;
    }
  }, []);

  const addLecturerByAdmin = useCallback(async (lecturerData: Omit<Lecturer, 'id' | 'role' | 'passwordHash'> & {password: string}): Promise<Lecturer | null> => {
    try {
      const res = await api.post('/auth/register/lecturer', lecturerData);
      return res.data.user;
    } catch (err) {
      alert('Lecturer registration failed.');
      return null;
    }
  }, []);

  const removeUser = useCallback(async (userId: string) => {
    if (currentUser?.id === userId) {
      alert("Cannot remove the currently logged-in user.");
      return;
    }
    try {
      await api.delete(`/users/${userId}`);
      setUsers((prev: AnyUser[]) => prev.filter((u: AnyUser) => u.id !== userId));
      setPrinterReservations((prev: PrinterReservation[]) => prev.filter((r: PrinterReservation) => r.userId !== userId));
      setLendingRecords((prev: LendingRecord[]) => prev.filter((lr: LendingRecord) => lr.userId !== userId));
      setLabReservations((prev: LabReservation[]) => prev.filter((lr: LabReservation) => lr.userId !== userId));
      alert("User removed successfully.");
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.message) {
        alert(`Failed to remove user: ${err.response.data.message}`);
      } else {
        alert("Failed to remove user.");
      }
    }
  }, [currentUser]);

  const addInventoryItem = useCallback(async (itemData: Omit<InventoryItem, 'id'|'available'>): Promise<InventoryItem | null> => {
    try {
      const res = await api.post('/inventory', itemData);
      const newItem = res.data.item || res.data;
      setInventory(prev => [...prev, newItem]);
      return newItem;
    } catch (err) {
      alert('Failed to add inventory item.');
      return null;
    }
  }, []);
  
  const removeInventoryItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      await api.delete(`/inventory/${itemId}`);
      setInventory(prevInventory => prevInventory.filter(item => item.id !== itemId));
      return true;
    } catch (err) {
      alert('Failed to remove inventory item.');
      return false;
    }
  }, []);

  const updateInventoryItemQuantity = useCallback(async (itemId: string, change: number) => {
    try {
      const item = inventory.find(i => i.id === itemId);
      if (!item) return;
      const updatedQuantity = item.quantity + change;
      const res = await api.put(`/inventory/${itemId}`, { ...item, quantity: updatedQuantity });
      const updatedItem = res.data.item || res.data;
      setInventory(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    } catch (err) {
      alert('Failed to update inventory item.');
    }
  }, [inventory]);

  const borrowItem = useCallback(async (userId: string, userName: string, itemId: string, quantity: number, expectedReturnDate: string): Promise<LendingRecord | null> => {
    try {
      const res = await api.post('/lending/borrow', { itemId, quantity, expectedReturnDate });
      const newRecord = mapLendingRecordFromBackend(res.data.record || res.data);
      // Re-fetch lending records after borrowing
      let lendingRes;
      let mappedLendingRecords = [];
      if (currentUser?.role === 'Admin') {
        lendingRes = await api.get('/lending');
        mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
      } else {
        lendingRes = await api.get(`/lending/user/${userId}/history`);
        mappedLendingRecords = (lendingRes.data.borrowingHistory || []).map(mapLendingRecordFromBackend);
      }
      setLendingRecords(mappedLendingRecords);
      // Optionally, re-fetch inventory to update available counts
      const inventoryRes = await api.get('/inventory');
      setInventory(inventoryRes.data.inventory || []);
      return newRecord;
    } catch (err) {
      alert('Failed to borrow item.');
      return null;
    }
  }, [currentUser]);

  const returnItem = useCallback(async (lendingRecordId: string): Promise<void> => {
    try {
      await api.put(`/lending/${lendingRecordId}/return`);
      // Only re-fetch inventory; let polling update lendingRecords
      const inventoryRes = await api.get('/inventory');
      setInventory(inventoryRes.data.inventory || []);
    } catch (err) {
      alert('Failed to return item.');
    }
  }, []);


  const requestPrinterReservation = useCallback(async (reservationData: Omit<PrinterReservation, 'id' | 'status' | 'requestTimestamp' | 'userName' | 'printerName'>): Promise<PrinterReservation | null> => {
    try {
      const res = await api.post('/reservations/printers', reservationData);
      const newReservation = res.data.reservation || res.data;
      // Immediately fetch latest reservations
      const printerReservationsRes = await api.get('/reservations/printers');
      setPrinterReservations(printerReservationsRes.data.reservations || []);
      return newReservation;
    } catch (err) {
      alert('Failed to create printer reservation.');
      return null;
    }
  }, []);

  // Update printer reservation status (for admin)
  const updatePrinterReservationStatus = useCallback(async (reservationId: string, status: ReservationStatus): Promise<void> => {
    try {
      await api.put(`/reservations/printers/${reservationId}/status`, { status });
      // Re-fetch reservations
      const res = await api.get('/reservations/printers');
      setPrinterReservations(res.data.reservations || []);
      // Re-fetch printers to update filament for all users
      const printersRes = await api.get('/printers');
      setPrintersState((printersRes.data.printers || []).map((p: any) => ({
        ...p,
        filamentAvailableGrams: p.filament_available_grams,
      })));
    } catch (err) {
      alert('Failed to update printer reservation status.');
    }
  }, []);

  // Cancel printer reservation (for all users)
  const cancelPrinterReservation = useCallback(async (reservationId: string): Promise<void> => {
    try {
      await api.put(`/reservations/printers/${reservationId}/cancel`);
      // Re-fetch reservations
      const res = await api.get('/reservations/printers');
      setPrinterReservations(res.data.reservations || []);
      // Re-fetch printers to update filament for all users
      const printersRes = await api.get('/printers');
      setPrintersState((printersRes.data.printers || []).map((p: any) => ({
        ...p,
        filamentAvailableGrams: p.filament_available_grams,
      })));
      alert('Printer reservation cancelled successfully.');
    } catch (err) {
      alert('Failed to cancel printer reservation.');
    }
  }, []);

  const getAvailablePrinterTimeSlots = useCallback((date: string, printerId: string): TimeSlot[] => {
    const existingReservationsForDayAndPrinter = printerReservations.filter(
      r => r.date === date && r.printerId === printerId && (r.status === ReservationStatus.APPROVED || r.status === ReservationStatus.PENDING)
    );
    
    let occupiedSlotIds = new Set<string>();
    existingReservationsForDayAndPrinter.forEach(res => {
        const startIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === res.timeSlotId);
        if (startIndex !== -1) {
            for (let i = 0; i < res.requestedTimeSlots; i++) {
                if (startIndex + i < TIME_SLOTS_8_TO_4_30_MIN.length) {
                    occupiedSlotIds.add(TIME_SLOTS_8_TO_4_30_MIN[startIndex + i].id);
                }
            }
        }
    });
    return TIME_SLOTS_8_TO_4_30_MIN.filter(slot => !occupiedSlotIds.has(slot.id));
  }, [printerReservations]);

  // Lab Reservation Logic
  const requestLabReservation = useCallback(async (reservationData: Omit<LabReservation, 'id' | 'status' | 'requestTimestamp' | 'userName'>): Promise<LabReservation | null> => {
    try {
      const res = await api.post('/reservations/labs', reservationData);
      const newReservation = res.data.reservation || res.data;
      // Immediately fetch latest lab reservations
      const labReservationsRes = await api.get('/reservations/labs');
      setLabReservations((labReservationsRes.data.reservations || []).map(mapLabReservationFromBackend));
      return newReservation;
    } catch (err) {
      alert('Failed to create lab reservation.');
      return null;
    }
  }, []);

  const updateLabReservationStatus = useCallback(async (reservationId: string, newStatus: ReservationStatus, adminNotes?: string): Promise<void> => {
    try {
      await api.put(`/reservations/labs/${reservationId}/status`, { status: newStatus, adminNotes });
      // Re-fetch reservations and map fields
      const res = await api.get('/reservations/labs');
      setLabReservations((res.data.reservations || []).map(mapLabReservationFromBackend));
    } catch (err) {
      alert('Failed to update lab reservation status.');
    }
  }, []);

  const cancelLabReservation = useCallback(async (reservationId: string): Promise<void> => {
    try {
      await api.put(`/reservations/labs/${reservationId}/cancel`);
      // Re-fetch reservations and map fields
      const res = await api.get('/reservations/labs');
      setLabReservations((res.data.reservations || []).map(mapLabReservationFromBackend));
      alert('Lab reservation cancelled successfully.');
    } catch (err) {
      alert('Failed to cancel lab reservation.');
    }
  }, []);

  const getLabTimeSlots = useCallback((date: string): TimeSlot[] => {
    const existingReservationsForDay = labReservations.filter(
        r => r.date === date && (r.status === ReservationStatus.APPROVED || r.status === ReservationStatus.PENDING)
    );
    const occupiedSlotIds = new Set<string>(existingReservationsForDay.map(r => r.timeSlotId));
    return LAB_TIME_SLOTS_1_HOUR.filter(slot => !occupiedSlotIds.has(slot.id));
  }, [labReservations]);


  const lecturers = users.filter(u => u.role === UserRole.LECTURER) as Lecturer[];

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen text-xl">Loading EEC Lab System...</div>;
  }

  const contextValue: AppContextType = {
    currentUser,
    users,
    inventory,
    printers,
    printerReservations,
    lendingRecords,
    labReservations,
    lecturers,
    login,
    logout,
    registerStudent,
    addLecturerByAdmin,
    removeUser,
    addInventoryItem,
    removeInventoryItem,
    updateInventoryItemQuantity,
    borrowItem,
    returnItem,
    requestPrinterReservation,
    updatePrinterReservationStatus,
    cancelPrinterReservation,
    getAvailablePrinterTimeSlots,
    requestLabReservation,
    updateLabReservationStatus,
    cancelLabReservation,
    getLabTimeSlots,
    notifications,
    setLendingRecords,
    setNotifications,
    setPrinters: setPrintersState,
    setLabReservations,
    setPrinterReservations,
    setInventory,
    mapLabReservationFromBackend,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <HashRouter>
        <div className="min-h-screen flex flex-col">
          <header className="bg-primary text-white p-4 shadow-md">
            <h1 className="text-2xl font-bold text-center">{APP_TITLE}</h1>
          </header>
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={currentUser ? <Navigate to="/dashboard" /> : <LandingPage />} />
              <Route path="/dashboard" element={currentUser ? <Dashboard /> : <Navigate to="/" />} />
            </Routes>
          </main>
          <footer className="bg-neutral-dark text-neutral-light p-3 text-center text-sm">
            © {new Date().getFullYear()} EEC Lab. All rights reserved.
          </footer>
        </div>
      </HashRouter>
    </AppContext.Provider>
  );
};

export default App;
