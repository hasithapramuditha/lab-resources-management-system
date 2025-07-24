import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../App';
import { UserRole, InventoryItem, Printer, PrinterReservation, LendingRecord, AnyUser, Student, Lecturer, Admin, ReservationStatus, LendingStatus, TimeSlot, PrinterName, LabReservation, ReservationPurpose, Notification } from '../types';
import { TIME_SLOTS_8_TO_4_30_MIN, LAB_TIME_SLOTS_1_HOUR } from '../constants';
import Modal from './common/Modal';
import api from '../api';
import { MdDashboard, MdNotifications, MdInventory, MdPrint, MdPeople, MdReport, MdHistory, MdAssignmentReturn, MdMeetingRoom } from 'react-icons/md';
import { FaCubes, FaFlask } from 'react-icons/fa';

type UserDashboardView = "dashboard" | "lendingItems" | "resourceAllocation" | "lendingAndReturns" | "labSpaceBooking";
type AdminDashboardView = "dashboard" | "inventory" | "printers" | "users" | "reports" | "addLecturer" | "addInventoryItem" | "labBookingsMgt" | "lendingMgt";

const commonInputClasses = "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none shadow-sm text-sm";
const commonButtonClasses = "px-4 py-2 rounded-md font-semibold text-sm transition-colors disabled:opacity-50";
const primaryButtonClasses = `${commonButtonClasses} bg-primary text-white hover:bg-blue-700`;
const secondaryButtonClasses = `${commonButtonClasses} bg-secondary text-white hover:bg-emerald-700`;
const dangerButtonClasses = `${commonButtonClasses} bg-red-500 text-white hover:bg-red-700`;
const warningButtonClasses = `${commonButtonClasses} bg-yellow-500 text-white hover:bg-yellow-600`;

const formatDate = (isoDateString?: string) => {
  if (!isoDateString) return 'N/A';
  return new Date(isoDateString).toLocaleDateString('en-CA'); // YYYY-MM-DD
};
const formatDateTime = (isoDateString?: string | number) => {
    if (!isoDateString) return 'N/A';
  const date = typeof isoDateString === 'number'
    ? new Date(isoDateString)
    : new Date(isoDateString);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short'});
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

// Add a helper at the top of the file:
function toLocalYMD(date: Date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const Dashboard: React.FC = () => {
  const { 
    currentUser, logout, inventory, printers, printerReservations, lendingRecords, users, labReservations,
    addInventoryItem, removeInventoryItem, borrowItem, returnItem, 
    requestPrinterReservation, updatePrinterReservationStatus, cancelPrinterReservation, getAvailablePrinterTimeSlots,
    requestLabReservation, updateLabReservationStatus, cancelLabReservation, getLabTimeSlots,
    addLecturerByAdmin, removeUser, updateInventoryItemQuantity,
    notifications,
    setLendingRecords,
    setNotifications,
    setPrinters,
    setLabReservations,
    setPrinterReservations,
    mapLabReservationFromBackend,
    setInventory
  } = useApp();
  
  const [activeUserView, setActiveUserView] = useState<UserDashboardView>('dashboard');
  const [activeAdminView, setActiveAdminView] = useState<AdminDashboardView>('dashboard');

  // Modal States
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [selectedItemToBorrow, setSelectedItemToBorrow] = useState<InventoryItem | null>(null);
  const [borrowQuantity, setBorrowQuantity] = useState(1);
  const [expectedReturnDate, setExpectedReturnDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const [isPrinterReserveModalOpen, setIsPrinterReserveModalOpen] = useState(false);
  const [selectedPrinterToReserve, setSelectedPrinterToReserve] = useState<Printer | null>(null);
  const [printerReservationDate, setPrinterReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [printerReservationTimeSlotId, setPrinterReservationTimeSlotId] = useState<string>('');
  const [printerReservationDurationSlots, setPrinterReservationDurationSlots] = useState(1);
  const [filamentNeeded, setFilamentNeeded] = useState(10);
  const [usesOwnFilament, setUsesOwnFilament] = useState(false);
  const [availableSlotsForPrinterModal, setAvailableSlotsForPrinterModal] = useState<TimeSlot[]>([]);

  const [isAddLecturerModalOpen, setIsAddLecturerModalOpen] = useState(false);
  const [lecturerName, setLecturerName] = useState('');
  const [lecturerPassword, setLecturerPassword] = useState('');

  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Printer Timetable state
  const [selectedPrinterForTimetable, setSelectedPrinterForTimetable] = useState<Printer | null>(null);
  const [printerTimetableDate, setPrinterTimetableDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Lab Reservation Modal State
  const [isLabReserveModalOpen, setIsLabReserveModalOpen] = useState(false);
  const [labReservationDate, setLabReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [labReservationTimeSlotId, setLabReservationTimeSlotId] = useState<string>('');
  const [labReservationPurpose, setLabReservationPurpose] = useState<ReservationPurpose | string>(ReservationPurpose.PROJECT_WORK);
  const [otherPurposeDetails, setOtherPurposeDetails] = useState('');
  const [availableLabSlotsForModal, setAvailableLabSlotsForModal] = useState<TimeSlot[]>([]);

  // Lab Timetable State
  const [labTimetableDate, setLabTimetableDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AnyUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editCourse, setEditCourse] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [changePasswordTargetUser, setChangePasswordTargetUser] = useState<AnyUser | null>(null); // null = self
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Inventory search and add quantity states
  const [inventorySearch, setInventorySearch] = useState('');
  const [addQtyModalOpen, setAddQtyModalOpen] = useState(false);
  const [addQtyTargetItem, setAddQtyTargetItem] = useState<InventoryItem | null>(null);
  const [addQtyValue, setAddQtyValue] = useState(1);
  const [addQtyLoading, setAddQtyLoading] = useState(false);

  const [refreshingInventory, setRefreshingInventory] = useState(false);
  const handleRefreshInventory = async () => {
    setRefreshingInventory(true);
    try {
      // Fallback: reload the page to ensure latest inventory is fetched from App context
      window.location.reload();
    } finally {
      setRefreshingInventory(false);
    }
  };

  const filteredInventory = useMemo(() => {
    if (!inventorySearch.trim()) return inventory;
    return inventory.filter(item => item.name.toLowerCase().includes(inventorySearch.trim().toLowerCase()));
  }, [inventory, inventorySearch]);

  useEffect(() => {
    if (selectedPrinterToReserve && printerReservationDate) {
        setAvailableSlotsForPrinterModal(getAvailablePrinterTimeSlots(printerReservationDate, selectedPrinterToReserve.id));
    }
  }, [selectedPrinterToReserve, printerReservationDate, getAvailablePrinterTimeSlots, printerReservations]);
  
  useEffect(() => {
    if (isLabReserveModalOpen && labReservationDate) {
        setAvailableLabSlotsForModal(getLabTimeSlots(labReservationDate));
    }
  }, [isLabReserveModalOpen, labReservationDate, getLabTimeSlots, labReservations]);


  useEffect(() => {
    if (!currentUser || (currentUser.role !== UserRole.ADMIN && activeUserView !== 'resourceAllocation' && activeUserView !== 'labSpaceBooking')) {
        setSelectedPrinterForTimetable(null);
    }
  }, [activeUserView, activeAdminView, currentUser]);

  useEffect(() => {
    if (currentUser && (currentUser.role as string) === 'Admin') {
      const interval = setInterval(async () => {
        const [lendingRes, notificationsRes, labReservationsRes] = await Promise.all([
          api.get('/lending'),
          api.get('/users/notifications'),
          api.get('/reservations/labs')
        ]);
        // Map lending records to camelCase
        const mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
        setLendingRecords(mappedLendingRecords);
        setNotifications(notificationsRes.data.notifications || []);
        setLabReservations((labReservationsRes.data.reservations || []).map(mapLabReservationFromBackend));
      }, 5000);
      return () => clearInterval(interval);
    }
    // Poll for non-admin users' own lending history
    if (currentUser && (currentUser.role as string) !== 'Admin') {
      const interval = setInterval(async () => {
        const lendingRes = await api.get(`/lending/user/${currentUser.id}/history`);
        const mappedLendingRecords = (lendingRes.data.borrowingHistory || lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
        setLendingRecords(mappedLendingRecords);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Add polling for printer reservations (real-time updates)
  useEffect(() => {
    if (!currentUser) return;
    let interval: NodeJS.Timeout;
    if ((currentUser.role as string) === 'Admin') {
      interval = setInterval(async () => {
        try {
          const res = await api.get('/printers/reservations');
          setPrinterReservations(res.data.reservations || []);
          // Optionally update printers if needed
          if (res.data.printers) {
            setPrinters(res.data.printers);
          }
        } catch (err) {
          // handle error silently
        }
      }, 5000);
    } else {
      interval = setInterval(async () => {
        try {
          const res = await api.get(`/printers/reservations/user/${currentUser.id}`);
          setPrinterReservations(res.data.reservations || []);
        } catch (err) {
          // handle error silently
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [currentUser, setPrinterReservations, setPrinters]);

  if (!currentUser) return null; 

  const handleOpenBorrowModal = (item: InventoryItem) => {
    setSelectedItemToBorrow(item);
    setBorrowQuantity(1);
    setExpectedReturnDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setIsBorrowModalOpen(true);
  };

  const handleBorrowSubmit = async () => {
    if (!selectedItemToBorrow || !currentUser) return;
    if (borrowQuantity <= 0 || borrowQuantity > selectedItemToBorrow.available) {
        alert("Invalid quantity."); return;
    }
    if (!expectedReturnDate) {
        alert("Please select an expected return date."); return;
    }
    const formattedDate = new Date(expectedReturnDate).toISOString().slice(0, 10);
    const result = await borrowItem(currentUser.id, currentUser.name, selectedItemToBorrow.id, borrowQuantity, formattedDate);
    setIsBorrowModalOpen(false);
    if (result) {
      setToastMessage('Your request has been submitted and is pending admin approval.');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleOpenPrinterReserveModal = (printer: Printer, date?: string, timeSlotId?: string) => {
    setSelectedPrinterToReserve(printer);
    setPrinterReservationDate(date || new Date().toISOString().split('T')[0]);
    setPrinterReservationTimeSlotId(timeSlotId || '');
    setPrinterReservationDurationSlots(1);
    setFilamentNeeded(10);
    setUsesOwnFilament(false);
    setIsPrinterReserveModalOpen(true);
  };

  const handlePrinterReserveSubmit = () => {
    if (!selectedPrinterToReserve || !currentUser || !printerReservationTimeSlotId || !printerReservationDate) {
        alert("Please fill all reservation details, including selecting a start time slot."); return;
    }
    if (filamentNeeded <=0 && !usesOwnFilament) {
        alert("Filament needed must be greater than 0 if using lab filament."); return;
    }
    if (printerReservationDurationSlots <= 0) {
        alert("Reservation duration must be at least 1 slot (30 minutes)."); return;
    }

    const currentAvailableSlots = getAvailablePrinterTimeSlots(printerReservationDate, selectedPrinterToReserve.id);
    const selectedSlotIndexInAllSlots = TIME_SLOTS_8_TO_4_30_MIN.findIndex(s => s.id === printerReservationTimeSlotId);

    if (selectedSlotIndexInAllSlots === -1) {
        alert("Invalid time slot selected."); return;
    }
    
    if (selectedSlotIndexInAllSlots + printerReservationDurationSlots > TIME_SLOTS_8_TO_4_30_MIN.length) {
        alert("Requested duration exceeds available time slots for the day."); return;
    }

    for(let i = 0; i < printerReservationDurationSlots; i++) {
        const targetSlotId = TIME_SLOTS_8_TO_4_30_MIN[selectedSlotIndexInAllSlots + i]?.id;
        if(!targetSlotId || !currentAvailableSlots.find(s => s.id === targetSlotId)){
            alert(`One or more selected time slots (e.g., ${targetSlotId}) are not available. Please refresh or select a different time/duration.`);
            return;
        }
    }

    requestPrinterReservation({
        userId: currentUser.id,
        printerId: selectedPrinterToReserve.id,
        date: printerReservationDate,
        timeSlotId: printerReservationTimeSlotId,
        requestedTimeSlots: printerReservationDurationSlots,
        filamentNeededGrams: usesOwnFilament ? 0 : filamentNeeded,
        usesOwnFilament: usesOwnFilament,
    });
    setIsPrinterReserveModalOpen(false);
    setSelectedPrinterForTimetable(selectedPrinterToReserve);
    // Set timetable to the correct day column after reservation
    const baseLocal = new Date();
    baseLocal.setHours(0, 0, 0, 0);
    const reservedLocal = new Date(printerReservationDate + 'T00:00:00');
    reservedLocal.setHours(0, 0, 0, 0);
    const diffDays = Math.round((reservedLocal.getTime() - baseLocal.getTime()) / (1000 * 60 * 60 * 24));
    setSelectedTimetableDay(diffDays >= 0 && diffDays < 7 ? diffDays : 0);
  };
  
  const handleCancelPrinterReservation = (reservationId: string) => {
    if (window.confirm("Are you sure you want to cancel this printer reservation?")) {
        cancelPrinterReservation(reservationId);
    }
  };

  const handleOpenLabReserveModal = (date?: string, timeSlotId?: string) => {
    setLabReservationDate(date || new Date().toISOString().split('T')[0]);
    setLabReservationTimeSlotId(timeSlotId || '');
    setLabReservationPurpose(ReservationPurpose.PROJECT_WORK);
    setOtherPurposeDetails('');
    setIsLabReserveModalOpen(true);
  };
  
  const handleLabReserveSubmit = () => {
    if (!currentUser || !labReservationDate || !labReservationTimeSlotId) {
        alert("Please select a date and time slot for the lab booking."); return;
    }
    if (labReservationPurpose === ReservationPurpose.OTHER && !otherPurposeDetails.trim()) {
        alert("Please specify details for 'Other' purpose."); return;
    }
    const purpose = labReservationPurpose === ReservationPurpose.OTHER ? otherPurposeDetails.trim() : labReservationPurpose;

    requestLabReservation({
        userId: currentUser.id,
        date: labReservationDate,
        timeSlotId: labReservationTimeSlotId,
        purpose: purpose,
    });
    setIsLabReserveModalOpen(false);
  };

  const handleCancelLabReservation = (reservationId: string) => {
    if (window.confirm("Are you sure you want to cancel this lab booking?")) {
        cancelLabReservation(reservationId);
    }
  };

  const handleAdminUpdateLabBookingStatus = async (reservationId: string, status: ReservationStatus.APPROVED | ReservationStatus.REJECTED, adminNotes?: string) => {
    await updateLabReservationStatus(reservationId, status, adminNotes);
  };


  const handleAddLecturerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lecturerName || !lecturerPassword) { alert("Please provide lecturer name and password."); return; }
    addLecturerByAdmin({ name: lecturerName, password: lecturerPassword });
    setLecturerName(''); setLecturerPassword(''); setIsAddLecturerModalOpen(false);
  };

  const handleAddItemSubmit = () => {
    if (!itemName || itemQuantity <= 0) { alert("Please provide item name and a valid quantity."); return; }
    addInventoryItem({ name: itemName, quantity: itemQuantity });
    setItemName(''); setItemQuantity(1); setIsAddItemModalOpen(false);
  };

  const handleAdminRemoveItem = async (itemId: string) => {
    if (window.confirm("Are you sure you want to remove this item?")) {
        const success = await removeInventoryItem(itemId);
        if (success) alert("Item removed successfully.");
    }
  };
  
  const handleExportCSV = (data: any[], filename: string) => {
    if (data.length === 0) { alert("No data to export."); return; }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // For non-admins, lendingRecords already contains only the current user's records
  const userLendingRecords = lendingRecords;
  const userPrinterReservations = useMemo(() => printerReservations.filter(r => r.userId === currentUser.id), [printerReservations, currentUser.id]);
  const userLabReservations = useMemo(
    () => labReservations.filter(r => String(r.userId) === String(currentUser.id)),
    [labReservations, currentUser.id]
  );


  // Filter reservations for timetable based on role
  const reservationsForPrinterTimetable = useMemo(() => {
    if (!selectedPrinterForTimetable) return [];
    if (currentUser.role === UserRole.ADMIN) {
      // Admin sees all (approved and pending)
    return printerReservations.filter(r => 
        r.printerId === selectedPrinterForTimetable.id && 
        toLocalYMD(new Date(r.date)) === printerTimetableDate.slice(0, 10) && 
        (r.status === ReservationStatus.APPROVED || r.status === ReservationStatus.PENDING)
    );
    } else {
      // Users see only approved
      return printerReservations.filter(r => 
        r.printerId === selectedPrinterForTimetable.id && 
        toLocalYMD(new Date(r.date)) === printerTimetableDate && 
        r.status === ReservationStatus.APPROVED
      );
    }
  }, [printerReservations, selectedPrinterForTimetable, printerTimetableDate, currentUser.role]);

  // Update getPrinterSlotInfo to show details based on role
  const getPrinterSlotInfo = useCallback((slotId: string): { status: 'available' | 'reserved' | 'multi-slot-reserved'; reservation?: PrinterReservation } => {
    for (const res of reservationsForPrinterTimetable) {
        const startIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === res.timeSlotId);
        if (startIndex !== -1) {
            const slotIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === slotId);
            if (slotIndex >= startIndex && slotIndex < startIndex + res.requestedTimeSlots) {
                return { status: slotIndex === startIndex ? 'reserved' : 'multi-slot-reserved', reservation: res };
            }
        }
    }
    return { status: 'available' };
  }, [reservationsForPrinterTimetable]);

  const reservationsForLabTimetable = useMemo(() => {
    return labReservations.filter(r => 
        r.date === labTimetableDate && 
        r.status === ReservationStatus.APPROVED
    );
  }, [labReservations, labTimetableDate]);

  const getLabSlotInfo = useCallback((slotId: string): { status: 'available' | 'reserved'; reservation?: LabReservation } => {
    const reservation = reservationsForLabTimetable.find(r => r.timeSlotId === slotId);
    if (reservation) {
        return { status: 'reserved', reservation };
    }
    return { status: 'available' };
  }, [reservationsForLabTimetable]);


  // USER/LECTURER VIEWS
  const renderLendingItemsView = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h3 className="text-xl font-semibold text-neutral-dark">Available Lab Components</h3>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={inventorySearch}
            onChange={e => setInventorySearch(e.target.value)}
            placeholder="Search components..."
            className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none shadow-sm text-sm"
          />
          <button onClick={handleRefreshInventory} className={secondaryButtonClasses} disabled={refreshingInventory}>{refreshingInventory ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </div>
      {filteredInventory.filter(item => item.available > 0).length === 0 && <p className="text-neutral-DEFAULT">No items currently available for lending.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredInventory.filter(item => item.available > 0).map(item => (
          <div key={item.id} className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
            <h4 className="text-lg font-medium text-primary">{item.name}</h4>
            <p className="text-sm text-neutral-DEFAULT">Available: {item.available} / {item.quantity}</p>
            <button
              onClick={() => handleOpenBorrowModal(item)}
              className={`${primaryButtonClasses} mt-3 w-full`}
              disabled={hasPendingRequest(item.id)}
              title={hasPendingRequest(item.id) ? 'You already have a pending request for this item.' : ''}
            >
              {hasPendingRequest(item.id) ? 'Pending Approval' : 'Borrow'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderResourceAllocationView = () => ( // For 3D Printers
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-neutral-dark">3D Printer Reservations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
          {printers.map(printer => (
            <div key={printer.id} className="bg-gradient-to-br from-blue-100 via-white to-blue-50 p-4 rounded-2xl shadow-lg hover:shadow-2xl transition-shadow cursor-pointer" onClick={() => {
              const nextReservation = printerReservations.filter(r => r.printerId === printer.id && (r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
              setSelectedPrinterForTimetable(printer);
              setPrinterTimetableDate(nextReservation ? nextReservation.date : new Date().toISOString().split('T')[0]);
            }}>
              <h4 className="text-lg font-medium text-primary">{printer.name}</h4>
              <p className="text-sm text-neutral-DEFAULT">Status: {printer.status}</p>
              <p className="text-sm text-neutral-DEFAULT">Lab Filament: {printer.filamentAvailableGrams}g</p>
              <button onClick={(e) => { e.stopPropagation(); handleOpenPrinterReserveModal(printer); }} className={`${secondaryButtonClasses} mt-3 w-full text-xs`}>Quick Reserve</button>
            </div>
          ))}
        </div>
      </div>
      {selectedPrinterForTimetable && renderPrinterTimetableView()}
      <div>
        <h4 className="text-lg font-semibold text-neutral-dark mt-6">Your Printer Reservations</h4>
        {userPrinterReservations.filter(r => r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.REJECTED && r.status !== ReservationStatus.COMPLETED).length === 0 && <p className="text-neutral-DEFAULT">You have no active or pending printer reservations.</p>}
        <ul className="space-y-2 mt-2">
          {userPrinterReservations.filter(r => r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.REJECTED && r.status !== ReservationStatus.COMPLETED).map(res => (
            <li key={res.id} className="bg-gradient-to-br from-blue-50 via-white to-blue-100 p-3 rounded-xl shadow flex justify-between items-center text-sm">
              <div>
                {res.printerName} on {formatDate(res.date)} from {TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id === res.timeSlotId)?.startTime} ({res.requestedTimeSlots * 30} mins) - Status: <span className={`font-semibold ${res.status === ReservationStatus.APPROVED ? 'text-green-600' : 'text-orange-500'}`}>{res.status}</span>
              </div>
              {(res.status === ReservationStatus.PENDING || res.status === ReservationStatus.APPROVED) && 
                <button onClick={() => handleCancelPrinterReservation(res.id)} className={`${warningButtonClasses} text-xs`}>Cancel</button>
              }
            </li>
          ))}
        </ul>
      </div>
      <h4 className="text-lg font-medium text-neutral-dark mt-6">Your Printer Reservation History</h4>
      <div className="rounded-2xl shadow-lg bg-white mt-2">
        <div className="overflow-y-auto max-h-96">
          <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
            <thead className="bg-gradient-to-r from-blue-100 to-blue-50">
              <tr>
                <th className="px-6 py-3 font-semibold text-neutral-dark">User</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Printer</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Date</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Time (Duration)</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Filament</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Own?</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
              </tr>
            </thead>
            <tbody>
              {printerReservations.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-3 text-neutral-DEFAULT">No records found.</td></tr>
              )}
              {printerReservations.map((record, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors' : 'bg-white hover:bg-blue-50/70 transition-colors'}>
                  <td className="px-6 py-3">{record.userName}</td>
                  <td className="px-6 py-3">{record.printerName}</td>
                  <td className="px-6 py-3">{formatDate(record.date)}</td>
                  <td className="px-6 py-3">{TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id === record.timeSlotId)?.startTime} ({record.requestedTimeSlots * 30}m)</td>
                  <td className="px-6 py-3">{record.filamentNeededGrams}g</td>
                  <td className="px-6 py-3">{record.usesOwnFilament ? 'Yes':'No'}</td>
                  <td className="px-6 py-3">{record.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  
  const renderPrinterTimetableView = () => {
    if (!selectedPrinterForTimetable) return null;
    // Build a 2D array: rows = slots, columns = days
    const now = new Date();
    return (
      <div className="mt-6 bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold text-neutral-dark mb-2">Timetable for {selectedPrinterForTimetable.name}</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm border">
            <thead>
              <tr>
                <th className="p-2 border-b bg-gray-100">Time</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="p-2 border-b bg-gray-100 text-center">
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS_8_TO_4_30_MIN.map((slot, rowIdx) => (
                <tr key={slot.id}>
                  <td className="p-2 border-b font-medium bg-gray-50">{slot.startTime} - {slot.endTime}</td>
                  {weekDays.map((d, colIdx) => {
                    const dayStr = toLocalYMD(d);
                    // Find reservation for this day/slot
                    const timetableReservations = printerReservations.filter(r =>
                      r.printerId === selectedPrinterForTimetable.id &&
                      toLocalYMD(new Date(r.date)) === dayStr &&
                      r.status !== ReservationStatus.COMPLETED &&
                      r.status !== ReservationStatus.CANCELLED &&
                      r.status !== ReservationStatus.REJECTED
                    );
                    // For debugging, log the compared values:
                    // console.log('Comparing reservation date', r.date.slice(0, 10), 'with dayStr', dayStr.slice(0, 10));
                    let slotInfo: { status: 'available' | 'reserved' | 'multi-slot-reserved'; reservation?: PrinterReservation } = { status: 'available', reservation: undefined };
                    for (const res of timetableReservations) {
                      const startIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === res.timeSlotId);
                      if (startIndex !== -1) {
                        const slotIndex = rowIdx;
                        if (slotIndex >= startIndex && slotIndex < startIndex + res.requestedTimeSlots) {
                          slotInfo = { status: slotIndex === startIndex ? 'reserved' : 'multi-slot-reserved', reservation: res };
                          break;
                        }
                      }
                    }
                    // Fade logic
                    const slotDate = new Date(dayStr + 'T' + slot.startTime);
                    const isPast = (colIdx === 0 && slotDate < now) || colIdx < 0;
                    let cellClass = 'p-2 border-b text-center ';
                    if (isPast) cellClass += 'opacity-40 ';
                    if (slotInfo.status === 'available') cellClass += 'bg-green-100';
                    else if (slotInfo.status === 'reserved' || slotInfo.status === 'multi-slot-reserved') cellClass += 'bg-red-200 text-red-700';
                    let cellContent = '';
                    if (slotInfo.status === 'reserved' || slotInfo.status === 'multi-slot-reserved') {
                      if (slotInfo.reservation) {
                        cellContent = `${slotInfo.reservation.userName} (${slotInfo.reservation.filamentNeededGrams}g)`;
                      } else {
                        cellContent = 'Reserved';
                      }
                      if (slotInfo.status === 'multi-slot-reserved') cellContent += ' (cont.)';
                    }
                    if (slotInfo.status === 'available' && !isPast) {
                      return (
                        <td key={colIdx} className={cellClass + ' cursor-pointer hover:bg-green-300'}
                          onClick={() => handleOpenPrinterReserveModal(selectedPrinterForTimetable, dayStr, slot.id)}
                          title={`Reserve ${selectedPrinterForTimetable.name} on ${dayStr} at ${slot.startTime}`}
                        >
                          Reserve
                        </td>
                      );
                    }
                    return <td key={colIdx} className={cellClass}>{cellContent}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Helper for status badge
  const getLendingStatusBadge = (status: string) => {
    let color = '';
    let label = status;
    switch (status) {
      case 'Pending': color = 'bg-yellow-100 text-yellow-800 border-yellow-300'; label = 'Pending'; break;
      case 'Borrowed': color = 'bg-green-100 text-green-800 border-green-300'; label = 'Borrowed'; break;
      case 'Returned': color = 'bg-gray-100 text-gray-800 border-gray-300'; label = 'Returned'; break;
      case 'Rejected': color = 'bg-red-100 text-red-800 border-red-300'; label = 'Rejected'; break;
      default: color = 'bg-gray-100 text-gray-800 border-gray-300';
    }
    return <span className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${color}`}>{label}</span>;
  };

  // Add state for loading return
  const [returningRecordId, setReturningRecordId] = useState<string | null>(null);

  const handleReturnItem = async (recordId: string) => {
    if (!window.confirm('Are you sure you want to return this item?')) return;
    setReturningRecordId(recordId);
    // Optimistically remove the item from the list
    setLendingRecords(prev => prev.filter(lr => lr.id !== recordId));
    try {
      await returnItem(recordId);
    } finally {
      setReturningRecordId(null);
    }
  };

  const renderHistoryView = (title: string, records: (LendingRecord | PrinterReservation | LabReservation)[], type: 'lending' | 'printerReservation' | 'labReservation' | 'upcomingReturn') => (
    <div className="bg-white p-4 rounded-2xl shadow-xl">
      <h3 className="text-xl font-semibold text-neutral-dark mb-3">{title}</h3>
      {records.length === 0 && <p className="text-neutral-DEFAULT">No records found.</p>}
      <div className="overflow-x-auto rounded-xl shadow">
        <table className="w-full text-sm text-left rounded-xl overflow-hidden">
          <thead className="bg-neutral-light sticky top-0 z-10"><tr>
            { (type === 'lending') && <><th>Item</th><th>Qty</th><th>Borrow Date</th><th>{'Actual Return'}</th><th>Status</th></> }
            { type === 'printerReservation' && <>{currentUser?.role === UserRole.ADMIN && <th>User</th>}<th>Printer</th><th>Date</th><th>Time (Duration)</th><th>Filament</th><th>Own?</th><th>Status</th></> }
            { type === 'labReservation' && <><th>Purpose</th><th>Date</th><th>Time</th><th>Status</th><th>Admin Notes</th></> }
          </tr></thead>
          <tbody>{records.map((record, idx) => (
            <tr key={idx}>
              { type === 'lending' && <><td>{(record as LendingRecord).itemName}</td><td>{(record as LendingRecord).quantityBorrowed}</td><td>{formatDate((record as LendingRecord).borrowDate)}</td><td>{formatDate((record as LendingRecord).actualReturnDate)}</td><td>{getLendingStatusBadge((record as LendingRecord).status)}</td></> }
              { type === 'printerReservation' && <>{currentUser?.role === UserRole.ADMIN && <td>{(record as PrinterReservation).userName}</td>}<td>{(record as PrinterReservation).printerName}</td><td>{formatDate((record as PrinterReservation).date)}</td><td>{TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id ===(record as PrinterReservation).timeSlotId)?.startTime} ({(record as PrinterReservation).requestedTimeSlots * 30}m)</td><td>{(record as PrinterReservation).filamentNeededGrams}g</td><td>{(record as PrinterReservation).usesOwnFilament ? 'Yes':'No'}</td><td>{(record as PrinterReservation).status}</td></> }
              { type === 'labReservation' && <><td>{(record as LabReservation).purpose}</td><td>{formatDate((record as LabReservation).date)}</td><td>{LAB_TIME_SLOTS_1_HOUR.find(ts => ts.id === (record as LabReservation).timeSlotId)?.startTime}</td><td>{(record as LabReservation).status}</td><td>{(record as LabReservation).adminNotes || 'N/A'}</td></> }
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );

  // Lab Booking View (Lecturer)
  const renderLabSpaceBookingView = () => (
    <div className="space-y-6">
        <div>
            <h3 className="text-xl font-semibold text-neutral-dark">Book Lab Space (1-Hour Slots)</h3>
            <p className="text-sm text-neutral-DEFAULT mb-2">Select a date and click an available time slot to make a booking.</p>
            {renderLabTimetableView(false)} {/* false indicates not admin view for slot details */}
        </div>
        <div>
            <h3 className="text-xl font-semibold text-neutral-dark mt-6">Your Lab Bookings</h3>
            <div className="rounded-2xl shadow-lg bg-white mb-6">
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
                  <thead className="bg-gradient-to-r from-blue-100 to-blue-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Purpose</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Date</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Time</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Admin Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userLabReservations.filter(r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED).length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-3 text-neutral-DEFAULT">You have no active or pending lab bookings.</td></tr>
                    )}
                    {userLabReservations.filter(r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED).map((record, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors' : 'bg-white hover:bg-blue-50/70 transition-colors'}>
                        <td className="px-6 py-3">{record.purpose}</td>
                        <td className="px-6 py-3">{formatDate(record.date)}</td>
                        <td className="px-6 py-3">{LAB_TIME_SLOTS_1_HOUR.find(ts => ts.id === record.timeSlotId)?.startTime}</td>
                        <td className="px-6 py-3">{record.status}</td>
                        <td className="px-6 py-3">{record.adminNotes || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-neutral-dark mt-6">Your Lab Booking History</h3>
            <div className="rounded-2xl shadow-lg bg-white">
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
                  <thead className="bg-gradient-to-r from-blue-100 to-blue-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Purpose</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Date</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Time</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                      <th className="px-6 py-3 font-semibold text-neutral-dark">Admin Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userLabReservations.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-3 text-neutral-DEFAULT">No records found.</td></tr>
                    )}
                    {userLabReservations.map((record, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors' : 'bg-white hover:bg-blue-50/70 transition-colors'}>
                        <td className="px-6 py-3">{record.purpose}</td>
                        <td className="px-6 py-3">{formatDate(record.date)}</td>
                        <td className="px-6 py-3">{LAB_TIME_SLOTS_1_HOUR.find(ts => ts.id === record.timeSlotId)?.startTime}</td>
                        <td className="px-6 py-3">{record.status}</td>
                        <td className="px-6 py-3">{record.adminNotes || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
    </div>
  );

  // Lab Timetable (Reusable for Lecturer booking & Admin management)
  const renderLabTimetableView = (isAdminView: boolean) => {
    // Build a 2D array: rows = slots, columns = days
    const now = new Date();
    return (
      <div className="mt-2 bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold text-neutral-dark mb-2">Lab Availability</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm border">
            <thead>
              <tr>
                <th className="p-2 border-b bg-gray-100">Time</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="p-2 border-b bg-gray-100 text-center">
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LAB_TIME_SLOTS_1_HOUR.map((slot, rowIdx) => (
                <tr key={slot.id}>
                  <td className="p-2 border-b font-medium bg-gray-50">{slot.startTime} - {slot.endTime}</td>
                  {weekDays.map((d, colIdx) => {
                    const dayStr = toLocalYMD(d);
                    // Find reservation for this day/slot
                    const timetableReservations = labReservations.filter(r =>
                      toLocalYMD(new Date(r.date)) === dayStr &&
                      r.timeSlotId === slot.id &&
                      (r.status === ReservationStatus.APPROVED || r.status === ReservationStatus.PENDING)
                    );
                    let slotInfo: { status: 'available' | 'reserved'; reservation?: LabReservation } = { status: 'available', reservation: undefined };
                    if (timetableReservations.length > 0) {
                      slotInfo = { status: 'reserved', reservation: timetableReservations[0] };
                    }
                    // Fade logic
                    const slotDate = new Date(dayStr + 'T' + slot.startTime);
                    const isPast = (colIdx === 0 && slotDate < now) || colIdx < 0;
                    let cellClass = 'p-2 border-b text-center ';
                    if (isPast) cellClass += 'opacity-40 ';
                    if (slotInfo.status === 'available') cellClass += 'bg-green-100';
                    else if (slotInfo.status === 'reserved') cellClass += 'bg-red-200 text-red-700';
                    let cellContent = '';
                    if (slotInfo.status === 'reserved') {
                      if (slotInfo.reservation) {
                        cellContent = `${slotInfo.reservation.userName} (${slotInfo.reservation.purpose})`;
                      } else {
                        cellContent = 'Reserved';
                      }
                    }
                    if (slotInfo.status === 'available' && !isPast && !isAdminView && currentUser.role === UserRole.LECTURER) {
                      return (
                        <td key={colIdx} className={cellClass + ' cursor-pointer hover:bg-green-300'}
                          onClick={() => handleOpenLabReserveModal(dayStr, slot.id)}
                          title={`Book lab on ${dayStr} at ${slot.startTime}`}
                        >
                          Reserve
                        </td>
                      );
                    }
                    return <td key={colIdx} className={cellClass}>{cellContent}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };


  // ADMIN VIEWS
  const renderInventoryManagementView = () => (
    <div className="bg-white p-4 rounded-2xl shadow-xl">
      {/* Existing Inventory Table */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h3 className="text-xl font-semibold text-neutral-dark">Inventory</h3>
        <button onClick={() => setIsAddItemModalOpen(true)} className={primaryButtonClasses}>Add New Item</button>
      </div>
      <div className="overflow-x-auto rounded-xl shadow">
        <table className="w-full text-sm text-left rounded-xl overflow-hidden">
          <thead className="bg-neutral-light sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Total Qty</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item, idx) => (
              <tr key={item.id} className={`border-b transition-colors ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50`}>
                <td className="px-4 py-3 font-medium text-neutral-dark">{item.name}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.available}</td>
                <td className="px-4 py-3 flex flex-col sm:flex-row gap-2">
                  <button onClick={() => handleAdminRemoveItem(item.id)} className={`${dangerButtonClasses} text-xs`} disabled={item.quantity !== item.available}>Remove</button>
                  {item.quantity !== item.available && <span className="text-xs text-gray-500 ml-2">(Borrowed)</span>}
                  <button onClick={() => handleOpenAddQtyModal(item)} className={`${secondaryButtonClasses} text-xs`}>Add Quantity</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={addQtyModalOpen} onClose={() => setAddQtyModalOpen(false)} title={`Add Quantity: ${addQtyTargetItem?.name || ''}`}>
        <form className="space-y-4" onSubmit={handleAddQtySubmit}>
          <div>
            <label htmlFor="addQtyValue" className="block text-sm font-medium text-neutral-dark mb-1">Quantity to Add:</label>
            <input type="number" id="addQtyValue" value={addQtyValue} onChange={e => setAddQtyValue(Math.max(1, parseInt(e.target.value) || 1))} min="1" className={commonInputClasses} required />
          </div>
          <button type="submit" className={`${primaryButtonClasses} w-full`} disabled={addQtyLoading}>{addQtyLoading ? 'Adding...' : 'Add Quantity'}</button>
        </form>
      </Modal>
    </div>
  );

  const renderPrinterManagementView = () => ( // Admin
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-xl font-semibold text-neutral-dark mb-3">3D Printer Management & Requests</h3>
      <h4 className="text-lg font-medium text-neutral-dark my-2">Printer Status</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {printers.map(p => (
          <div key={p.id} className="p-3 border rounded bg-gray-50">
            <p className="font-semibold">{p.name}</p>
            <p>Status: {p.status}</p>
            <p>Filament: {p.filamentAvailableGrams}g</p>
            <button onClick={() => {
              const nextReservation = printerReservations.filter(r => r.printerId === p.id && (r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
              setSelectedPrinterForTimetable(p);
              setPrinterTimetableDate(nextReservation ? nextReservation.date : new Date().toISOString().split('T')[0]);
            }} className={`${primaryButtonClasses} text-xs mt-2 w-full`}>View Timetable</button>
            {currentUser.role === UserRole.ADMIN && (
              <button onClick={() => handleOpenRefillModal(p)} className={`${secondaryButtonClasses} text-xs mt-2 w-full`}>Refill Filament</button>
            )}
          </div>
        ))}
      </div>
      {selectedPrinterForTimetable && activeAdminView === 'printers' && renderPrinterTimetableView()}
      <h4 className="text-lg font-medium text-neutral-dark my-2 pt-4 border-t mt-6">Printer Reservation Requests</h4>
      {printerReservations.filter(r => r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.REJECTED && r.status !== ReservationStatus.COMPLETED).length === 0 && <p className="text-neutral-DEFAULT">No pending or approved requests.</p>}
      <ul className="space-y-2">{printerReservations.filter(r => r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.REJECTED && r.status !== ReservationStatus.COMPLETED).map(res => (
        <li key={res.id} className={`p-3 border rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center ${res.status === ReservationStatus.PENDING ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <div><p><span className="font-semibold">{res.userName}</span> requests <span className="font-semibold">{res.printerName}</span></p><p className="text-xs">Date: {formatDate(res.date)}, Slot: {TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id === res.timeSlotId)?.startTime} ({res.requestedTimeSlots*30} min)</p><p className="text-xs">Filament: {res.filamentNeededGrams}g (Own: {res.usesOwnFilament ? 'Yes' : 'No'}) | Status: <strong>{res.status}</strong></p></div>
          <div className="space-x-2 mt-2 sm:mt-0">
            {res.status === ReservationStatus.PENDING && <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.APPROVED)} className={`${secondaryButtonClasses} text-xs`}>Approve</button>}
            {res.status === ReservationStatus.PENDING && <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.REJECTED)} className={`${dangerButtonClasses} text-xs`}>Reject</button>}
            {res.status === ReservationStatus.PENDING && <button onClick={() => handleCancelPrinterReservation(res.id)} className={`${warningButtonClasses} text-xs`}>Cancel</button>}
            {res.status === ReservationStatus.APPROVED && <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.STARTED)} className={`${primaryButtonClasses} text-xs`}>Start</button>}
            {res.status === ReservationStatus.APPROVED && <button onClick={() => handleCancelPrinterReservation(res.id)} className={`${warningButtonClasses} text-xs`}>Cancel</button>}
            {res.status === ReservationStatus.STARTED && <>
              <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.STOPPED)} className={`${secondaryButtonClasses} text-xs`}>Stop</button>
              <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.COMPLETED)} className={`${primaryButtonClasses} text-xs`}>Complete</button>
              <button onClick={() => handleCancelPrinterReservation(res.id)} className={`${warningButtonClasses} text-xs`}>Cancel</button>
            </>}
            {res.status === ReservationStatus.STOPPED && <>
              <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.STARTED)} className={`${primaryButtonClasses} text-xs`}>Resume</button>
              <button onClick={() => updatePrinterReservationStatus(res.id, ReservationStatus.COMPLETED)} className={`${primaryButtonClasses} text-xs`}>Complete</button>
              <button onClick={() => handleCancelPrinterReservation(res.id)} className={`${warningButtonClasses} text-xs`}>Cancel</button>
            </>}
          </div>
        </li>
      ))}</ul>
      <h4 className="text-lg font-medium text-neutral-dark my-2 pt-4 border-t mt-6">Printer Reservation History</h4>
      <div className="rounded-2xl shadow-lg bg-white mt-2">
        <div className="overflow-y-auto max-h-96">
          <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
            <thead className="bg-gradient-to-r from-blue-100 to-blue-50">
              <tr>
                <th className="px-6 py-3 font-semibold text-neutral-dark">User</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Printer</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Date</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Time (Duration)</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Filament</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Own?</th>
                <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
              </tr>
            </thead>
            <tbody>
              {printerReservations.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-3 text-neutral-DEFAULT">No records found.</td></tr>
              )}
              {printerReservations.map((record, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors' : 'bg-white hover:bg-blue-50/70 transition-colors'}>
                  <td className="px-6 py-3">{record.userName}</td>
                  <td className="px-6 py-3">{record.printerName}</td>
                  <td className="px-6 py-3">{formatDate(record.date)}</td>
                  <td className="px-6 py-3">{TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id === record.timeSlotId)?.startTime} ({record.requestedTimeSlots * 30}m)</td>
                  <td className="px-6 py-3">{record.filamentNeededGrams}g</td>
                  <td className="px-6 py-3">{record.usesOwnFilament ? 'Yes':'No'}</td>
                  <td className="px-6 py-3">{record.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const handleOpenEditUserModal = (user: AnyUser) => {
    setUserToEdit(user);
    setEditName(user.name);
    setEditCourse((user.role === UserRole.STUDENT) ? (user as Student).course || '' : '');
    setEditStudentId((user.role === UserRole.STUDENT) ? (user as Student).studentId || '' : '');
    setEditUserModalOpen(true);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    setEditLoading(true);
    try {
      const body: any = { name: editName };
      if (userToEdit.role === UserRole.STUDENT) {
        body.course = editCourse;
        body.studentId = editStudentId;
      }
      await api.put(`/users/${userToEdit.id}`, body);
      window.location.reload();
    } catch (err: any) {
      alert('Failed to update user.');
    } finally {
      setEditLoading(false);
    }
  };

  const renderUserManagementView = () => {
    const lecturers = users.filter(user => user.role === UserRole.LECTURER);
    const students = users.filter(user => user.role === UserRole.STUDENT);
    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl space-y-10">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-primary">User Management</h3>
          <button onClick={() => setIsAddLecturerModalOpen(true)} className="bg-primary text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors font-semibold">Add Lecturer</button>
        </div>
        {/* Lecturers Section */}
        <div>
          <h4 className="text-xl font-semibold text-blue-700 mb-4">Lecturers</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lecturers.length === 0 && <p className="text-neutral-DEFAULT col-span-full">No lecturers found.</p>}
            {lecturers.map(user => (
              <div key={user.id} className="bg-gradient-to-br from-blue-100 via-white to-blue-50 rounded-2xl shadow-lg p-6 flex flex-col items-center relative group border border-neutral-200 hover:shadow-2xl transition-shadow">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold mb-3 ring-2 ring-blue-300">
                  {user.name.substring(0,1).toUpperCase()}
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-neutral-dark mb-1">{user.name}</h4>
                  <p className="text-sm text-neutral-600 mb-2"><span className="font-semibold">Role:</span> {user.role}</p>
                </div>
                <div className="flex gap-2 w-full mt-2">
                  {user.id !== currentUser.id && (
                    <button
                      onClick={() => { if(window.confirm(`Remove ${user.name}?`)) removeUser(user.id)}}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-700 transition-colors text-sm font-semibold flex-1"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEditUserModal(user)}
                    className="px-4 py-2 bg-secondary text-white rounded-lg shadow hover:bg-emerald-700 transition-colors text-sm font-semibold flex-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleOpenChangePasswordModal(user)}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg shadow hover:bg-yellow-700 transition-colors text-sm font-semibold flex-1"
                  >
                    Change Password
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Students Section */}
        <div>
          <h4 className="text-xl font-semibold text-green-700 mb-4 mt-8">Students</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {students.length === 0 && <p className="text-neutral-DEFAULT col-span-full">No students found.</p>}
            {students.map(user => (
              <div key={user.id} className="bg-gradient-to-br from-green-100 via-white to-green-50 rounded-2xl shadow-lg p-6 flex flex-col items-center relative group border border-neutral-200 hover:shadow-2xl transition-shadow">
                <div className="w-16 h-16 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-3 ring-2 ring-green-300">
                  {user.name.substring(0,1).toUpperCase()}
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-neutral-dark mb-1">{user.name}</h4>
                  <p className="text-sm text-neutral-600 mb-2"><span className="font-semibold">Role:</span> {user.role}</p>
                </div>
                <div className="flex gap-2 w-full mt-2">
                  {user.id !== currentUser.id && (
                    <button
                      onClick={() => { if(window.confirm(`Remove ${user.name}?`)) removeUser(user.id)}}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-700 transition-colors text-sm font-semibold flex-1"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEditUserModal(user)}
                    className="px-4 py-2 bg-secondary text-white rounded-lg shadow hover:bg-emerald-700 transition-colors text-sm font-semibold flex-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleOpenChangePasswordModal(user)}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg shadow hover:bg-yellow-700 transition-colors text-sm font-semibold flex-1"
                  >
                    Change Password
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Modal isOpen={editUserModalOpen} onClose={() => setEditUserModalOpen(false)} title="Edit User">
          <form className="space-y-4" onSubmit={handleEditUserSubmit}>
            <div>
              <label htmlFor="editName" className="block text-sm font-medium text-neutral-dark mb-1">Name:</label>
              <input type="text" id="editName" value={editName} onChange={e => setEditName(e.target.value)} className={commonInputClasses} required />
            </div>
            {userToEdit?.role === UserRole.STUDENT && (
              <>
                <div>
                  <label htmlFor="editStudentId" className="block text-sm font-medium text-neutral-dark mb-1">Student ID:</label>
                  <input type="text" id="editStudentId" value={editStudentId} onChange={e => setEditStudentId(e.target.value)} className={commonInputClasses} required />
                </div>
                <div>
                  <label htmlFor="editCourse" className="block text-sm font-medium text-neutral-dark mb-1">Course:</label>
                  <input type="text" id="editCourse" value={editCourse} onChange={e => setEditCourse(e.target.value)} className={commonInputClasses} required />
                </div>
              </>
            )}
            <button type="submit" className={`${primaryButtonClasses} w-full`} disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</button>
          </form>
        </Modal>
    </div>
  );
  };
  
  const renderNotificationPortalView = () => {
    const pendingPrinterRes = printerReservations.filter(r => r.status === ReservationStatus.PENDING);
    const pendingLabRes = labReservations.filter(r => r.status === ReservationStatus.PENDING);
    const upcomingReturns = lendingRecords.filter(lr => lr.status === LendingStatus.BORROWED && new Date(lr.expectedReturnDate) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    const pendingLendingRequests = lendingRecords.filter(lr => lr.status === 'Pending');
    // Lending notifications (recent borrowings)
    const lendingNotifications = notifications
      .filter(n => n.type === 'borrow')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Add handler for approve/reject
    const handleApproveLending = async (id: string) => {
      if (!window.confirm('Are you sure you want to approve this lending request?')) return;
      await api.put(`/lending/${id}/approve`);
      // Refresh lending records and notifications
      const [lendingRes, notificationsRes] = await Promise.all([
        api.get('/lending'),
        api.get('/users/notifications')
      ]);
      const mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
      setLendingRecords(mappedLendingRecords);
      setNotifications(notificationsRes.data.notifications || []);
    };
    const handleRejectLending = async (id: string) => {
      if (!window.confirm('Are you sure you want to reject this lending request?')) return;
      await api.put(`/lending/${id}/reject`);
      // Refresh lending records and notifications
      const [lendingRes, notificationsRes] = await Promise.all([
        api.get('/lending'),
        api.get('/users/notifications')
      ]);
      const mappedLendingRecords = (lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend);
      setLendingRecords(mappedLendingRecords);
      setNotifications(notificationsRes.data.notifications || []);
    };
    return (
        <div className="bg-white p-4 rounded-lg shadow space-y-6">
            <h3 className="text-xl font-semibold text-neutral-dark">Notification Portal</h3>
            {(pendingPrinterRes.length + pendingLabRes.length + upcomingReturns.length + pendingLendingRequests.length) === 0 && <p className="text-neutral-DEFAULT">No new notifications.</p>}
            {pendingPrinterRes.length > 0 && <div><h4 className="text-md font-semibold text-orange-600 mb-1">Pending Printer Reservations ({pendingPrinterRes.length})</h4><ul className="list-disc pl-5 text-sm">{pendingPrinterRes.slice(0,3).map(r => <li key={r.id}>{r.userName} for {r.printerName}. <button className="text-primary text-xs hover:underline" onClick={()=>{setActiveAdminView('printers'); setSelectedPrinterForTimetable(printers.find(p=>p.id===r.printerId)||null); setPrinterTimetableDate(r.date);}}>View</button></li>)}{pendingPrinterRes.length > 3 && <li>And {pendingPrinterRes.length-3} more...</li>}</ul></div>}
            {pendingLabRes.length > 0 && <div><h4 className="text-md font-semibold text-blue-600 mb-1">Pending Lab Bookings ({pendingLabRes.length})</h4><ul className="list-disc pl-5 text-sm">{pendingLabRes.slice(0,3).map(r => <li key={r.id}>{r.userName} for {r.purpose} on {formatDate(r.date)}. <button className="text-primary text-xs hover:underline" onClick={()=>{setActiveAdminView('labBookingsMgt'); setLabTimetableDate(r.date);}}>View</button></li>)}{pendingLabRes.length > 3 && <li>And {pendingLabRes.length-3} more...</li>}</ul></div>}
            {pendingLendingRequests.length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-green-700 mb-1 flex items-center">Pending Lending Requests <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{pendingLendingRequests.length}</span></h4>
                <ul className="pl-5 text-sm space-y-2">
                  {pendingLendingRequests.map(lr => (
                    <li key={lr.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-yellow-50 p-2 rounded border border-yellow-200">
                      <div>
                        <span className="font-semibold">{lr.userName}</span> requests <span className="font-semibold">{lr.itemName}</span> (Qty: {lr.quantityBorrowed})
                        <span className="ml-2 text-xs text-gray-500">Return by: {formatDate(lr.expectedReturnDate)}</span>
                        <span className="ml-2 text-xs text-gray-400">Requested: {lr.requestTimestamp ? formatDateTime(lr.requestTimestamp) : 'N/A'}</span>
                      </div>
                      <div className="flex gap-2 mt-2 sm:mt-0">
                        <button className="bg-green-600 text-white px-3 py-1 rounded text-xs" onClick={() => handleApproveLending(lr.id)}>Approve</button>
                        <button className="bg-red-600 text-white px-3 py-1 rounded text-xs" onClick={() => handleRejectLending(lr.id)}>Reject</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {upcomingReturns.length > 0 && <div><h4 className="text-md font-semibold text-yellow-600 mb-1">Items Due Soon ({upcomingReturns.length})</h4><ul className="list-disc pl-5 text-sm">{upcomingReturns.slice(0,3).map(lr => <li key={lr.id}>{lr.itemName} ({lr.quantityBorrowed}) by {lr.userName} (Due: {formatDate(lr.expectedReturnDate)}).</li>)}{upcomingReturns.length > 3 && <li>And {upcomingReturns.length-3} more...</li>}</ul></div>}
        </div>
    );
  };

  const renderReportingView = () => (
    <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <h3 className="text-xl font-semibold text-neutral-dark">Reporting</h3><p className="text-sm text-neutral-DEFAULT">Export data as CSV files.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <button onClick={() => handleExportCSV(users.map(u => ({id:u.id, name:u.name, role:u.role, studentId:(u as Student).studentId || 'N/A', course:(u as Student).course || 'N/A'})), 'all_users_report')} className={secondaryButtonClasses}>Export Users</button>
            <button onClick={() => handleExportCSV(inventory, 'inventory_report')} className={secondaryButtonClasses}>Export Inventory</button>
            <button onClick={() => handleExportCSV(printerReservations, 'printer_reservations_report')} className={secondaryButtonClasses}>Export Printer Reservations</button>
            <button onClick={() => handleExportCSV(labReservations, 'lab_bookings_report')} className={secondaryButtonClasses}>Export Lab Bookings</button>
            <button onClick={() => handleExportCSV(lendingRecords, 'lending_history_report')} className={secondaryButtonClasses}>Export Lending History</button>
        </div>
    </div>
  );
  
  const renderLabBookingsManagementView = () => ( // Admin
    <div className="bg-white p-4 rounded-lg shadow space-y-6">
        <h3 className="text-xl font-semibold text-neutral-dark">Lab Booking Management</h3>
        <div>
            <h4 className="text-lg font-semibold text-neutral-dark mb-2">Lab Timetable & Bookings</h4>
            {renderLabTimetableView(true)} {/* true indicates admin view for slot details */}
        </div>
        <div>
            <h4 className="text-lg font-semibold text-neutral-dark mt-4">All Lab Bookings (Pending/Approved)</h4>
            {labReservations.filter(r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED).length === 0 && (
              <div className="text-gray-500">No lab bookings found.</div>
            )}
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="bg-gray-200">
                  <th className="text-left">User</th>
                  <th className="text-left">Purpose</th>
                  <th className="text-left">Date</th>
                  <th className="text-left">Time</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Admin Notes</th>
                  <th className="text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {labReservations.filter(r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.APPROVED).map(res => (
                  <tr key={res.id} className="border-b">
                    <td>{res.userName}</td>
                    <td>{res.purpose}</td>
                    <td>{formatDate(res.date)}</td>
                    <td>{LAB_TIME_SLOTS_1_HOUR.find(ts => ts.id === res.timeSlotId)?.startTime}</td>
                    <td>{res.status}</td>
                    <td>
                      {res.adminNotes || 'N/A'}
                      <button className="ml-2 text-blue-600 underline text-xs" onClick={() => { setAdminNoteTargetId(res.id); setAdminNoteValue(res.adminNotes || ''); setAdminNoteModalOpen(true); setAdminNoteAction(null); }}>Edit Note</button>
                    </td>
                    <td>
                      {res.status === ReservationStatus.PENDING && (
                        <>
                          <button onClick={() => handleOpenAdminNoteModal(res.id, 'approve')} className={`${secondaryButtonClasses} text-xs`}>Approve</button>
                          <button onClick={() => handleOpenAdminNoteModal(res.id, 'reject')} className={`${dangerButtonClasses} text-xs ml-2`}>Reject</button>
                        </>
                      )}
                      {(res.status === ReservationStatus.PENDING || res.status === ReservationStatus.APPROVED) && (
                        <button onClick={() => handleCancelLabReservation(res.id)} className={`${warningButtonClasses} text-xs ml-2`}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        {/* Admin Note Modal */}
        <Modal isOpen={adminNoteModalOpen} onClose={() => setAdminNoteModalOpen(false)} title="Admin Note">
          <div className="space-y-4">
            <textarea className={commonInputClasses} value={adminNoteValue} onChange={e => setAdminNoteValue(e.target.value)} rows={4} placeholder="Enter admin note..." />
            {adminNoteAction && (
              <button className={primaryButtonClasses} onClick={handleAdminNoteSubmit}>{adminNoteAction === 'approve' ? 'Approve' : 'Reject'} with Note</button>
            )}
            {!adminNoteAction && (
              <button className={primaryButtonClasses} onClick={() => { setAdminNoteModalOpen(false); }}>Save Note</button>
            )}
          </div>
        </Modal>
    </div>
  );


  const userNavItemsBase = [
    { label: 'Dashboard', view: 'dashboard' as UserDashboardView },
    { label: 'Lending Items', view: 'lendingItems' as UserDashboardView },
    { label: '3D Printer Allocation', view: 'resourceAllocation' as UserDashboardView },
    { label: 'Lending & Returns', view: 'lendingAndReturns' as UserDashboardView },
  ];
  
  const lecturerNavItems = [ ...userNavItemsBase, { label: 'Lab Space Booking', view: 'labSpaceBooking' as UserDashboardView } ];

  const adminNavItems = [
    { label: 'Dashboard', view: 'dashboard' as AdminDashboardView },
    { label: 'Inventory Mgt.', view: 'inventory' as AdminDashboardView },
    { label: 'Lending Mgt.', view: 'lendingMgt' as AdminDashboardView },
    { label: 'Printer Mgt.', view: 'printers' as AdminDashboardView },
    { label: 'Lab Bookings Mgt.', view: 'labBookingsMgt' as AdminDashboardView },
    { label: 'User Management', view: 'users' as AdminDashboardView },
    { label: 'Reporting', view: 'reports' as AdminDashboardView },
  ];

  const currentView = currentUser.role === UserRole.ADMIN ? activeAdminView : activeUserView;
  const navItems = currentUser.role === UserRole.ADMIN ? adminNavItems : (currentUser.role === UserRole.LECTURER ? lecturerNavItems : userNavItemsBase);
  const setActiveView = currentUser.role === UserRole.ADMIN ? setActiveAdminView as any : setActiveUserView as any;


  const handleOpenChangePasswordModal = (user?: AnyUser) => {
    setChangePasswordTargetUser(user || null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setChangePasswordModalOpen(true);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      alert('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      alert('Passwords do not match.');
      return;
    }
    setChangePasswordLoading(true);
    try {
      if (changePasswordTargetUser && currentUser.role === UserRole.ADMIN) {
        // Admin changing another user's password
        await api.put(`/users/${changePasswordTargetUser.id}/change-password`, { newPassword });
        alert('Password changed successfully.');
      } else {
        // User changing their own password
        await api.put('/auth/change-password', { currentPassword, newPassword });
        alert('Password changed successfully.');
      }
      setChangePasswordModalOpen(false);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.message) {
        alert(`Failed to change password: ${err.response.data.message}`);
      } else {
        alert('Failed to change password.');
      }
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleOpenAddQtyModal = (item: InventoryItem) => {
    setAddQtyTargetItem(item);
    setAddQtyValue(1);
    setAddQtyModalOpen(true);
  };

  const handleAddQtySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addQtyTargetItem || addQtyValue <= 0) return;
    setAddQtyLoading(true);
    try {
      await updateInventoryItemQuantity(addQtyTargetItem.id, addQtyValue);
      setAddQtyModalOpen(false);
    } catch {
      alert('Failed to add quantity.');
    } finally {
      setAddQtyLoading(false);
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check if user has a pending request for an item
  const hasPendingRequest = (itemId: string) => {
    return userLendingRecords.some(lr => lr.itemId === itemId && lr.status === 'Pending');
  };

  // Add state for admin note modal
  const [adminNoteModalOpen, setAdminNoteModalOpen] = useState(false);
  const [adminNoteTargetId, setAdminNoteTargetId] = useState<string | null>(null);
  const [adminNoteValue, setAdminNoteValue] = useState('');
  const [adminNoteAction, setAdminNoteAction] = useState<'approve' | 'reject' | null>(null);

  const handleOpenAdminNoteModal = (id: string, action: 'approve' | 'reject') => {
    setAdminNoteTargetId(id);
    setAdminNoteAction(action);
    setAdminNoteValue('');
    setAdminNoteModalOpen(true);
  };

  const handleAdminNoteSubmit = async () => {
    if (!adminNoteTargetId || !adminNoteAction) return;
    await handleAdminUpdateLabBookingStatus(adminNoteTargetId, adminNoteAction === 'approve' ? ReservationStatus.APPROVED : ReservationStatus.REJECTED, adminNoteValue);
    setAdminNoteModalOpen(false);
  };

  // Add Heroicons SVGs for sidebar
  const navIcons = {
    dashboard: <MdDashboard className="w-5 h-5 mr-2" color="#2563eb" />, // blue
    notifications: <MdNotifications className="w-5 h-5 mr-2" color="#f59e42" />, // orange
    inventory: <MdInventory className="w-5 h-5 mr-2" color="#10b981" />, // green
    printers: <MdPrint className="w-5 h-5 mr-2" color="#a21caf" />, // purple
    labBookingsMgt: <MdMeetingRoom className="w-5 h-5 mr-2" color="#f43f5e" />, // red
    users: <MdPeople className="w-5 h-5 mr-2" color="#0ea5e9" />, // cyan
    reports: <MdReport className="w-5 h-5 mr-2" color="#fbbf24" />, // yellow
    lendingItems: <FaCubes className="w-5 h-5 mr-2" color="#6366f1" />, // indigo
    resourceAllocation: <MdPrint className="w-5 h-5 mr-2" color="#a21caf" />,
    lendingHistory: <MdHistory className="w-5 h-5 mr-2" color="#f59e42" />,
    returns: <MdAssignmentReturn className="w-5 h-5 mr-2" color="#10b981" />,
    labSpaceBooking: <FaFlask className="w-5 h-5 mr-2" color="#f43f5e" />,
    lendingMgt: <MdAssignmentReturn className="w-5 h-5 mr-2" color="#f97316" />, // orange for lending management
    lendingAndReturns: <MdAssignmentReturn className="w-5 h-5 mr-2" color="#6366f1" />, // indigo for lending and returns
  };

  // Responsive sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Add state for refill modal
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [refillTargetPrinter, setRefillTargetPrinter] = useState<Printer | null>(null);
  const [refillAmount, setRefillAmount] = useState<number>(1000);
  const [refillLoading, setRefillLoading] = useState(false);
  // Add state for filament type in the Dashboard component
  const [refillFilamentType, setRefillFilamentType] = useState('');

  // Update handleOpenRefillModal to set filament type
  const handleOpenRefillModal = (printer: Printer) => {
    setRefillTargetPrinter(printer);
    setRefillAmount(printer.filamentAvailableGrams);
    setRefillFilamentType(printer.filament_type || '');
    setIsRefillModalOpen(true);
  };

  // Update handleRefillSubmit to send filamentType
  const handleRefillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refillTargetPrinter) return;
    setRefillLoading(true);
    try {
      const res = await api.put(`/printers/${refillTargetPrinter.id}/filament`, { filamentGrams: refillAmount, filamentType: refillFilamentType });
      // Refresh printers
      const printersRes = await api.get('/printers');
      setPrinters((printersRes.data.printers || []).map((p: any) => ({
        ...p,
        filamentAvailableGrams: p.filament_available_grams,
        filament_type: p.filament_type,
      })));
      setIsRefillModalOpen(false);
    } catch {
      alert('Failed to refill filament.');
    } finally {
      setRefillLoading(false);
    }
  };

  // Add at the top of the component:
  const [selectedTimetableDay, setSelectedTimetableDay] = useState(0); // 0 = today, 1 = tomorrow, ...
  // Fix weekDays to use local midnight:
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return new Date(d);
  });
  const selectedDate = weekDays[selectedTimetableDay].toISOString().slice(0, 10);

  // In renderPrinterTimetableView, before rendering slots:
  const timetableReservations = useMemo(() => {
    if (!selectedPrinterForTimetable) return [];
    return printerReservations.filter(r =>
      r.printerId === selectedPrinterForTimetable.id &&
      toLocalYMD(new Date(r.date)) === selectedDate &&
      r.status !== ReservationStatus.COMPLETED &&
      r.status !== ReservationStatus.CANCELLED &&
      r.status !== ReservationStatus.REJECTED
    );
  }, [printerReservations, selectedPrinterForTimetable, selectedDate]);

  const getPrinterSlotInfoForDay = useCallback((slotId: string): { status: 'available' | 'reserved' | 'multi-slot-reserved'; reservation?: PrinterReservation } => {
    for (const res of timetableReservations) {
      const startIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === res.timeSlotId);
      if (startIndex !== -1) {
        const slotIndex = TIME_SLOTS_8_TO_4_30_MIN.findIndex(ts => ts.id === slotId);
        if (slotIndex >= startIndex && slotIndex < startIndex + res.requestedTimeSlots) {
          return { status: slotIndex === startIndex ? 'reserved' : 'multi-slot-reserved', reservation: res };
        }
      }
    }
    return { status: 'available' };
  }, [timetableReservations]);

  // Add at the top of the Dashboard component (after useApp):
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const handleUserMenuToggle = () => setUserMenuOpen(v => !v);
  const handleUserMenuClose = () => setUserMenuOpen(false);

  // Add at the top of the Dashboard component (after userMenuOpen state):
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const handleNotifMenuToggle = () => setNotifMenuOpen(v => !v);
  const handleNotifMenuClose = () => setNotifMenuOpen(false);

  // Add notification read state at the top of the Dashboard component:
  const [readNotifications, setReadNotifications] = useState<Set<string>>(() => {
    // Load from sessionStorage if available
    const stored = sessionStorage.getItem('readNotifications');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // When notifications change, remove any read notifications that are no longer present
  useEffect(() => {
    setReadNotifications(prev => {
      const currentIds = new Set(notifications.map(n => n.id));
      const filtered = new Set([...prev].filter(id => currentIds.has(id)));
      sessionStorage.setItem('readNotifications', JSON.stringify([...filtered]));
      return filtered;
    });
  }, [notifications]);

  const hasUnread = notifications.some(n => !readNotifications.has(n.id));

  const handleNotificationClick = (n: Notification) => {
    setReadNotifications(prev => {
      const updated = new Set(prev).add(n.id);
      sessionStorage.setItem('readNotifications', JSON.stringify([...updated]));
      return updated;
    });
    // Navigate to relevant page based on notification type
    if (n.type === 'printer_booking') {
      setActiveAdminView('printers');
      setSelectedPrinterForTimetable(printers.find(p => String(p.id) === String(n.item_id)) || null);
    } else if (n.type === 'lab_booking') {
      setActiveAdminView('labBookingsMgt');
    } else if (n.type === 'borrow' || n.type === 'borrow_request') {
      setActiveAdminView('lendingMgt');
    } else if (n.type === 'borrow_approved' || n.type === 'borrow_rejected') {
      setActiveUserView('lendingAndReturns');
    }
    handleNotifMenuClose();
  };

  // Add refs for user and notification menus
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  // Click-away handling for user menu
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);
  // Click-away handling for notification menu
  useEffect(() => {
    if (!notifMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setNotifMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifMenuOpen]);

  // Add state for component search
  const [componentSearch, setComponentSearch] = useState('');

  // Filtered components for search - moved outside render function
  const filteredComponents = useMemo(() => {
    if (!componentSearch.trim()) return inventory.slice(0, 5); // Show top 5 if no search
    return inventory.filter(item => 
      item.name.toLowerCase().includes(componentSearch.trim().toLowerCase())
    );
  }, [inventory, componentSearch]);

  const renderAdminDashboardView = () => {
    const today = toLocalYMD(new Date());
    
    // Calculate user statistics
    const students = users.filter(u => u.role === UserRole.STUDENT);
    const lecturers = users.filter(u => u.role === UserRole.LECTURER);
    
    // Today's lab bookings
    const todaysLabBookings = labReservations.filter(r => 
      toLocalYMD(new Date(r.date)) === today && (r.status === ReservationStatus.APPROVED || r.status === ReservationStatus.PENDING)
    );
    
    // Printer statistics for today
    const printerStats = printers.map(printer => {
      const todaysReservations = printerReservations.filter(r => 
        r.printerId === printer.id && 
        toLocalYMD(new Date(r.date)) === today &&
        r.status === ReservationStatus.APPROVED
      );
      
      const todaysNeededFilament = todaysReservations.reduce((total, r) => total + (r.filamentNeededGrams || 0), 0);
      const todaysBookings = todaysReservations.length;
      
      return {
        ...printer,
        filament_type: printer.filament_type,
        todaysNeededFilament,
        todaysBookings
      };
    });

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Admin Dashboard</h2>
          <p className="text-gray-600">Welcome back, {currentUser.name}</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* User Statistics */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">{users.length}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Students:</span>
                <span className="font-medium">{students.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Lecturers:</span>
                <span className="font-medium">{lecturers.length}</span>
              </div>
            </div>
          </div>

          {/* Today's Lab Bookings */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Today's Lab Bookings</p>
                <p className="text-2xl font-semibold text-gray-900">{todaysLabBookings.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {todaysLabBookings.length > 0 ? 
                  `${todaysLabBookings.filter(r => r.status === ReservationStatus.APPROVED).length} approved, ${todaysLabBookings.filter(r => r.status === ReservationStatus.PENDING).length} pending` : 
                  'No bookings today'
                }
              </p>
            </div>
          </div>

          {/* Total Printers */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Printers</p>
                <p className="text-2xl font-semibold text-gray-900">{printers.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {printers.filter(p => p.status === 'Available').length} available
              </p>
            </div>
          </div>

          {/* Total Inventory Items */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Inventory Items</p>
                <p className="text-2xl font-semibold text-gray-900">{inventory.length}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {inventory.reduce((sum, item) => sum + item.available, 0)} items available
              </p>
            </div>
          </div>
        </div>

        {/* Printer Status Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Today's Printer Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Printer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available Filament</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Today's Needed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Today's Bookings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filament Type</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {printerStats.map((printer) => (
                  <tr key={printer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{printer.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {printer.filamentAvailableGrams}g
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {printer.todaysNeededFilament}g
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {printer.todaysBookings}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{printer.filament_type || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Component Search */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Quick Component Search</h3>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search for components..."
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredComponents.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <h4 className="font-medium text-gray-900 mb-2">{item.name}</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Available:</span>
                      <span className={`font-medium ${item.available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.available}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total:</span>
                      <span className="font-medium">{item.quantity}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredComponents.length === 0 && componentSearch.trim() && (
              <p className="text-center text-gray-500 py-4">No components found matching "{componentSearch}"</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredNotifications = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.ADMIN) {
      // Show all relevant admin notifications, including borrow requests
      return notifications.filter(n => ['printer_booking', 'lab_booking', 'borrow', 'borrow_request'].includes(n.type));
    } else {
      return notifications.filter(n => n.user_id === String(currentUser.id) && !['lab_booking', 'printer_booking', 'borrow', 'borrow_request'].includes(n.type));
    }
  }, [notifications, currentUser]);

  const handleApproveBorrowRequest = async (recordId: string) => {
    try {
      await api.put(`/lending/${recordId}/approve`);
      setToastMessage('Borrow request approved.');
      // Refresh lending records
      const lendingRes = await api.get('/lending');
      setLendingRecords((lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend));
      // Refresh inventory as well
      const inventoryRes = await api.get('/inventory');
      setInventory(inventoryRes.data.inventory || []);
    } catch (err: any) {
      setToastMessage(err?.response?.data?.message || 'Failed to approve request.');
    }
  };

  const handleRejectBorrowRequest = async (recordId: string) => {
    try {
      await api.put(`/lending/${recordId}/reject`);
      setToastMessage('Borrow request rejected.');
      // Refresh lending records
      const lendingRes = await api.get('/lending');
      setLendingRecords((lendingRes.data.lendingRecords || []).map(mapLendingRecordFromBackend));
      // Refresh inventory as well
      const inventoryRes = await api.get('/inventory');
      setInventory(inventoryRes.data.inventory || []);
    } catch (err: any) {
      setToastMessage(err?.response?.data?.message || 'Failed to reject request.');
    }
  };

  const renderReturnsView = () => (
    <div className="space-y-8">
      <div>
        {renderHistoryView(
          'Items to Return',
          userLendingRecords.filter(lr => lr.status === LendingStatus.BORROWED && lr.borrowDate),
          'lending')}
      </div>
      <div>
        {renderHistoryView(
          'Return History',
          userLendingRecords.filter(lr => lr.status === LendingStatus.RETURNED && lr.borrowDate),
          'lending')}
      </div>
    </div>
  );

  const [lendingMgtPage, setLendingMgtPage] = useState(1);
  const lendingMgtPageSize = 10;

  const renderLendingManagementView = (page: number, setPage: (p: number) => void, pageSize: number, borrowedSearch: string, setBorrowedSearch: (s: string) => void) => {
    // Borrow requests: status === 'Pending'
    const borrowRequests = lendingRecords.filter(lr => lr.status === LendingStatus.PENDING);
    // Borrowed: status === 'Borrowed' and has borrowDate
    let borrowedRecords = lendingRecords.filter(lr => lr.status === LendingStatus.BORROWED && lr.borrowDate);
    if (borrowedSearch.trim()) {
      const search = borrowedSearch.trim().toLowerCase();
      borrowedRecords = borrowedRecords.filter(lr =>
        lr.userName.toLowerCase().includes(search) ||
        lr.itemName.toLowerCase().includes(search)
      );
    }
    const last10Borrowed = borrowedRecords.slice(-10).reverse();
    // Lending history: all records, paginated
    const paginatedHistory = lendingRecords.slice((page-1)*pageSize, page*pageSize);
    const totalPages = Math.ceil(lendingRecords.length / pageSize);
    // Helper for admin actions
    const renderAdminActions = (record: LendingRecord) => {
      if (record.status === LendingStatus.PENDING) {
        return <>
          <button onClick={() => handleApproveBorrowRequest(record.id)} className={`${primaryButtonClasses} text-xs mr-2`}>Approve</button>
          <button onClick={() => handleRejectBorrowRequest(record.id)} className={`${dangerButtonClasses} text-xs`}>Reject</button>
        </>;
      }
      if (record.status === LendingStatus.BORROWED) {
        return <button onClick={() => handleReturnItem(record.id)} className={`${secondaryButtonClasses} text-xs`}>Mark as Returned</button>;
      }
      return null;
    };
    // Custom renderHistoryView for admin actions and improved columns
    const renderAdminHistoryView = (title: string, records: LendingRecord[], type: 'borrow' | 'handover' | 'history') => {
      // Choose gradient and row color based on table type
      let theadGradient = 'bg-gradient-to-r from-blue-100 to-blue-50';
      let rowEven = 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors';
      let rowOdd = 'bg-white hover:bg-blue-50/70 transition-colors';
      if (type === 'handover') {
        theadGradient = 'bg-gradient-to-r from-yellow-100 to-yellow-50';
        rowEven = 'bg-yellow-50/50 hover:bg-yellow-100/70 transition-colors';
        rowOdd = 'bg-white hover:bg-yellow-50/70 transition-colors';
      } else if (type === 'history') {
        theadGradient = 'bg-gradient-to-r from-green-100 to-green-50';
        rowEven = 'bg-green-50/50 hover:bg-green-100/70 transition-colors';
        rowOdd = 'bg-white hover:bg-green-50/70 transition-colors';
      }
      return (
        <div className="rounded-2xl shadow-lg bg-white">
          <div className="overflow-y-auto max-h-96">
            <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
              <thead className={theadGradient}>
                <tr>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">User</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Item</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Qty</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Borrow Date</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">{type === 'handover' ? 'Expected Return' : 'Actual Return'}</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                  {type !== 'history' && <th className="px-6 py-3 font-semibold text-neutral-dark">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr><td colSpan={type !== 'history' ? 7 : 6} className="px-6 py-3 text-neutral-DEFAULT">No records found.</td></tr>
                )}
                {records.map((record, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? rowEven : rowOdd}>
                    <td className="px-6 py-3">{record.userName}</td>
                    <td className="px-6 py-3">{record.itemName}</td>
                    <td className="px-6 py-3">{record.quantityBorrowed}</td>
                    <td className="px-6 py-3">{record.borrowDate ? formatDate(record.borrowDate) : ''}</td>
                    <td className="px-6 py-3">{record.status === LendingStatus.BORROWED ? (record.expectedReturnDate ? formatDate(record.expectedReturnDate) : '') : (record.actualReturnDate ? formatDate(record.actualReturnDate) : '')}</td>
                    <td className="px-6 py-3">{getLendingStatusBadge(record.status)}</td>
                    {type !== 'history' && <td className="px-6 py-3">{renderAdminActions(record)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    };
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-xl font-semibold text-neutral-dark mb-3">Current Borrow Requests</h3>
          {renderAdminHistoryView('Current Borrow Requests', borrowRequests, 'borrow')}
        </div>
        <div>
          <h3 className="text-xl font-semibold text-neutral-dark mb-3">Borrowed</h3>
          <div className="mb-2 flex justify-end">
            <input
              type="text"
              value={borrowedSearch}
              onChange={e => setBorrowedSearch(e.target.value)}
              placeholder="Search user or component..."
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none shadow-sm text-sm w-64"
            />
          </div>
          {renderAdminHistoryView('Borrowed', last10Borrowed, 'handover')}
        </div>
        <div>
          <h3 className="text-xl font-semibold text-neutral-dark mb-3">Lending History</h3>
          {renderAdminHistoryView('Lending History', paginatedHistory, 'history')}
          <div className="flex gap-2 mt-2">
            <button disabled={page === 1} onClick={() => setPage(page-1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(page+1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    );
  };

  const [borrowedSearch, setBorrowedSearch] = useState('');

  const [userHistoryPage, setUserHistoryPage] = useState(1);
  const userHistoryPageSize = 10;
  const paginatedUserHistory = userLendingRecords.slice((userHistoryPage-1)*userHistoryPageSize, userHistoryPage*userHistoryPageSize);
  const userHistoryTotalPages = Math.ceil(userLendingRecords.length / userHistoryPageSize);
  const renderLendingAndReturnsView = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-neutral-dark mb-3">Your Lending History</h3>
        <div className="rounded-2xl shadow-lg bg-white">
          <div className="overflow-y-auto max-h-96">
            <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
              <thead className="bg-gradient-to-r from-blue-100 to-blue-50">
                <tr>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Item</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Qty</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Borrow Date</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Actual Return</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {userLendingRecords.map((record, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50/50 hover:bg-blue-100/70 transition-colors' : 'bg-white hover:bg-blue-50/70 transition-colors'}>
                    <td className="px-6 py-3">{record.itemName}</td>
                    <td className="px-6 py-3">{record.quantityBorrowed}</td>
                    <td className="px-6 py-3">{formatDate(record.borrowDate)}</td>
                    <td className="px-6 py-3">{formatDate(record.actualReturnDate)}</td>
                    <td className="px-6 py-3">{getLendingStatusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-neutral-dark mb-3">Items to Return</h3>
        <div className="rounded-2xl shadow-lg bg-white">
          <div className="overflow-y-auto max-h-96">
            <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
              <thead className="bg-gradient-to-r from-yellow-100 to-yellow-50">
                <tr>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Item</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Qty</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Borrow Date</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Actual Return</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {userLendingRecords.filter(lr => lr.status === LendingStatus.BORROWED && lr.borrowDate).map((record, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-yellow-50/50 hover:bg-yellow-100/70 transition-colors' : 'bg-white hover:bg-yellow-50/70 transition-colors'}>
                    <td className="px-6 py-3">{record.itemName}</td>
                    <td className="px-6 py-3">{record.quantityBorrowed}</td>
                    <td className="px-6 py-3">{formatDate(record.borrowDate)}</td>
                    <td className="px-6 py-3">{formatDate(record.actualReturnDate)}</td>
                    <td className="px-6 py-3">{getLendingStatusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-neutral-dark mb-3">Return History</h3>
        <div className="rounded-2xl shadow-lg bg-white">
          <div className="overflow-y-auto max-h-96">
            <table className="w-full text-sm text-left rounded-2xl overflow-hidden">
              <thead className="bg-gradient-to-r from-green-100 to-green-50">
                <tr>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Item</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Qty</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Borrow Date</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Actual Return</th>
                  <th className="px-6 py-3 font-semibold text-neutral-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {userLendingRecords.filter(lr => lr.status === LendingStatus.RETURNED && lr.borrowDate).map((record, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-green-50/50 hover:bg-green-100/70 transition-colors' : 'bg-white hover:bg-green-50/70 transition-colors'}>
                    <td className="px-6 py-3">{record.itemName}</td>
                    <td className="px-6 py-3">{record.quantityBorrowed}</td>
                    <td className="px-6 py-3">{formatDate(record.borrowDate)}</td>
                    <td className="px-6 py-3">{formatDate(record.actualReturnDate)}</td>
                    <td className="px-6 py-3">{getLendingStatusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const [quickSearch, setQuickSearch] = useState('');
  const quickSearchResults = useMemo(() => {
    if (!quickSearch.trim()) return inventory.slice(0, 5);
    return inventory.filter(item => item.name.toLowerCase().includes(quickSearch.trim().toLowerCase()));
  }, [inventory, quickSearch]);

  const renderUserDashboardView = (quickSearch: string, setQuickSearch: React.Dispatch<React.SetStateAction<string>>, quickSearchResults: InventoryItem[]) => {
    const today = toLocalYMD(new Date());
    // Borrowed items
    const currentlyBorrowed = userLendingRecords.filter(lr => lr.status === LendingStatus.BORROWED);
    // Lending history
    const totalBorrowed = userLendingRecords.length;
    const recentReturns = userLendingRecords.filter(lr => lr.status === LendingStatus.RETURNED).slice(-5).reverse();
    // Printer reservations
    const pendingPrinterReservations = userPrinterReservations.filter(r => r.status === ReservationStatus.PENDING);
    const nextPendingPrinterReservation = pendingPrinterReservations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    // Lab bookings (lecturer only)
    const isLecturer = currentUser.role === UserRole.LECTURER;
    const upcomingLabBookings = isLecturer ? userLabReservations.filter(r => new Date(r.date) >= new Date() && r.status === ReservationStatus.APPROVED) : [];
    const nextLabBooking = isLecturer && upcomingLabBookings.length > 0 ? upcomingLabBookings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] : null;
    // Notifications
    const myNotifications = notifications.filter(n => n.user_id === String(currentUser.id));
    const unreadCount = myNotifications.filter(n => !readNotifications.has(n.id)).length;
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Dashboard</h2>
          <p className="text-gray-600">Welcome back, {currentUser.name}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Currently Borrowed */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg"><FaCubes className="w-6 h-6 text-blue-600" /></div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Currently Borrowed</p>
                <p className="text-2xl font-semibold text-gray-900">{currentlyBorrowed.length}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm">
              {currentlyBorrowed.slice(0, 3).map(lr => (
                <div key={lr.id} className="flex justify-between"><span>{lr.itemName}</span><span>{formatDate(lr.expectedReturnDate)}</span></div>
              ))}
              {currentlyBorrowed.length === 0 && <span className="text-gray-500">No items borrowed</span>}
            </div>
          </div>
          {/* Pending Printer Reservations */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg"><MdPrint className="w-6 h-6 text-purple-600" /></div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending printer reservations</p>
                <p className="text-2xl font-semibold text-gray-900">{pendingPrinterReservations.length}</p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              {nextPendingPrinterReservation ? (
                <div>
                  <div className="font-medium">{printers.find(p => p.id === nextPendingPrinterReservation.printerId)?.name || 'Printer'}</div>
                  <div>{formatDate(nextPendingPrinterReservation.date)}, {TIME_SLOTS_8_TO_4_30_MIN.find(ts => ts.id === nextPendingPrinterReservation.timeSlotId)?.startTime}</div>
                </div>
              ) : <span className="text-gray-500">No pending reservations</span>}
            </div>
          </div>
          {/* Lab Bookings (Lecturer) */}
          {isLecturer && <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg"><FaFlask className="w-6 h-6 text-red-600" /></div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Upcoming Lab Bookings</p>
                <p className="text-2xl font-semibold text-gray-900">{upcomingLabBookings.length}</p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              {nextLabBooking ? (
                <div>
                  <div className="font-medium">{nextLabBooking.purpose}</div>
                  <div>{formatDate(nextLabBooking.date)}, {LAB_TIME_SLOTS_1_HOUR.find(ts => ts.id === nextLabBooking.timeSlotId)?.startTime}</div>
                </div>
              ) : <span className="text-gray-500">No upcoming bookings</span>}
            </div>
          </div>}
          {/* Lending History */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg"><MdHistory className="w-6 h-6 text-green-600" /></div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Borrowed</p>
                <p className="text-2xl font-semibold text-gray-900">{totalBorrowed}</p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <div className="font-medium mb-1">Recent Returns</div>
              {recentReturns.length > 0 ? recentReturns.map(lr => (
                <div key={lr.id} className="flex justify-between"><span>{lr.itemName}</span><span>{formatDate(lr.actualReturnDate)}</span></div>
              )) : <span className="text-gray-500">No recent returns</span>}
            </div>
          </div>
          {/* Quick Component Search */}
          <div className="bg-white p-6 rounded-lg shadow col-span-1 md:col-span-2 lg:col-span-3">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search for components..."
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickSearchResults.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <h4 className="font-medium text-gray-900 mb-2">{item.name}</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Available:</span>
                      <span className={`font-medium ${item.available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.available}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total:</span>
                      <span className="font-medium">{item.quantity}</span>
                    </div>
                  </div>
                </div>
              ))}
              {quickSearchResults.length === 0 && quickSearch.trim() && (
                <p className="text-center text-gray-500 py-4 col-span-full">No components found matching "{quickSearch}"</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex animate-fadeIn">
      {/* Hamburger for mobile */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-primary text-white p-2 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-40 animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}
      <aside
        className={`w-64 bg-neutral-dark text-neutral-light p-4 space-y-2 shadow-lg flex flex-col md:relative fixed md:static z-50 h-full md:h-auto transition-transform duration-300 md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ minHeight: '100vh', top: 0, left: 0 }}
        tabIndex={-1}
        aria-label="Sidebar navigation"
        onKeyDown={e => { if (e.key === 'Escape') setSidebarOpen(false); }}
      >
        <nav className="flex-grow">
          {navItems.map(item => (
            <button
              key={item.view}
              onClick={() => { setActiveView(item.view); if (["resourceAllocation","printers","labSpaceBooking","labBookingsMgt"].indexOf(item.view) === -1) { setSelectedPrinterForTimetable(null); } setSidebarOpen(false); }}
              className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm font-medium mb-1
                ${currentView === item.view ? 'bg-primary/90 text-white shadow border-l-4 border-blue-400' : 'hover:bg-gray-700 text-neutral-light'}`}
              aria-current={currentView === item.view ? 'page' : undefined}
            >
              {item.view in navIcons ? navIcons[item.view as keyof typeof navIcons] : <span className="w-5 h-5 mr-2" />}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6 bg-gray-100 overflow-y-auto">
        <div className="flex justify-end items-center mb-6 relative gap-4">
          <div className="relative" ref={notifMenuRef}>
            <button
              className="relative p-2 rounded-full hover:bg-gray-200 focus:outline-none"
              onClick={handleNotifMenuToggle}
              aria-label="Notifications"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {hasUnread && <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
            </button>
            {notifMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow-lg z-50 animate-fadeIn max-h-96 overflow-y-auto">
                <div className="p-3 border-b font-semibold">Notifications</div>
                {filteredNotifications.length === 0 ? (
                  <div className="p-4 text-gray-500 text-sm">No notifications.</div>
                ) : (
                  <ul className="divide-y">
                    {filteredNotifications.slice(0, 10).map((n: Notification) => (
                      <li
                        key={n.id}
                        className={`p-3 text-sm cursor-pointer transition-colors ${!readNotifications.has(n.id) ? 'bg-blue-50 font-semibold' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        {n.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {/* User menu button follows here */}
          <div className="relative" ref={userMenuRef}>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-white shadow hover:bg-blue-700 focus:outline-none"
              onClick={handleUserMenuToggle}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <span className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-lg font-bold">
                {currentUser.name.substring(0,1).toUpperCase()}
              </span>
              <span className="font-semibold text-base">{currentUser.name}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-50 animate-fadeIn">
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  onClick={() => { handleOpenChangePasswordModal(); handleUserMenuClose(); }}
                >Change Password</button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-600"
                  onClick={() => { logout(); handleUserMenuClose(); }}
                >Logout</button>
              </div>
            )}
          </div>
        </div>
        {currentUser.role !== UserRole.ADMIN && ( <>
            {activeUserView === 'dashboard' && renderUserDashboardView(quickSearch, setQuickSearch, quickSearchResults)}
            {activeUserView === 'lendingItems' && renderLendingItemsView()}
            {activeUserView === 'resourceAllocation' && renderResourceAllocationView()}
            {activeUserView === 'labSpaceBooking' && currentUser.role === UserRole.LECTURER && renderLabSpaceBookingView()}
            {activeUserView === 'lendingAndReturns' && renderLendingAndReturnsView()}
        </>)}
        {currentUser.role === UserRole.ADMIN && ( <>
            {activeAdminView === 'dashboard' && renderAdminDashboardView()}
            {activeAdminView === 'inventory' && renderInventoryManagementView()}
            {activeAdminView === 'printers' && renderPrinterManagementView()}
            {activeAdminView === 'labBookingsMgt' && renderLabBookingsManagementView()}
            {activeAdminView === 'users' && renderUserManagementView()}
            {activeAdminView === 'reports' && renderReportingView()}
            {activeAdminView === 'lendingMgt' && renderLendingManagementView(lendingMgtPage, setLendingMgtPage, lendingMgtPageSize, borrowedSearch, setBorrowedSearch)}
        </>)}
      </main>

      <Modal isOpen={isBorrowModalOpen} onClose={() => setIsBorrowModalOpen(false)} title={`Borrow: ${selectedItemToBorrow?.name}`}><div className="space-y-4"><p className="text-sm">Available: <span className="font-semibold">{selectedItemToBorrow?.available}</span></p><div><label htmlFor="borrowQty" className="block text-sm font-medium text-neutral-dark mb-1">Quantity:</label><input type="number" id="borrowQty" value={borrowQuantity} onChange={e => setBorrowQuantity(Math.max(1, Math.min(parseInt(e.target.value) || 1, selectedItemToBorrow?.available || 1 )))} min="1" max={selectedItemToBorrow?.available} className={commonInputClasses} /></div><div><label htmlFor="returnDate" className="block text-sm font-medium text-neutral-dark mb-1">Expected Return Date:</label><input type="date" id="returnDate" value={expectedReturnDate} onChange={e => setExpectedReturnDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={commonInputClasses} /></div><button onClick={handleBorrowSubmit} className={`${primaryButtonClasses} w-full`}>Confirm Borrow</button></div></Modal>
      <Modal isOpen={isPrinterReserveModalOpen} onClose={() => setIsPrinterReserveModalOpen(false)} title={`Reserve Printer: ${selectedPrinterToReserve?.name}`} size="lg"><div className="space-y-3"><div><label htmlFor="resDate" className="block text-sm font-medium text-neutral-dark mb-1">Date:</label><input type="date" id="resDate" value={printerReservationDate} onChange={e => setPrinterReservationDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={commonInputClasses} /></div><div><label htmlFor="resTimeSlot" className="block text-sm font-medium text-neutral-dark mb-1">Start Time Slot:</label><select id="resTimeSlot" value={printerReservationTimeSlotId} onChange={e => setPrinterReservationTimeSlotId(e.target.value)} className={commonInputClasses} ><option value="">Select a time slot</option>{availableSlotsForPrinterModal.map(slot => <option key={slot.id} value={slot.id}>{slot.startTime} - {slot.endTime}</option>)}{availableSlotsForPrinterModal.length === 0 && !printerReservationTimeSlotId && <option disabled>No slots available</option>}{printerReservationTimeSlotId && !availableSlotsForPrinterModal.find(s => s.id === printerReservationTimeSlotId) && TIME_SLOTS_8_TO_4_30_MIN.find(s => s.id === printerReservationTimeSlotId) && (<option value={printerReservationTimeSlotId}>{TIME_SLOTS_8_TO_4_30_MIN.find(s => s.id === printerReservationTimeSlotId)?.startTime} - {TIME_SLOTS_8_TO_4_30_MIN.find(s => s.id === printerReservationTimeSlotId)?.endTime} (Selected)</option>)}</select></div><div><label htmlFor="resDuration" className="block text-sm font-medium text-neutral-dark mb-1">Duration (30-min slots):</label><input type="number" id="resDuration" value={printerReservationDurationSlots} onChange={e => setPrinterReservationDurationSlots(Math.max(1, parseInt(e.target.value) || 1))} min="1" className={commonInputClasses} /></div><div><label htmlFor="filamentNeeded" className="block text-sm font-medium text-neutral-dark mb-1">Filament Needed (grams):</label><input type="number" id="filamentNeeded" value={filamentNeeded} onChange={e => setFilamentNeeded(Math.max(0, parseInt(e.target.value) || 0))} min="0" className={commonInputClasses} disabled={usesOwnFilament}/></div><div className="flex items-center"><input type="checkbox" id="ownFilament" checked={usesOwnFilament} onChange={e => setUsesOwnFilament(e.target.checked)} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary mr-2"/><label htmlFor="ownFilament" className="text-sm font-medium text-neutral-dark">I will use my own filament</label></div><button onClick={handlePrinterReserveSubmit} className={`${secondaryButtonClasses} w-full`}>Submit Request</button></div></Modal>
      <Modal isOpen={isAddLecturerModalOpen} onClose={() => setIsAddLecturerModalOpen(false)} title="Add New Lecturer">
        <form className="space-y-4" onSubmit={handleAddLecturerSubmit}>
          <div><label htmlFor="lecturerNameModal" className="block text-sm font-medium text-neutral-dark mb-1">Lecturer Name:</label><input type="text" id="lecturerNameModal" value={lecturerName} onChange={e => setLecturerName(e.target.value)} className={commonInputClasses} /></div><div><label htmlFor="lecturerPassModal" className="block text-sm font-medium text-neutral-dark mb-1">Password:</label><input type="password" id="lecturerPassModal" value={lecturerPassword} onChange={e => setLecturerPassword(e.target.value)} className={commonInputClasses} /></div><button type="submit" className={`${primaryButtonClasses} w-full`}>Add Lecturer</button>
        </form>
      </Modal>
      <Modal isOpen={isAddItemModalOpen} onClose={() => setIsAddItemModalOpen(false)} title="Add New Inventory Item"><div className="space-y-4"><div><label htmlFor="itemNameModal" className="block text-sm font-medium text-neutral-dark mb-1">Item Name:</label><input type="text" id="itemNameModal" value={itemName} onChange={e => setItemName(e.target.value)} className={commonInputClasses} /></div><div><label htmlFor="itemQtyModal" className="block text-sm font-medium text-neutral-dark mb-1">Quantity:</label><input type="number" id="itemQtyModal" value={itemQuantity} onChange={e => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))} min="1" className={commonInputClasses} /></div><button onClick={handleAddItemSubmit} className={`${primaryButtonClasses} w-full`}>Add Item</button></div></Modal>
      
      <Modal isOpen={isLabReserveModalOpen} onClose={() => setIsLabReserveModalOpen(false)} title="Book Lab Space" size="md">
        <div className="space-y-4">
            <div><label htmlFor="labResDate" className="block text-sm font-medium text-neutral-dark mb-1">Date:</label><input type="date" id="labResDate" value={labReservationDate} onChange={e => setLabReservationDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={commonInputClasses} /></div>
            <div><label htmlFor="labResTimeSlot" className="block text-sm font-medium text-neutral-dark mb-1">Time Slot (1 hour):</label>
                <select id="labResTimeSlot" value={labReservationTimeSlotId} onChange={e => setLabReservationTimeSlotId(e.target.value)} className={commonInputClasses} >
                    <option value="">Select a time slot</option>
                    {availableLabSlotsForModal.map(slot => <option key={slot.id} value={slot.id}>{slot.startTime} - {slot.endTime}</option>)}
                    {availableLabSlotsForModal.length === 0 && !labReservationTimeSlotId && <option disabled>No slots available for this date</option>}
                    {labReservationTimeSlotId && !availableLabSlotsForModal.find(s => s.id === labReservationTimeSlotId) && LAB_TIME_SLOTS_1_HOUR.find(s=>s.id === labReservationTimeSlotId) && (<option value={labReservationTimeSlotId}>{LAB_TIME_SLOTS_1_HOUR.find(s=>s.id === labReservationTimeSlotId)?.startTime} - {LAB_TIME_SLOTS_1_HOUR.find(s=>s.id === labReservationTimeSlotId)?.endTime} (Selected)</option>)}
                </select>
            </div>
            <div><label htmlFor="labResPurpose" className="block text-sm font-medium text-neutral-dark mb-1">Purpose:</label>
                <select id="labResPurpose" value={labReservationPurpose} onChange={e => setLabReservationPurpose(e.target.value as ReservationPurpose)} className={commonInputClasses}>
                    {Object.values(ReservationPurpose).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            {labReservationPurpose === ReservationPurpose.OTHER && (
                <div><label htmlFor="otherPurpose" className="block text-sm font-medium text-neutral-dark mb-1">Details for 'Other':</label><input type="text" id="otherPurpose" value={otherPurposeDetails} onChange={e => setOtherPurposeDetails(e.target.value)} className={commonInputClasses} placeholder="Specify purpose" /></div>
            )}
            <button onClick={handleLabReserveSubmit} className={`${primaryButtonClasses} w-full`}>Request Booking</button>
        </div>
      </Modal>

      {/* Password Change Modal */}
      <Modal isOpen={changePasswordModalOpen} onClose={() => setChangePasswordModalOpen(false)} title={changePasswordTargetUser ? `Change Password for ${changePasswordTargetUser.name}` : 'Change Password'}>
        <form className="space-y-4" onSubmit={handleChangePasswordSubmit}>
          {!changePasswordTargetUser && (
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-neutral-dark mb-1">Current Password:</label>
              <input type="password" id="currentPassword" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={commonInputClasses} required />
            </div>
          )}
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-neutral-dark mb-1">New Password:</label>
            <input type="password" id="newPassword" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={commonInputClasses} required />
          </div>
          <div>
            <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-neutral-dark mb-1">Confirm New Password:</label>
            <input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className={commonInputClasses} required />
          </div>
          <button type="submit" className={`${primaryButtonClasses} w-full`} disabled={changePasswordLoading}>{changePasswordLoading ? 'Saving...' : 'Change Password'}</button>
        </form>
      </Modal>
      <Modal isOpen={isRefillModalOpen} onClose={() => setIsRefillModalOpen(false)} title={`Refill Filament for ${refillTargetPrinter?.name || ''}`}>
        <form onSubmit={handleRefillSubmit} className="space-y-4">
          <div>
            <label htmlFor="refillAmount" className="block text-sm font-medium text-neutral-dark mb-1">New Filament Amount (grams):</label>
            <input id="refillAmount" type="number" min={0} value={refillAmount} onChange={e => setRefillAmount(Math.max(0, parseInt(e.target.value) || 0))} className={commonInputClasses} required />
          </div>
          <div>
            <label htmlFor="refillType" className="block text-sm font-medium text-neutral-dark mb-1">Filament Type:</label>
            <input id="refillType" type="text" value={refillFilamentType} onChange={e => setRefillFilamentType(e.target.value)} className={commonInputClasses} required />
          </div>
          <button type="submit" className={`${primaryButtonClasses} w-full`} disabled={refillLoading}>{refillLoading ? 'Refilling...' : 'Refill'}</button>
        </form>
      </Modal>
    </div>
  );
}

export default Dashboard;